// ============================================================
// Deno edge function: attendance-sync
// REAL recurring sync from the college attendance Google Sheet
// (Section A tab) — the single source of truth for attendance.
//
//   ATTENDANCE_SOURCE_URL — Google Sheets URL (Anyone with the link)
//     or a direct .csv link → exported to CSV server-side, parsed,
//     and matched to each user by USN == profiles.roll_number
//     → class-N → Nth timetable slot of that weekday (the user's own
//       class_schedule; deterministic tiebreak for parallel slots)
//     → orbit_sync_attendance() RPC: idempotent upsert, source
//       metadata, manual rows preserved, never deletes
//     → attendance_sync_logs row per run
//
// Triggers:
//   • pg_cron every 2h: header `x-sync-key: <SYNC_CRON_SECRET>`
//     → syncs every profile that has a roll_number present in the
//       source (each user receives ONLY their own row).
//   • Manual: any signed-in user calling functions.invoke() with
//     their JWT → syncs ONLY that user's own row.
//
// Secrets:
//   ATTENDANCE_SOURCE_URL — the live Google Sheets URL
//   SYNC_CRON_SECRET      — shared key for the scheduled trigger
// ============================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SOURCE_URL = Deno.env.get('ATTENDANCE_SOURCE_URL') ?? '';
const SYNC_KEY = Deno.env.get('SYNC_CRON_SECRET') ?? '';
// Verbose source-vs-Orbit reconciliation logging. Off in production
// unless ATTENDANCE_DEBUG=1 is set on the function's secrets.
const DEBUG = (Deno.env.get('ATTENDANCE_DEBUG') ?? '') === '1';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ------------------------------------------------------------
// Source loading: the live Google Sheet (or any direct .csv link),
// fetched server-side as CSV. One fetch per run, shared by all users.
// ------------------------------------------------------------
export function toCsvUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('ATTENDANCE_SOURCE_URL is not a valid URL');
  }
  if (/\.csv(\?|$)/i.test(u.pathname + u.search)) return raw; // direct CSV
  const m = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error('ATTENDANCE_SOURCE_URL is not a recognized Google Sheets URL or .csv link');
  const gid = u.searchParams.get('gid') ?? (u.hash.match(/gid=(\d+)/)?.[1] ?? '0');
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

async function fetchGrid(): Promise<string[][]> {
  if (!SOURCE_URL) throw new Error('ATTENDANCE_SOURCE_URL secret is not configured');
  const url = toCsvUrl(SOURCE_URL);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Source fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error('Source sheet is empty');
  if (text.trimStart().startsWith('<')) throw new Error('Source returned HTML — the sheet is likely not shared publicly');
  const grid = parseCsv(text);
  if (grid.length < 2) throw new Error('Source sheet has no data rows');
  return grid;
}

// HARD RULE (mirrors ATTENDANCE_START_DATE in src/lib/calc.js): the
// attendance period starts on this date. Columns dated before it are
// NEVER imported — the cutoff lives in the sync pipeline, not the UI.
const ATTENDANCE_START_DATE = '2026-08-25';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// "<date> class N" header → { month, day, index }.
// A bare date ("31 august") has no class digit — index null, resolved
// positionally in extractRecords.
export function parseHeader(h: string): { month: number; day: number; index: number | null } | null {
  const m = h.trim().match(/^(\d{1,2})\s+([a-z]+)\s*(?:class\s*(\d+))?$/i);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
  if (!month) return null;
  return { day: parseInt(m[1], 10), month, index: m[3] ? parseInt(m[3], 10) : null };
}

const STATUS_MAP: Record<string, string> = {
  p: 'present', present: 'present', a: 'absent', absent: 'absent',
  l: 'late', late: 'late', e: 'excused', excused: 'excused',
};

export function normalizeUsn(v: string): string {
  return (v ?? '').trim().toLowerCase();
}

