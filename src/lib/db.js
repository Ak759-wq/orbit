import { supabase } from './supabase.js';

// Thin data-access layer over Supabase. Every function throws on
// error so callers can surface messages; rows are returned plain.

// NOTE: 'attendance' is deliberately absent. Attendance is Excel-only
// and read-only, so the app has no insert/update/remove helper for it
// at all — the single write path is orbit_sync_attendance in the
// attendance-sync edge function. Purging the caller's own rows (for
// "clear demo data" / "delete all") goes through orbit_purge_attendance.
const OWNED = ['subjects', 'class_schedule', 'academic_events', 'tests', 'assignments', 'study_sessions', 'goals', 'resources', 'events', 'event_bookmarks'];

export async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, patch) {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single();
  if (error) throw error;
  return data;
}

// Self-heal: create the profile + notification settings when a session
// exists but the signup trigger never ran (account predates the trigger).
export async function ensureProfile(userId, meta = {}) {
  const fullName = meta?.full_name || meta?.name || (meta?.email ? meta.email.split('@')[0] : 'Student');
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, full_name: fullName }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchSettings(userId) {
  const { data, error } = await supabase.from('notification_settings').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data) return data;
  // First login before the DB trigger ran (older project): create defaults.
  const { data: created, error: createErr } = await supabase
    .from('notification_settings')
    .insert({ user_id: userId })
    .select()
    .single();
  if (createErr) throw createErr;
  return created;
}

export async function updateSettings(userId, patch) {
  const { data, error } = await supabase.from('notification_settings').update(patch).eq('user_id', userId).select().single();
  if (error) throw error;
  return data;
}

export async function fetchAll() {
  const [subjects, schedule, events, tests, assignments, attendance, sessions, goals, resources, dismissals, hackathons, bookmarks, syncLogs] = await Promise.all([
    supabase.from('subjects').select('*').order('name'),
    supabase.from('class_schedule').select('*').order('day_of_week'),
    supabase.from('academic_events').select('*').order('start_date'),
    supabase.from('tests').select('*').order('test_date'),
    supabase.from('assignments').select('*').order('due_date'),
    supabase.from('attendance').select('*').order('class_date'),
    supabase.from('study_sessions').select('*').order('session_date'),
    supabase.from('goals').select('*').order('created_at'),
    supabase.from('resources').select('*').order('date_added'),
    supabase.from('notification_dismissals').select('*'),
    supabase.from('events').select('*').order('start_date'),
    supabase.from('event_bookmarks').select('*'),
    supabase.from('attendance_sync_logs').select('*').order('started_at', { ascending: false }).limit(20),
  ]);
  for (const r of [subjects, schedule, events, tests, assignments, attendance, sessions, goals, resources, dismissals, hackathons, bookmarks, syncLogs]) {
    if (r.error) throw r.error;
  }
  return {
    subjects: subjects.data,
    schedule: schedule.data,
    events: events.data,
    tests: tests.data,
    assignments: assignments.data,
    attendance: attendance.data,
    sessions: sessions.data,
    goals: goals.data,
    resources: resources.data,
    dismissals: dismissals.data,
    hackathons: hackathons.data,
    bookmarks: bookmarks.data,
    syncLogs: syncLogs.data,
  };
}

function mk(table) {
  return {
    async insert(row) {
      const { data, error } = await supabase.from(table).insert(row).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return true;
    },
    async insertMany(rows) {
      if (!rows.length) return [];
      const { data, error } = await supabase.from(table).insert(rows).select();
      if (error) throw error;
      return data;
    },
  };
}

export const db = Object.fromEntries(OWNED.map((t) => [t, mk(t)]));

export async function addDismissal(dedupeKey, untilISO) {
  const { error } = await supabase
    .from('notification_dismissals')
    .upsert({ dedupe_key: dedupeKey, dismissed_until: untilISO }, { onConflict: 'user_id,dedupe_key' });
  if (error) throw error;
  return true;
}

// Attendance is not in these lists: its RLS policy is SELECT-only, so
// the client cannot delete it. The caller's own rows are purged through
// the owner-scoped security-definer RPC instead (see below).

export async function clearDemoData() {
  // Delete demo rows from every table (children first for FK clarity).
  const order = ['resources', 'study_sessions', 'assignments', 'tests', 'goals', 'academic_events', 'class_schedule', 'subjects'];
  for (const table of order) {
    const { error } = await supabase.from(table).delete().eq('is_demo', true);
    if (error) throw error;
  }
  const { error } = await supabase.rpc('orbit_purge_attendance', { p_scope: 'demo' });
  if (error) throw error;
  return true;
}

export async function deleteAllAcademicData() {
  const order = ['notification_dismissals', 'event_bookmarks', 'events', 'resources', 'study_sessions', 'assignments', 'tests', 'goals', 'academic_events', 'class_schedule', 'subjects'];
  for (const table of order) {
    const { error } = await supabase.from(table).delete().neq('id', 0);
    if (error) throw error;
  }
  // Full attendance purge, still scoped to the signed-in caller only.
  const { error } = await supabase.rpc('orbit_purge_attendance', { p_scope: 'all' });
  if (error) throw error;
  return true;
}
