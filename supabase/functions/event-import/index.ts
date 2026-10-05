// ============================================================
// Deno edge function: event-import
// AI event extraction from a pasted URL. Flow:
//   1. Verify the caller's Supabase JWT (401 if invalid).
//   2. Validate the URL and fetch the page SERVER-SIDE (never from
//      the browser: avoids CORS and blocks SSRF of internal hosts).
//   3. Strip HTML → readable text.
//   4. Ask the LLM to return STRICT JSON with the event fields,
//      leaving blanks for anything the page does not state.
//   5. Return the extraction. The CLIENT still requires explicit user
//      confirmation before saving; nothing is written to the DB here.
// Deploy: supabase functions deploy event-import
// Secrets: OPENROUTER_API_KEY (required) — the only AI secret
// ============================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';
const EVENT_MODEL = Deno.env.get('EVENT_IMPORT_MODEL') ?? 'openrouter/free';
const MAX_HTML_CHARS = 400_000;
const MAX_TEXT_CHARS = 16_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---------- SSRF guard: public web pages only ----------
function assertPublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Invalid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are supported.');
  const host = u.hostname.toLowerCase();
  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const blocked =
    host === 'localhost' || host === '0.0.0.0' ||
    host.endsWith('.local') || host.endsWith('.internal') ||
    isIPv4 || // bare IPs: private ranges and lookup-bypass attempts
    host.startsWith('['); // IPv6 literals
  if (blocked) throw new Error('This URL is not allowed. Paste a public event page URL.');
  return u;
}