// Academic-year anchor: Aug–Dec → this year, Jan–Jul → previous year.
function ayStartYear(now = new Date()): number {
  return now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

// ------------------------------------------------------------
// Extract ONE student's records from the CSV grid.
//
// The sheet is the ONLY source of truth. The timetable is used solely
// to label a record with a subject; it can never decide whether a
// record exists or which class number it has.
//
//   • Header row 0: "<date> class N" columns — detected by pattern,
//     never by fixed position (summary columns simply don't match).
//   • COLLISION REPAIR: the real sheet repeats a class digit on some
//     days (23 sep reads "class 3, class 2, class 3, class 4").
//     Keying on the header digit alone made two columns collide and
//     silently drop one student's mark. Columns of the same date are
//     now walked in order and each takes the LOWEST class number not
//     already used that date, so a typo'd duplicate becomes a
//     distinct class instead of overwriting a real one. Every source
//     cell therefore yields exactly one record.
//   • A bare date ("31 august") has no class digit: resolved the same
//     way, taking the lowest free class number for that date.
//   • UNDATED COLUMNS: a trailing labelled column that is not a date
//     and not a percentage summary ("Clubs and clans") is a real
//     class the sheet simply doesn't date. It becomes an undated
//     record rather than being discarded.
//   • Blank cells are NOT records: not present, not absent — ignored.
//   • source_key = the deterministic identity
//     "<usn>_<date>_class<n>" or "<usn>_<label>", so re-running the
//     sync updates in place and can never create duplicates.
//   • source_row = 1-based CSV column index of the source cell.
// ------------------------------------------------------------
// Stable slug for an undated column's identity ("Clubs and clans"
// → "clubs_and_clans"), so its source_key never changes between runs.
export function labelSlug(label: string): string {
  return (label ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// Summary columns ("Theory %", "Aggregate %") hold percentages, not marks.
// They must never be imported as attendance.
function isSummaryHeader(h: string): boolean {
  return /%\s*$/.test((h ?? '').trim());
}

export function extractRecords(
  grid: string[][],
  slotsByDay: Map<number, { subject_id: number; slot_id: number }[]>,
  rollNumber: string,
  ayStartYear: number,
): {
  records: any[]; found: boolean; studentName: string; unmatched: any[];
  excludedEarly: any[]; blanks: number;
  reconciliation: {
    source_cells: number; dated_records: number; undated_records: number;
    collisions_repaired: number; missing: any[]; total: number;
  };
} {
  const target = normalizeUsn(rollNumber);
  const unmatched: any[] = [];
  const excludedEarly: any[] = [];
  const byKey = new Map<string, any>();
  let found = false;
  let studentName = '';
  let blanks = 0;

  // Reconciliation counters: source cells vs records actually produced.
  let sourceCells = 0;
  let datedRecords = 0;
  let undatedRecords = 0;
  let collisionsRepaired = 0;

  if (grid.length < 2) {
    throw new Error('Attendance file structure changed: no data rows found — sync requires verification.');
  }

  const header = grid[0];
  const usnCol = Math.max(0, header.findIndex((h) => String(h).trim().toLowerCase() === 'usn'));

  // Dated columns from the header row (position-independent).
  const cols: { col: number; date: string; index: number | null; claimed: boolean; raw: string }[] = [];
  // Undated labelled columns: a real class the sheet simply doesn't date.
  const undated: { col: number; label: string }[] = [];
  header.forEach((h, col) => {
    const text = String(h).trim();
    if (col === usnCol || col === usnCol + 1) return; // identity columns
    const p = parseHeader(text);
    if (p) {
      cols.push({
        col,
        date: `${ayStartYear}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
        index: p.index,
        claimed: false,
        raw: text,
      });
      return;
    }
    if (!text || isSummaryHeader(text)) return; // blank or a % column
    undated.push({ col, label: text });
  });
  // At least one dated class column must exist. A sheet that suddenly has
  // only labels ("Total", "Clubs and clans") has lost its period structure,
  // so refuse rather than import a handful of unrelated cells.
  if (!cols.length) {
    throw new Error('Attendance file structure changed: no date/class columns found — sync requires verification.');
  }

  // The student's own row (USN == profiles.roll_number).
  let row: string[] | null = null;
  for (let r = 1; r < grid.length; r++) {
    if (normalizeUsn(grid[r][usnCol] ?? '') === target) { row = grid[r]; break; }
  }
  if (!row) {
    return {
      records: [], found: false, studentName: '', unmatched, excludedEarly, blanks,
      reconciliation: {
        source_cells: 0, dated_records: 0, undated_records: 0,
        collisions_repaired: 0, missing: [], total: 0,
      },
    };
  }

  found = true;
  studentName = (row[usnCol + 1] ?? '').trim();

  // ---- COLLISION REPAIR -------------------------------------------
  // Walk each date's columns in sheet order. The first column of a day
  // keeps the class digit its header declares; any later column that
  // would reuse an already-claimed number is a typo'd duplicate, so it
  // takes the lowest number still free that date. Before this, two
  // "23 sep class 3" columns shared one key and the later mark silently
  // overwrote the earlier one — a lost class AND a wrong P/A split.
  const byDate = new Map<string, typeof cols>();
  for (const c of cols) {
    const list = byDate.get(c.date) ?? [];
    list.push(c);
    byDate.set(c.date, list);
  }
  for (const list of byDate.values()) {
    const taken = new Set<number>();
    for (const c of list) {
      const want = c.index;
      // A column with no digit, or one whose digit is already claimed,
      // falls through to the lowest free class number.
      if (want == null || taken.has(want)) {
        if (want != null && taken.has(want)) collisionsRepaired++;
        let n = 1;
        while (taken.has(n)) n++;
        c.index = n;
      }
      taken.add(c.index as number);
      c.claimed = true;
    }
  }

  // ---- dated records ----------------------------------------------
  for (const c of cols) {
    const raw = (row[c.col] ?? '').trim();
    if (!raw) { blanks++; continue; } // blank: NOT RECORDED — never counted
    if (c.date < ATTENDANCE_START_DATE) { excludedEarly.push({ date: c.date, class_index: c.index }); continue; }
    sourceCells++;
    const status = STATUS_MAP[raw.toLowerCase()];
    if (!status) {
      unmatched.push({ date: c.date, class_index: c.index, reason: `unrecognized value "${raw}"` });
      continue;
    }
    // Subject label only. A missing or short timetable NEVER discards a
    // record — the class happened, the sheet is what counts it.
    const slots = slotsByDay.get(new Date(`${c.date}T00:00:00Z`).getUTCDay());
    const slot = slots?.[(c.index as number) - 1] ?? null;
    const key = `${target}_${c.date}_class${c.index}`;
    byKey.set(key, {
      source_key: key,
      class_number: c.index,
      class_kind: 'dated',
      subject_id: slot?.subject_id ?? null,
      slot_id: slot?.slot_id ?? null,
      class_date: c.date,
      status,
      source_row: c.col + 1,
    });
    datedRecords++;
  }

  // ---- undated records --------------------------------------------
  // e.g. the "Clubs and clans" column. It carries a real P/A mark and is
  // part of the attendance period; it simply has no date.
  for (const u of undated) {
    const raw = (row[u.col] ?? '').trim();
    if (!raw) { blanks++; continue; }
    sourceCells++;
    const status = STATUS_MAP[raw.toLowerCase()];
    if (!status) {
      unmatched.push({ date: null, class_index: null, column: u.label, reason: `unrecognized value "${raw}"` });
      continue;
    }
    const slug = labelSlug(u.label) || `col${u.col + 1}`;
    const key = `${target}_${slug}`;
    if (byKey.has(key)) continue; // never collapse two columns into one key
    byKey.set(key, {
      source_key: key,
      class_number: null,
      class_kind: 'undated',
      subject_id: null,
      slot_id: null,
      class_date: null,
      class_label: u.label,
      status,
      source_row: u.col + 1,
    });
    undatedRecords++;
  }

  // ---- reconciliation: what did the sheet have that we did not keep? -
  const kept = new Set(
    [...byKey.values()].map((r) => `${r.class_date ?? ''}_${r.class_number ?? r.class_label}`),
  );
  const missing: any[] = [];
  for (const c of cols) {
    const raw = (row[c.col] ?? '').trim();
    if (!raw) continue;
    if (c.date < ATTENDANCE_START_DATE) continue;
    if (!kept.has(`${c.date}_${c.index}`)) {
      missing.push({ source_row: c.col + 1, date: c.date, class_index: c.index, header: c.raw, value: raw });
    }
  }

  return {
    records: [...byKey.values()],
    found,
    studentName,
    unmatched,
    excludedEarly,
    blanks,
    reconciliation: {
      source_cells: sourceCells,
      dated_records: datedRecords,
      undated_records: undatedRecords,
      collisions_repaired: collisionsRepaired,
      missing,
      total: byKey.size,
    },
  };
}

// ------------------------------------------------------------
// Sync ONE user. Takes the loaded grid as a parameter.
// ------------------------------------------------------------
async function syncUser(
  admin: any,
  grid: string[][],
  user: { id: string; roll_number: string | null },
  runType: 'scheduled' | 'manual',
): Promise<any> {
  const startedAt = new Date().toISOString();
  const fail = async (message: string, unmatched = 0, detail: any = null) => {
    await admin.from('attendance_sync_logs').insert({
      user_id: user.id, run_type: runType, status: 'FAILED',
      records_unmatched: unmatched, unmatched_detail: detail, error_message: message,
      started_at: startedAt, completed_at: new Date().toISOString(),
    });
    return { user_id: user.id, status: 'FAILED', error: message };
  };

  if (!user.roll_number || !normalizeUsn(user.roll_number)) {
    return fail('Profile has no roll_number set — identity cannot be matched');
  }

  // The user's own timetable, deterministic order for parallel slots:
  // start time, then coded subject first, then subject name.
  const { data: schedule, error: schedErr } = await admin
    .from('class_schedule')
    .select('id, day_of_week, start_time, subject_id, subjects(name, code)')
    .eq('user_id', user.id);
  if (schedErr) return fail(`Timetable fetch failed: ${schedErr.message}`);

  const slotsByDay = new Map<number, { subject_id: number; slot_id: number }[]>();
  for (const s of schedule ?? []) {
    const list = slotsByDay.get(s.day_of_week) ?? [];
    list.push({
      subject_id: s.subject_id,
      slot_id: s.id,
      _sort: `${s.start_time}|${s.subjects?.code ? 0 : 1}|${s.subjects?.name ?? ''}`,
    } as any);
    slotsByDay.set(s.day_of_week, list);
  }
  for (const [day, list] of slotsByDay) {
    list.sort((a: any, b: any) => (a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0));
    slotsByDay.set(day, list.map(({ subject_id, slot_id }: any) => ({ subject_id, slot_id })));
  }

  const SOURCE_FILE = 'BST Section A attendance (Google Sheets)';

  let extracted: {
    records: any[]; found: boolean; studentName?: string; unmatched: any[];
    excludedEarly: any[]; blanks: number; reconciliation?: any;
  };
  try {
    extracted = extractRecords(grid, slotsByDay, user.roll_number, ayStartYear());
  } catch (e) {
    return fail(`Parse failed: ${(e as Error).message}`);
  }
  if (!extracted.found) {
    return fail(`USN ${user.roll_number} not found in the source sheet`, 1, [{ reason: 'USN not found in source' }]);
  }

  // Idempotent write through the security-definer RPC.
  const { data: rpc, error: rpcErr } = await admin.rpc('orbit_sync_attendance', {
    p_user_id: user.id,
    p_records: extracted.records,
    p_source_file: SOURCE_FILE,
    p_prune: true,
  });
  if (rpcErr) return fail(`Upsert failed: ${rpcErr.message}`);

  const inserted = rpc?.inserted ?? 0;
  const updated = rpc?.updated ?? 0;
  const skipped = rpc?.skipped ?? 0;
  const pruned = rpc?.pruned ?? 0;
  const unmatchedN = extracted.unmatched.length;
  const excludedN = extracted.excludedEarly.length;
  const status = unmatchedN > 0 ? 'PARTIAL' : 'SUCCESS';

  // Reconciliation log: source vs Orbit, plus anything dropped and why.
  // Stored in the sync log only — the student-facing UI never shows it.
  const recon = extracted.reconciliation ?? null;
  await admin.from('attendance_sync_logs').insert({
    user_id: user.id, run_type: runType, status,
    source_file: SOURCE_FILE,
    records_found: extracted.records.length + unmatchedN + excludedN,
    records_inserted: inserted, records_updated: updated,
    records_skipped: skipped + excludedN, records_unmatched: unmatchedN,
    unmatched_detail: unmatchedN ? extracted.unmatched.slice(0, 25) : recon,
    error_message: null,
    started_at: startedAt, completed_at: new Date().toISOString(),
  });

  if (DEBUG) {
    console.log(JSON.stringify({
      reconciliation: {
        usn: user.roll_number,
        student: extracted.studentName,
        source_cells: recon?.source_cells ?? null,
        orbit_records: extracted.records.length,
        dated: recon?.dated_records ?? null,
        undated: recon?.undated_records ?? null,
        collisions_repaired: recon?.collisions_repaired ?? null,
        missing: recon?.missing ?? [],
        inserted, updated, pruned, unmatched: unmatchedN,
      },
    }, null, 2));
  }

  return {
    user_id: user.id, usn: user.roll_number, student: extracted.studentName ?? '',
    status, found: extracted.records.length, inserted, updated, pruned,
    skipped: skipped + excludedN, unmatched: unmatchedN,
    excluded_before_start: excludedN, blanks_ignored: extracted.blanks,
    reconciliation: recon,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const headerKey = req.headers.get('x-sync-key') ?? '';
  const authHeader = req.headers.get('authorization') ?? '';

  // ---- identify the caller -------------------------------------
  let runType: 'scheduled' | 'manual' = 'scheduled';
  let targets: { id: string; roll_number: string | null }[] = [];

  if (SYNC_KEY && headerKey === SYNC_KEY) {
    // Scheduled/service trigger: every profile with a roll_number.
    // Each user is synced against THEIR OWN row only.
    const { data, error } = await admin
      .from('profiles').select('id, roll_number').not('roll_number', 'is', null).limit(200);
    if (error) return json({ ok: false, error: error.message }, 500);
    targets = data ?? [];
  } else if (authHeader.startsWith('Bearer ')) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    if (!data?.user) return json({ ok: false, error: 'Invalid session' }, 401);
    runType = 'manual';
    targets = [{ id: data.user.id, roll_number: null }];
    // Resolve the caller's own profile (never another user's).
    const { data: prof } = await admin.from('profiles').select('id, roll_number').eq('id', data.user.id).maybeSingle();
    targets[0].roll_number = prof?.roll_number ?? null;
  } else {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  // ---- one fetch, then per-user sync ---------------------------
  const results: any[] = [];
  try {
    const grid = await fetchGrid();
    for (const t of targets) results.push(await syncUser(admin, grid, t, runType));
    const ok = results.every((r: any) => r.status !== 'FAILED');
    return json({
      ok,
      run_type: runType,
      synced_at: new Date().toISOString(),
      source_file: 'BST Section A attendance (Google Sheets)',
      results,
      summary: results.reduce((acc: any, r: any) => ({
        found: (acc.found ?? 0) + (r.found ?? 0),
        inserted: (acc.inserted ?? 0) + (r.inserted ?? 0),
        updated: (acc.updated ?? 0) + (r.updated ?? 0),
        skipped: (acc.skipped ?? 0) + (r.skipped ?? 0),
        pruned: (acc.pruned ?? 0) + (r.pruned ?? 0),
        unmatched: (acc.unmatched ?? 0) + (r.unmatched ?? 0),
      }), {}),
    });
  } catch (e) {
    // Fetch/parse failure: log FAILED per target, existing data untouched.
    const message = (e as Error).message;
    for (const t of targets) {
      await admin.from('attendance_sync_logs').insert({
        user_id: t.id, run_type: runType, status: 'FAILED',
        error_message: message, started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    }
    return json({ ok: false, error: message, results }, 200);
  }
});

