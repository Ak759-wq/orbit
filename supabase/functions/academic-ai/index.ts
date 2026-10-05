// ============================================================
// Deno edge function: academic-ai  (OpenRouter)
// Orbit AI — grounded academic assistant. Flow:
//   1. Verify the caller's Supabase JWT (401 if invalid).
//   2. Classify the question → GENERAL | ORBIT | MIXED, selecting
//      ONLY the relevant data for the database paths.
//   3. Load that data with the caller's own token (RLS-scoped) —
//      the assistant can never see another user's records.
//   4. PRE-COMPUTE every number (averages, attendance %, completion,
//      study hours) here so the model explains real values and never
//      invents them.
//   5. Send system prompt + context + history to OpenRouter chat/
//      completions (OPENROUTER_API_KEY secret — the only AI secret).
//   6. Return the answer. Technical errors are logged server-side;
//      the client only ever sees a friendly message.
// Models: the selector list is built LIVE from OpenRouter's catalog
// (only $0-priced models); default is the 'openrouter/free' router.
// ============================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';
const MAX_CONTEXT_CHARS = 22000;
const MAX_HISTORY_TURNS = 6; // recent user+assistant messages kept

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const GENERIC_ERROR = 'Orbit AI is temporarily unavailable. Please try again in a moment.';
const RATE_LIMIT_ERROR = 'Free AI usage limit reached. Please try again later.';
const ALL_FREE_DOWN = 'Free AI models are temporarily unavailable. Please try again later.';
const CONFIG_ERROR = 'OPENROUTER_API_KEY is not configured';

// OpenRouter status → safe, human-readable error (detail logged server-side).
function errorFor(status: number): { error: string; code: string } {
  switch (status) {
    case 401: return { error: 'OpenRouter API key is invalid or missing.', code: 'OPENROUTER_AUTH' };
    case 402: return { error: 'This model requires paid credits. Please select a free model.', code: 'MODEL_REQUIRES_CREDITS' };
    case 404: return { error: 'The selected AI model is unavailable.', code: 'MODEL_NOT_FOUND' };
    case 429: return { error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' };
    default: return { error: 'OpenRouter is temporarily unavailable. Please try again.', code: 'OPENROUTER_ERROR' };
  }
}

// ============================================================
// OpenRouter — the ONLY AI provider (secret: OPENROUTER_API_KEY)
// ============================================================
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'openrouter/free'; // router pseudo-model: auto-picks an available free model
const MODELS_CACHE_TTL_MS = 10 * 60 * 1000;
type FreeModel = { id: string; name: string; provider: string; contextLength: number | null };
let modelsCache: { at: number; models: FreeModel[] } | null = null;

function providerOf(id: string, name: string): string {
  const colon = name.indexOf(': ');
  if (colon > 0) return name.slice(0, colon);
  return id.split('/')[0];
}

// Live catalog → ONLY models whose pricing is actually $0 (prompt AND
// completion). Nothing is hard-coded: the selector follows OpenRouter's
// API, and models that stop being free disappear from the list.
async function fetchFreeModels(): Promise<FreeModel[]> {
  if (modelsCache && Date.now() - modelsCache.at < MODELS_CACHE_TTL_MS) return modelsCache.models;
  const res = await fetch(`${OPENROUTER_BASE}/models`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`model catalog ${res.status}`);
  const data = await res.json();
  const models: FreeModel[] = (data?.data ?? [])
    .filter((m: any) => m?.pricing?.prompt === '0' && m?.pricing?.completion === '0' && typeof m?.id === 'string' && m.id !== DEFAULT_MODEL)
    .map((m: any) => ({
      id: m.id,
      name: String(m.name ?? m.id).replace(/\s*\(free\)\s*$/i, ''),
      provider: providerOf(m.id, String(m.name ?? '')),
      contextLength: typeof m.context_length === 'number' ? m.context_length : null,
    }))
    .sort((a: FreeModel, b: FreeModel) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name))
    .slice(0, 40);
  modelsCache = { at: Date.now(), models };
  return models;
}

