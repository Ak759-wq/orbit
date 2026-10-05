// ============================================================
// Orbit website database — persistent localStorage store with
// the same table shapes as the Supabase schema, so the website
// modules and the signed-in app modules stay interchangeable.
// Subjects + weekly schedule + academic calendar are prefilled
// from the real BST timetable/calendar. Tests, assignments,
// attendance, sessions, goals, resources start empty (honest
// empty states) and persist as the visitor adds them.
// ============================================================

import { timeToMinutes, toISODate } from '../lib/datetime.js';
import { classStatus } from '../lib/calc.js';
import { BST_SCHEDULE, BST_SUBJECTS, buildCalendarRows, LUNCH as LUNCH_PERIOD } from './seedData.js';

// v2: corrected seed — Friday Env-Science session, exact session names,
// section field, fixed 2026-27 calendar. Bumping the key reseeds every
// visitor; user records (tests/attendance/…) start empty anyway.
const KEY = 'orbit.website.db.v3';
const eventTarget = typeof window !== 'undefined' ? new EventTarget() : null;

function load() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let cache = load();

function commit() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
    eventTarget.dispatchEvent(new Event('orbit-db-change'));
  } catch { /* storage full/blocked: keep working in memory */ }
}

export function onDbChange(fn) {
  if (!eventTarget) return () => {};
  eventTarget.addEventListener('orbit-db-change', fn);
  return () => eventTarget.removeEventListener('orbit-db-change', fn);
}

// Fresh store with BST seed applied.
export function freshDb() {
  const subjects = BST_SUBJECTS.map((s, i) => ({ id: i + 1, ...s }));
  const idByName = new Map(subjects.map((s) => [s.name, s.id]));
  // Timetable slot labels that differ from subject-row names resolve
  // here; the current seed is 1:1, so the map is kept only for safety.
  const ALIAS = new Map([
    ['Mentorship', 'Mentorship / Doubt Session'],
    ['Club Activities / Doubt Session', 'Club Activities'],
  ]);
  const resolveSubject = (name) => idByName.get(name) ?? idByName.get(ALIAS.get(name)) ?? null;
  const schedule = BST_SCHEDULE.map((c, i) => ({
    id: i + 1,
    subject_id: resolveSubject(c.subject),
    subject: c.subject,
    code: c.code,
    kind: c.kind,
    faculty: c.faculty || '',
    room: c.room,
    day_of_week: c.day,
    start_time: c.start_time,
    end_time: c.end_time,
    notes: '',
  }));
  return {
    subjects,
    schedule,
    // events need stable ids too — keys, future editing/removal
    events: buildCalendarRows().map((e, i) => ({ id: i + 1, ...e })),
    tests: [],
    assignments: [],
    attendance: [],
    sessions: [],
    goals: [],
    resources: [],
    seq: 10000,
  };
}

// -------- topic/name → subject matching for user-added rows --------
export function matchSubjectId(nameOrTopic) {
  if (!nameOrTopic || !cache) return null;
  const q = String(nameOrTopic).toLowerCase();
  let best = null;
  for (const s of cache.subjects) {
    const name = s.name.toLowerCase();
    // split on whitespace, hyphens and slashes so 'Mentorship/Doubt
    // Session' yields 'mentorship' and 'doubt' as matchable tokens
    const first = name.split(/[\s-/]+/).filter(Boolean);
    for (const token of first) {
      if (token.length >= 4 && q.includes(token)) {
        if (!best || token.length > best.len) best = { id: s.id, len: token.length };
      }
    }
    if (s.code && q.includes(s.code.toLowerCase())) {
      if (!best || 6 > best.len) best = { id: s.id, len: 6 };
    }
  }
  return best ? best.id : null;
}

function nextId() {
  cache.seq = (cache.seq || 10000) + 1;
  return cache.seq;
}

if (!cache) {
  cache = freshDb();
  commit();
} else if (cache.events?.some((e) => e.id == null)) {
  // migrate pre-id stores: give every event a stable id
  cache.events = cache.events.map((e, i) => ({ id: i + 1, ...e }));
  commit();
}

// ---------------- generic CRUD ----------------
export function list(table) {
  return cache[table] ?? [];
}

export function insert(table, row) {
  const rec = { id: nextId(), ...row };
  cache[table] = [rec, ...(cache[table] ?? [])];
  commit();
  return rec;
}

export function update(table, id, patch) {
  cache[table] = (cache[table] ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r));
  commit();
  return cache[table].find((r) => r.id === id);
}

export function remove(table, id) {
  cache[table] = (cache[table] ?? []).filter((r) => r.id !== id);
  commit();
  return true;
}

export function upsert(table, row, matchKeys) {
  const existing = (cache[table] ?? []).find((r) => matchKeys.every((k) => r[k] === row[k]));
  if (existing) return update(table, existing.id, row);
  return insert(table, row);
}

// ---------------- derived views ----------------
export function subjectById(id) {
  return cache.subjects.find((s) => s.id === Number(id)) || null;
}

export function subjectName(id) {
  return subjectById(id)?.name ?? null;
}

// Today's classes from the schedule DB with live status.
export function todayClasses(now = new Date()) {
  const dow = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const slots = (cache.schedule ?? [])
    .filter((c) => c.day_of_week === dow)
    .sort((a, b) => (a.start_time < b.start_time ? -1 : 1))
    .map((c) => ({
      ...c,
      status: classStatus(timeToMinutes(c.start_time), timeToMinutes(c.end_time), mins),
    }));
  const current = slots.find((c) => c.status === 'ongoing') || null;
  const next = slots.find((c) => c.status === 'upcoming') || null;
  return {
    classes: slots,
    current,
    next,
    nextInMins: next ? timeToMinutes(next.start_time) - mins : null,
    count: slots.length,
  };
}

// Free periods + lunch for today, computed from gaps in the schedule.
// The 1:00–2:00 PM lunch break is a non-class period: it is reported as
// `lunch` but never as a free academic session.
export function todayGaps(now = new Date()) {
  const { classes } = todayClasses(now);
  if (!classes.length) return { lunch: LUNCH_PERIOD, freePeriods: [] };
  const sorted = [...classes].sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
  const free = [];
  for (let i = 1; i < sorted.length; i++) {
    const gapStart = sorted[i - 1].end_time;
    const gapEnd = sorted[i].start_time;
    const minutes = timeToMinutes(gapEnd) - timeToMinutes(gapStart);
    if (minutes < 20) continue;
    // daily 1:00–2:00 PM lunch window is not a free academic session
    if (timeToMinutes(gapStart) < 14 * 60 && timeToMinutes(gapEnd) > 13 * 60) continue;
    free.push({ start: gapStart, end: gapEnd, minutes });
  }
  const lunch = LUNCH_PERIOD;
  return { lunch, freePeriods: free };
}

// Academic events with live countdowns.
export function eventsWithCountdown(now = new Date()) {
  const today = toISODate(now);
  return (cache.events ?? [])
    .map((e) => ({
      ...e,
      daysRemaining: Math.round((new Date(e.start_date) - new Date(today)) / 86400000),
    }))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function upcomingEvents(limit = 12, now = new Date()) {
  return eventsWithCountdown(now).filter((e) => e.end_date >= toISODate(now)).slice(0, limit);
}

export function todaysEvents(now = new Date()) {
  const today = toISODate(now);
  return (cache.events ?? []).filter((e) => e.start_date <= today && e.end_date >= today);
}