// ---------- HTML → text ----------
function stripHtml(html: string): string {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  // capture links before dropping tags: URLs are valuable signal
  const linkRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const links: string[] = [];
  s = s.replace(linkRe, (_m, href: string, text: string) => {
    const label = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (label && /regist|apply|form|ticket/i.test(label) && links.length < 12) links.push(`${label}: ${href}`);
    return ` ${label} `;
  });
  s = s.replace(/<[^>]+>/g, ' ');
  const ents: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&#x27;': "'" };
  s = s.replace(/&(amp|lt|gt|quot|#39|x27|nbsp);/g, (m) => ents[m] ?? m);
  s = s.replace(/\s+/g, ' ').trim();
  if (links.length) s += '\n\nLinks found on the page:\n' + links.join('\n');
  return s.slice(0, MAX_TEXT_CHARS);
}

const SYSTEM_PROMPT = [
  'You extract structured event information from web page text for a student events tracker.',
  'Return ONLY a JSON object (no markdown, no commentary) with EXACTLY these keys:',
  '{"title":string,"organizer":string,"event_type":string,"description":string,"start_date":string|null,"end_date":string|null,"reg_deadline":string|null,"location":string,"mode":string,"reg_url":string,"eligibility":string,"prize":string,"skills":string[],"tags":string[],"contact":string,"requirements":string[]}',
  '',
  'RULES:',
  '- Dates must be ISO YYYY-MM-DD or null. If a date is ambiguous or missing, use null.',
  '- event_type must be exactly one of: Hackathon, Competition, Workshop, Webinar, Conference, College Event, Club Event, Coding Contest, AI Event, Other.',
  '- mode must be exactly one of: Online, Offline, Hybrid (default Online when unclear).',
  '- If a field is not stated on the page, use "" (or [] for arrays, null for dates). NEVER guess or invent values.',
  '- reg_url: the most likely registration link found in the page text/links; "" if none.',
  '- skills: topics/skills the event focuses on (max 6). tags: short lowercase labels (max 5). requirements: important eligibility/format requirements (max 5).',
  '- contact: publicly listed contact info; "" if none.',
].join('\n');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!OPENROUTER_API_KEY) {
    return json({
      error: 'AI extraction is not configured yet. The event-import function needs the OPENROUTER_API_KEY secret. Everything else works — you can add events manually.',
      setupRequired: true,
    }, 501);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization header.' }, 401);
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: 'Invalid or expired session.' }, 401);
    }

    let url = '';
    try {
      const body = await req.json();
      url = typeof body?.url === 'string' ? body.url.trim() : '';
    } catch {
      return json({ error: 'Expected a JSON body with a "url" field.' }, 400);
    }
    if (!url) return json({ error: 'URL is empty.' }, 400);

    let target: URL;
    try {
      target = assertPublicUrl(url);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Invalid URL.' }, 400);
    }

    // ---- server-side fetch (browser never sees the page) ----
    let html: string;
    try {
      const resp = await fetch(target.toString(), {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OrbitAcademicOS/1.0; +https://orbit-scholar-os.vercel.app)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      if (!resp.ok) return json({ error: `The page returned HTTP ${resp.status}. Check the URL and try again.` }, 400);
      const ct = resp.headers.get('content-type') ?? '';
      if (ct && !ct.includes('html') && !ct.includes('xml') && !ct.includes('text')) {
        return json({ error: 'That URL does not look like a web page.' }, 400);
      }
      html = (await resp.text()).slice(0, MAX_HTML_CHARS);
    } catch {
      return json({ error: 'Could not fetch that page (it may be blocking automated access). Try a different URL or add the event manually.' }, 400);
    }

    const text = stripHtml(html);
    if (text.length < 80) {
      return json({ error: 'The page had little readable content. It may be JavaScript-rendered — add the event manually instead.' }, 400);
    }

    // ---- OpenRouter extraction (JSON; strict prompt, parsed below) ----
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://orbit-scholar-os.vercel.app',
        'X-Title': 'Orbit Academic OS',
      },
      body: JSON.stringify({
        model: EVENT_MODEL,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\nRespond with STRICT JSON only — no markdown fences, no prose.` },
          { role: 'user', content: `PAGE URL: ${target.toString()}\n\nPAGE TEXT:\n${text}` },
        ],
        temperature: 0,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });
    if (!aiRes.ok) {
      const detail = await aiRes.text().catch(() => '');
      console.error(`[event-import] OpenRouter ${aiRes.status}: ${detail.slice(0, 500)}`); // server-side only
      if (aiRes.status === 429) return json({ error: "You've reached the current free AI usage limit. Please try again later." }, 502);
      return json({ error: 'Orbit AI is temporarily unavailable. Please try again in a moment.' }, 502);
    }
    const aiJson = await aiRes.json();
    let raw = String(aiJson?.choices?.[0]?.message?.content ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: 'AI returned unreadable output. Try again or add the event manually.' }, 502);
    }

    // Normalize + hard-validate every field server-side.
    const clean = {
      title: String(data.title ?? '').slice(0, 160) || 'Untitled event',
      organizer: String(data.organizer ?? '').slice(0, 160),
      event_type: ['Hackathon', 'Competition', 'Workshop', 'Webinar', 'Conference', 'College Event', 'Club Event', 'Coding Contest', 'AI Event', 'Other']
        .includes(data.event_type) ? data.event_type : 'Other',
      description: String(data.description ?? '').slice(0, 2000),
      start_date: /^\d{4}-\d{2}-\d{2}$/.test(String(data.start_date ?? '')) ? data.start_date : null,
      end_date: /^\d{4}-\d{2}-\d{2}$/.test(String(data.end_date ?? '')) ? data.end_date : null,
      reg_deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(data.reg_deadline ?? '')) ? data.reg_deadline : null,
      location: String(data.location ?? '').slice(0, 160),
      mode: ['Online', 'Offline', 'Hybrid'].includes(data.mode) ? data.mode : 'Online',
      reg_url: /^https?:\/\//.test(String(data.reg_url ?? '')) ? data.reg_url : '',
      eligibility: String(data.eligibility ?? '').slice(0, 300),
      prize: String(data.prize ?? '').slice(0, 300),
      skills: Array.isArray(data.skills) ? data.skills.map((x: any) => String(x).slice(0, 40)).filter(Boolean).slice(0, 6) : [],
      tags: Array.isArray(data.tags) ? data.tags.map((x: any) => String(x).toLowerCase().slice(0, 24)).filter(Boolean).slice(0, 5) : [],
      contact: String(data.contact ?? '').slice(0, 200),
      requirements: Array.isArray(data.requirements) ? data.requirements.map((x: any) => String(x).slice(0, 200)).filter(Boolean).slice(0, 5) : [],
    };

    return json({ data: clean });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected server error.' }, 500);
  }
});