// Validate the selected model against the live free list. Returns the
// model id to send (null → default router) plus whether we had to
// fall back because the request is no longer free/available.
async function resolveModel(selected?: string): Promise<{ model: string | null; fallback: boolean }> {
  if (!selected || selected === DEFAULT_MODEL) return { model: null, fallback: false };
  try {
    const free = await fetchFreeModels();
    if (free.some((m) => m.id === selected)) return { model: selected, fallback: false };
  } catch { /* catalog unreachable → fail safe to the default router */ }
  return { model: null, fallback: true };
}

// One chat-completions call. Never leaks key/detail to the client —
// errors are tagged with an HTTP status and logged server-side only.
async function callOpenRouter(apiKey: string, model: string | null, messages: Array<{ role: string; content: string }>) {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://orbit-scholar-os.vercel.app',
        'X-Title': 'Orbit Academic OS',
      },
      body: JSON.stringify({
        model: model ?? DEFAULT_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[academic-ai] OpenRouter ${res.status}: ${detail.slice(0, 500)}`); // server-side only
      return { ok: false as const, status: res.status, detail };
    }
    const data = await res.json();
    const answer: string = (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!answer) {
      console.error('[academic-ai] empty OpenRouter response', JSON.stringify(data).slice(0, 300));
      return { ok: false as const, status: 502, detail: 'empty response' };
    }
    return { ok: true as const, answer, modelUsed: String(data?.model ?? model ?? DEFAULT_MODEL) };
  } catch (e) {
    console.error('[academic-ai] OpenRouter network failure:', e instanceof Error ? e.message : e);
    return { ok: false as const, status: 0, detail: 'network failure' };
  }
}

function pct(part: number | null, total: number): number | null {
  if (part == null || !total || total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

function isoDays(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const subName = (s: any) => (s?.subject && typeof s.subject === 'object' ? s.subject.name : s?.subject) ?? '';

// ---------- server "now" in the user's timezone ----------
function nowInTimeZone(tz?: string) {
  try {
    const d = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz && tz !== 'local' ? tz : undefined,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long',
    });
    const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
    const hh = parts.hour === '24' ? '00' : parts.hour;
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${hh}:${parts.minute}`,
      weekday: parts.weekday,
      minutes: Number(hh) * 60 + Number(parts.minute),
    };
  } catch {
    const d = new Date();
    return {
      date: d.toISOString().slice(0, 10),
      time: d.toISOString().slice(11, 16),
      weekday: DAY_NAMES[d.getDay()],
      minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    };
  }
}

// ---------- intent classification: which data does the question need? ----------
type Intent = {
  profile: boolean; subjects: boolean; schedule: boolean; events: boolean;
  tests: boolean; assignments: boolean; attendance: boolean; sessions: boolean;
  goals: boolean; resources: boolean; hackathons: boolean;
};

const RULES: Array<[RegExp, keyof Intent]> = [
  [/hackathon|competition|workshop|webinar|conference|contest\b|event(s)? (coming|upcoming|this|next)|register|deadline for|eligible/i, 'hackathons'],
  [/class(es)?|schedule|timetable|tomorrow|today|next class|free period|lunch|lecture|lab/i, 'schedule'],
  [/calendar|holiday|assessment|internal|exam|semester|cia|freeze|convocation|committee|yoga day|results/i, 'events'],
  [/test|score|marks|grade|average|lowest|highest|performance|trend|percent/i, 'tests'],
  [/assignment|homework|task|due|overdue|submission|project\b/i, 'assignments'],
  [/attend|absent|present|missed classes|bunk/i, 'attendance'],
  [/study|planner|session|revision|plan/i, 'sessions'],
  [/goal|target/i, 'goals'],
  [/note|resource|link|material/i, 'resources'],
];

function classify(question: string): Intent {
  const intent: Intent = {
    profile: true, subjects: false, schedule: false, events: false,
    tests: false, assignments: false, attendance: false, sessions: false,
    goals: false, resources: false, hackathons: false,
  };
  // Subjects are needed whenever the question names or implies them.
  intent.subjects = true;
  for (const [re, key] of RULES) if (re.test(question)) (intent as any)[key] = true;
  // If nothing matched beyond the defaults, give a compact overview.
  if (!intent.schedule && !intent.events && !intent.tests && !intent.assignments &&
      !intent.attendance && !intent.sessions && !intent.goals && !intent.resources && !intent.hackathons) {
    intent.schedule = intent.events = intent.tests = intent.assignments = intent.attendance = true;
  }
  return intent;
}

// ---------- scoped data load ----------
async function loadUserData(supabase: any, intent: Intent, userId: string) {
  const jobs: Promise<any>[] = [supabase.from('profiles').select('*').maybeSingle()];
  // Track each query's key alongside it so skipped intents never shift
  // result positions (keys[i] must always match jobs[i+1]).
  const keys: string[] = [];
  const push = (key: string, q: Promise<any>) => { keys.push(key); jobs.push(q); };
  if (intent.subjects) push('subjects', supabase.from('subjects').select('*').order('name'));
  if (intent.schedule) push('class_schedule', supabase.from('class_schedule').select('*, subject:subjects(name, code)').order('day_of_week'));
  if (intent.events) push('academic_events', supabase.from('academic_events').select('*').order('start_date'));
  if (intent.tests) push('tests', supabase.from('tests').select('*, subject:subjects(name)').order('test_date'));
  if (intent.assignments) push('assignments', supabase.from('assignments').select('*, subject:subjects(name)').order('due_date'));
  if (intent.attendance) push('attendance', supabase.from('attendance').select('*, subject:subjects(name)').order('class_date'));
  if (intent.sessions) push('study_sessions', supabase.from('study_sessions').select('*, subject:subjects(name)').order('session_date'));
  if (intent.goals) push('goals', supabase.from('goals').select('*, subject:subjects(name)').order('created_at'));
  if (intent.resources) push('resources', supabase.from('resources').select('*').order('date_added'));
  if (intent.hackathons) {
    push('events', supabase.from('events').select('*').order('start_date'));
    push('event_bookmarks', supabase.from('event_bookmarks').select('*'));
  }
  const [profile, ...rest] = (await Promise.all(jobs)).map((r) => (r.error ? { error: r.error.message } : r));
  void userId;
  const out: Record<string, any[]> = {};
  keys.forEach((k, i) => { if (rest[i]) out[k] = rest[i].data ?? []; });
  return { profile: profile?.data ?? null, tables: out };
}

// ---------- pre-computed numbers (the model must not invent them) ----------
function computedStats(tables: Record<string, any[]>, now: ReturnType<typeof nowInTimeZone>) {
  const out: string[] = [];
  const tests = tables.tests ?? [];
  const graded = tests.filter((t: any) => t.marks_obtained != null);
  if (graded.length) {
    const bySubject = new Map<string, number[]>();
    for (const t of graded) {
      const s = subName(t) || 'General';
      const p = pct(t.marks_obtained, t.max_marks);
      if (p != null) (bySubject.get(s) ?? bySubject.set(s, []).get(s)!).push(p);
    }
    const overall = pct(graded.reduce((n: number, t: any) => n + pct(t.marks_obtained, t.max_marks)!, 0), graded.length) ?? null;
    // recompute properly (avg of percentages, not pct of sums)
    const allP = graded.map((t: any) => pct(t.marks_obtained, t.max_marks)!).filter((x) => x != null);
    const avgAll = Math.round((allP.reduce((a, b) => a + b, 0) / allP.length) * 10) / 10;
    out.push(`TEST STATISTICS (pre-computed — use these exact numbers):`);
    out.push(`  - Overall average: ${avgAll}% across ${allP.length} graded test(s)${overall === null ? '' : ''}`);
    for (const [subj, ps] of bySubject) {
      const avg = Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 10) / 10;
      out.push(`  - ${subj}: average ${avg}% over ${ps.length} test(s) (high ${Math.max(...ps)}%, low ${Math.min(...ps)}%)`);
    }
    void avgAll;
  } else {
    out.push('TEST STATISTICS: no graded tests recorded.');
  }

  const att = tables.attendance ?? [];
  // HARD RULE (mirrors ATTENDANCE_START_DATE in src/lib/calc.js): the
  // attendance period starts on this date — records before it are
  // stored but never counted, so AI answers match the app exactly.
  const ATTENDANCE_START_DATE = '2026-08-25';
  const attValid = att.filter((r: any) => !r.class_date || r.class_date >= ATTENDANCE_START_DATE);
  const attExcluded = att.length - attValid.length;
  if (attValid.length) {
    const bySubject = new Map<string, { p: number; t: number }>();
    for (const r of attValid) {
      const s = subName(r) || 'General';
      const e = bySubject.get(s) ?? { p: 0, t: 0 };
      e.t += 1; if (r.status === 'present') e.p += 1;
      bySubject.set(s, e);
    }
    const tp = [...bySubject.values()].reduce((n, v) => n + v.p, 0);
    const tt = [...bySubject.values()].reduce((n, v) => n + v.t, 0);
    out.push(`ATTENDANCE PERIOD: from ${ATTENDANCE_START_DATE} to today (${attExcluded} earlier record(s) stored but not counted).`);
    out.push(`ATTENDANCE (pre-computed): overall ${tp}/${tt} = ${pct(tp, tt) ?? '—'}%`);
    // Pre-computed miss budget so the AI never derives this itself:
    // max n with present/(total+n) >= target  →  n = floor(p/target) - t.
    const overallBudget = Math.floor(tp / 0.75) - tt;
    out.push(`  - Miss budget (overall, at or above 75%): ${overallBudget >= 0 ? `you can miss up to ${overallBudget} more class(es) (missing ${overallBudget + 1} falls below)` : 'already below 75% — attend more classes'}`);
    const reqBySubject = new Map<string, number>((tables.subjects ?? []).map((s: any) => [s.name, s.attendance_required_pct ?? 75]));
    for (const [s, v] of bySubject) {
      const req = (reqBySubject.get(s) ?? 75) / 100;
      const budget = Math.floor(v.p / req) - v.t;
      out.push(`  - ${s}: ${v.p}/${v.t} = ${pct(v.p, v.t) ?? '—'}% (miss budget at or above ${Math.round(req * 100)}%: ${budget >= 0 ? budget : 'below target — cannot miss any'})`);
    }
  } else {
    out.push(`ATTENDANCE: no records in the period from ${ATTENDANCE_START_DATE} onward.`);
  }

  const assigns = tables.assignments ?? [];
  if (assigns.length) {
    const done = assigns.filter((a: any) => a.status === 'completed').length;
    const overdue = assigns.filter((a: any) => a.status !== 'completed' && a.due_date < now.date).length;
    out.push(`ASSIGNMENT SUMMARY (pre-computed): ${assigns.length} total, ${done} completed (${pct(done, assigns.length) ?? 0}%), ${overdue} overdue.`);
  }

  const sessions = tables.study_sessions ?? [];
  if (sessions.length) {
    const mins = (s: any) => {
      const [sh, sm] = String(s.start_time).split(':').map(Number);
      const [eh, em] = String(s.end_time).split(':').map(Number);
      return Math.max((eh * 60 + em) - (sh * 60 + sm), 0);
    };
    const total = sessions.reduce((n: number, s: any) => n + mins(s), 0);
    const done = sessions.filter((s: any) => s.status === 'completed').reduce((n: number, s: any) => n + mins(s), 0);
    const week = sessions.filter((s: any) => s.session_date >= isoDaysAdd(now.date, -(new Date(now.date).getDay() + 6) % 7) && s.session_date <= now.date);
    out.push(`STUDY HOURS (pre-computed): planned ${fmtH(total)}, completed ${fmtH(done)}, this week ${fmtH(week.reduce((n: number, s: any) => n + mins(s), 0))}.`);
  }
  return out.join('\n');
}

function isoDaysAdd(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtH(mins: number): string {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ---------- structured context builder ----------
function buildContext(profile: any, tables: Record<string, any[]>, now: ReturnType<typeof nowInTimeZone>, timezone: string): string {
  const sections: string[] = [];
  const sec = (title: string, body: string) => { if (body.trim()) sections.push(`## ${title}\n${body.trim()}`); };
  const list = (rows: any[], render: (r: any) => string) => rows.map(render).join('\n');

  sections.push(`CURRENT DATE/TIME (student timezone: ${timezone}):\n- Today is ${now.weekday}, ${now.date}, local time ${now.time}.\n- "today" = ${now.date}; "tomorrow" = ${isoDaysAdd(now.date, 1)}.`);

  if (profile) {
    sections.push(`STUDENT:\n${profile.full_name || 'Unknown'}${profile.college ? `, ${profile.college}` : ''}${profile.program ? `, ${profile.program}` : ''}${profile.branch ? ` ${profile.branch}` : ''}${profile.semester ? `, ${profile.semester}` : ''}`);
  }

  const subjects = tables.subjects ?? [];
  if (subjects.length) sec('SUBJECTS', list(subjects, (s: any) => `- ${s.name}${s.code ? ` [${s.code}]` : ''}`));

  const sched = tables.class_schedule ?? [];
  if (sched.length) {
    const byDay = new Map<number, string[]>();
    for (const s of sched) {
      const line = `${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)} ${s.subject?.name ?? subName(s)}${s.room ? ` @ ${s.room}` : ''}${s.notes ? ` (${s.notes.split('·')[0].trim()})` : ''}`;
      (byDay.get(s.day_of_week) ?? byDay.set(s.day_of_week, []).get(s.day_of_week)!).push(line);
    }
    sec('WEEKLY SCHEDULE (times are in the student timezone)',
      [...byDay.entries()].sort((a, b) => a[0] - b[0])
        .map(([d, lines]) => `${DAY_NAMES[d]}:\n${lines.map((l) => `  - ${l}`).join('\n')}`)
        .join('\n'));
  }

  const events = tables.academic_events ?? [];
  if (events.length) {
    const upcoming = events
      .filter((e: any) => e.start_date >= now.date || e.end_date >= now.date)
      .slice(0, 18)
      .map((e: any) => {
        const d = isoDays(now.date, e.start_date);
        return `- ${e.title} (${e.event_type}) ${e.start_date}${e.end_date !== e.start_date ? ` → ${e.end_date}` : ''}${d >= 0 ? ` · in ${d} day(s)` : ' · ongoing'}${/tentative/i.test(e.description || '') ? ' · TENTATIVE' : ''}`;
      })
      .join('\n');
    sec('ACADEMIC CALENDAR (upcoming)', upcoming || 'No upcoming events.');
  }

  const tests = tables.tests ?? [];
  if (tests.length) {
    sec('TESTS', list(tests, (t: any) => {
      const p = t.marks_obtained != null ? pct(t.marks_obtained, t.max_marks) : null;
      return `- ${t.name} | ${subName(t) || '—'} | ${t.test_type} | ${t.test_date} | ${t.marks_obtained ?? 'ungraded'}/${t.max_marks}${p != null ? ` = ${p}%` : ''}${t.topic ? ` | topic: ${t.topic}` : ''}`;
    }));
  }

  const assigns = tables.assignments ?? [];
  if (assigns.length) {
    sec('ASSIGNMENTS', list(assigns, (a: any) => {
      const d = isoDays(now.date, a.due_date);
      const flag = a.status !== 'completed' && d < 0 ? ' | OVERDUE' : a.status !== 'completed' && d === 0 ? ' | DUE TODAY' : a.status !== 'completed' && d === 1 ? ' | DUE TOMORROW' : '';
      return `- ${a.title} | ${subName(a) || '—'} | due ${a.due_date} | ${a.status}${flag}`;
    }));
  }

  const att = tables.attendance ?? [];
  if (att.length) {
    sec('ATTENDANCE RECORDS (per-subject aggregates are in the pre-computed stats)', list(att.slice(-30), (r: any) => `- ${r.class_date} ${subName(r) || ''}: ${r.status}`));
  }

  const sessions = tables.study_sessions ?? [];
  if (sessions.length) {
    sec('STUDY SESSIONS (recent)', list(sessions.slice(-15), (s: any) => `- ${s.session_date} ${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)} ${subName(s) || ''}: ${s.topic || 'session'} [${s.status}]${s.goal ? ` goal: ${s.goal}` : ''}`));
  }

  const goals = tables.goals ?? [];
  if (goals.length) {
    sec('GOALS', list(goals, (g: any) => `- ${g.name} (${g.goal_type}${g.subject ? `, ${subName(g)}` : ''}): ${g.current_value}/${g.target_value}${g.deadline ? ` by ${g.deadline}` : ''}`));
  }

  const resources = tables.resources ?? [];
  if (resources.length) {
    sec('NOTES & RESOURCES', list(resources.slice(-12), (r: any) => `- [${r.resource_type}] ${r.title}${r.url ? `: ${r.url}` : ''}`));
  }

  const hackathons = tables.events ?? [];
  if (hackathons.length) {
    const bookmarks = tables.event_bookmarks ?? [];
    const trackById = new Map(bookmarks.map((b: any) => [b.event_id, b.track_status]));
    sec('EVENTS DATABASE (hackathons/competitions/workshops)', list(hackathons, (e: any) => {
      const reg = e.reg_deadline ? isoDays(now.date, e.reg_deadline) : null;
      return `- ${e.title} | ${e.event_type} | ${e.organizer || 'organizer not specified'} | ${e.start_date ?? 'date TBA'}${e.reg_deadline ? ` | reg deadline ${e.reg_deadline} (${reg < 0 ? 'PASSED' : reg === 0 ? 'TODAY' : `in ${reg} day(s)`})` : ''} | ${e.mode}${bookmarks.has(e.id) ? ` | SAVED (${trackById.get(e.id)})` : ''}${e.eligibility ? ` | eligibility: ${e.eligibility}` : ''}${e.prize ? ` | prize: ${e.prize}` : ''}`;
    }));
  }

  let out = sections.join('\n\n');
  if (out.length > MAX_CONTEXT_CHARS) out = out.slice(0, MAX_CONTEXT_CHARS) + '\n…(truncated)';
  return out;
}

// ---------- question routing: GENERAL | ORBIT | MIXED ----------
// Orbit data is a source of personal context, not a limitation. General
// questions skip the database entirely; personal markers route to Orbit
// data; general-knowledge verbs on top of personal context mean MIXED.
function classifyQuestion(question: string, history: Array<{ role: string; text: string }>): 'general' | 'orbit' | 'mixed' {
  const text = question.toLowerCase();
  const personal =
    /\bmy\b|\bmine\b|i have|i've|when (is|are) (my|the) next|\bdo i have\b|\bam i\b/.test(text) ||
    /what (classes|tests|assignments|events|subjects) (do i|am i|should i)/.test(text) ||
    /how (is|many|much) (my|\w+ )?(attendance|classes)/.test(text) ||
    /\bcoming up\b|\bdue\b|\bnext class\b|\btimetable\b|\bmy schedule\b/.test(text) ||
    (/\b(average|attendance|test|exam|class|assignment|event|grade|marks|score|subject)\b/.test(text) && /\bmy\b/.test(text));

  if (personal) {
    const generalAsk =
      /(explain|why\b|how (can|do|should)|ideas|tips|improve|plan|prepare|revise|study|write|suggest|difference between|strategy)/.test(text);
    return generalAsk ? 'mixed' : 'orbit';
  }

  // Follow-up continuity: a short orbit-ish question right after personal
  // questions stays in Orbit context ("what about tomorrow?").
  const histUser = history.filter((h) => h.role === 'user').slice(-3).map((h) => h.text.toLowerCase());
  const histPersonal = histUser.some((h) => /\bmy\b|i have|due|attendance|coming up|next class|my (test|class|average|schedule)/.test(h));
  const orbitNoun = /(tomorrow|today|tonight|next|due|average|attendance|class|test|exam|assignment|event|schedule|subject)/.test(text);
  if (histPersonal && orbitNoun && text.split(/\s+/).length <= 12) return 'mixed';

  return 'general';
}

const SYSTEM_PROMPT = `You are Orbit AI, a general-purpose AI assistant integrated into Orbit Academic OS.

You have two sources of capability:

1. General AI knowledge and reasoning.
2. The authenticated student's private Orbit academic data.

You can answer normal general-purpose questions such as programming, mathematics, science, technology, writing, explanations, brainstorming, and general knowledge.

When a question requires personal information about the student, use the provided Orbit data.

Orbit data is private and belongs only to the currently authenticated user.

Never invent personal academic information.

If the requested personal information is not present in Orbit, clearly say that it is not available.

For general questions, answer normally even when no Orbit data is relevant.

For mixed questions, combine the user's Orbit data with general knowledge.

Do not unnecessarily mention Orbit or the database when answering ordinary general questions.

Use Orbit data only when it is relevant.

When answering questions about dates, use the current server date and the user's timezone.

When calculations involve the student's academic records, prefer the PRE-COMPUTED statistics included in the context and use those exact numbers.

Never fabricate tests, marks, attendance, assignments, classes, events, or other personal records.

Keep answers concise and useful (short paragraphs or bullets).`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ---- GET → health + live free-model list for the selector ----
  if (req.method === 'GET') {
    if (!OPENROUTER_API_KEY) {
      return json({ online: false, provider: 'OpenRouter', configured: false, models: [], error: CONFIG_ERROR }, 501);
    }
    try {
      const models = await fetchFreeModels();
      return json({
        online: true,
        provider: 'OpenRouter',
        freeModelsAvailable: models.length > 0,
        defaultModel: DEFAULT_MODEL,
        models: [{ id: DEFAULT_MODEL, name: 'OpenRouter Free', provider: 'OpenRouter', contextLength: null }, ...models],
      });
    } catch (e) {
      console.error('[academic-ai] model list failed:', e instanceof Error ? e.message : e);
      return json({ online: false, provider: 'OpenRouter', models: [], error: GENERIC_ERROR }, 502);
    }
  }

  if (req.method !== 'POST') return json({ success: false, error: 'POST only', code: 'METHOD_NOT_ALLOWED' }, 405);

  if (!OPENROUTER_API_KEY) {
    return json({ success: false, error: CONFIG_ERROR, code: 'AI_NOT_CONFIGURED' }, 501);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ success: false, error: 'Your session has expired. Please sign in again.', code: 'UNAUTHENTICATED' }, 401);
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    // The ONLY identity source is the verified JWT — never a user_id field.
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ success: false, error: 'Your session has expired. Please sign in again.', code: 'UNAUTHENTICATED' }, 401);
    }

    let question = '';
    let timezone = 'local';
    let selectedModel: string | undefined;
    let history: Array<{ role: 'user' | 'assistant'; text: string }> = [];
    try {
      const body = await req.json();
      question = typeof body?.message === 'string' ? body.message.slice(0, 2000) : '';
      timezone = typeof body?.timezone === 'string' ? body.timezone : (userData.user.user_metadata?.timezone ?? 'local');
      selectedModel = typeof body?.model === 'string' ? body.model.slice(0, 120) : undefined;
      if (Array.isArray(body?.history)) {
        history = body.history
          .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
          .slice(-MAX_HISTORY_TURNS)
          .map((h: any) => ({ role: h.role, text: h.text.slice(0, 1500) }));
      }
    } catch {
      return json({ success: false, error: 'Expected a JSON body with a "message" field.', code: 'BAD_REQUEST' }, 400);
    }
    if (!question.trim()) return json({ success: false, error: 'Question is empty.', code: 'BAD_REQUEST' }, 400);

    const now = nowInTimeZone(timezone);
    const mode = classifyQuestion(question, history);

    // GENERAL questions skip the Orbit database entirely — the model answers
    // from general knowledge with no personal context loaded.
    let context = '';
    let stats = '';
    if (mode !== 'general') {
      const intent = classify(question);
      const { profile, tables } = await loadUserData(supabase, intent, userData.user.id);
      stats = computedStats(tables, now);
      context = buildContext(profile, tables, now, timezone);
    }

    // ---- messages for OpenRouter (OpenAI-compatible schema) ----
    const dateLine = `CURRENT DATE/TIME (student timezone: ${timezone}): Today is ${now.weekday}, ${now.date}, local time ${now.time}.`;
    const finalUser = mode === 'general'
      ? `${dateLine}\n\nUSER QUESTION: ${question}`
      : `${context}\n\n${stats}\n\nUSER QUESTION: ${question}`;
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map((h) => ({ role: h.role, content: h.text })),
      { role: 'user', content: finalUser },
    ];

    // Validate the selector choice server-side (only $0 models pass).
    const resolved = await resolveModel(selectedModel);
    let result = await callOpenRouter(OPENROUTER_API_KEY, resolved.model, messages);
    let runtimeFallback = false;

    // Fallback chain — bounded, never infinite:
    //   1. chosen model failed (but not auth/credits/network) → retry via openrouter/free
    //   2. openrouter/free itself failed → retry ONCE via a currently-free model
    //   3. still failing → mapped, user-safe error
    if (!result.ok && resolved.model !== null && ![0, 401, 402].includes(result.status)) {
      console.error(`[academic-ai] falling back from ${resolved.model} to ${DEFAULT_MODEL}`);
      runtimeFallback = true;
      result = await callOpenRouter(OPENROUTER_API_KEY, null, messages);
    }
    if (!result.ok && [404, 429, 500, 502, 503].includes(result.status)) {
      const free = await fetchFreeModels().catch(() => [] as FreeModel[]);
      const alt = free[0]?.id;
      if (alt) {
        console.error(`[academic-ai] ${DEFAULT_MODEL} unavailable — retrying via ${alt}`);
        result = await callOpenRouter(OPENROUTER_API_KEY, alt, messages);
      }
    }

    if (!result.ok) {
      if (result.status === 401 || result.status === 402) {
        const mapped = errorFor(result.status);
        return json({ success: false, error: mapped.error, code: mapped.code }, 502);
      }
      if (result.status === 0) {
        return json({ success: false, error: 'OpenRouter is temporarily unavailable. Please try again.', code: 'OPENROUTER_ERROR' }, 502);
      }
      // The router and/or every free avenue failed — say so plainly.
      return json({ success: false, error: ALL_FREE_DOWN, code: 'FREE_MODELS_UNAVAILABLE' }, 502);
    }
    const payload: Record<string, unknown> = { success: true, message: result.answer, model: result.modelUsed };
    if (runtimeFallback || resolved.fallback) {
      payload.modelFallback = true;
      payload.modelFallbackMessage = 'Selected model unavailable. Switched to OpenRouter Free.';
    }
    return json(payload);
  } catch (err) {
    console.error('[academic-ai] unexpected error:', err instanceof Error ? err.message : err); // server-side only
    return json({ success: false, error: GENERIC_ERROR, code: 'INTERNAL_ERROR' }, 500);
  }
});
