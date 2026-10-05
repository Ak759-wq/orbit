// ============================================================
// Orbit domain queries — the single source of truth for the
// numbers the Dashboard and the module pages both display.
//
// Before this file each surface re-implemented its own filters, so
// the Dashboard could disagree with the page it claimed to summarise
// (Assignments Due ignored everything not overdue/today, and
// Upcoming Events was merged differently in two places).
//
// Every query here is pure: it takes already-loaded, user-scoped
// rows from state and returns a deterministic, de-duplicated list.
// No fetching, no clock reads — `todayIso` is always passed in from
// the caller so results are testable and timezone-consistent.
//
//   source rows ──► query ──► Dashboard card + module page + list
//
// Adding a rule here changes every surface at once, which is the
// point: a card can never drift from the list it summarises.
// ============================================================

import { isRealDate, isEventUpcoming, attendanceForRecords } from './calc.js';
import { dayOfWeek } from './datetime.js';

// ---------------------------------------------------------------- Today's classes
// Classes for the selected day, taken from the weekly Class Schedule
// only. Lunch and academic-calendar entries are never classes, and
// recurring blocks stay separate rows (two 40-min blocks are two
// classes, not one). Saturdays and Sundays legitimately return [].
export function getTodayClasses(schedule, todayIso) {
  const dow = dayOfWeek(todayIso);
  if (dow == null) return [];
  return (schedule || [])
    .filter((c) => Number(c.day_of_week) === dow)
    .filter((c) => isRealTime(c.start_time) && isRealTime(c.end_time))
    .sort(byStartTime);
}

// 'HH:MM' / 'HH:MM:SS' with a real, in-range clock value.
function isRealTime(t) {
  return typeof t === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(t)
    && Number(t.slice(0, 2)) <= 23 && Number(t.slice(3, 5)) <= 59;
}

function byStartTime(a, b) {
  const am = Number(a.start_time?.slice(0, 2) || 0) * 60 + Number(a.start_time?.slice(3, 5) || 0);
  const bm = Number(b.start_time?.slice(0, 2) || 0) * 60 + Number(b.start_time?.slice(3, 5) || 0);
  return am - bm;
}

// ---------------------------------------------------------------- Due assignments
// "Still outstanding" — every assignment the student has not finished
// and that carries a usable due date. This deliberately includes
// overdue work: the Assignments page already treats an incomplete
// past-due assignment as outstanding (it has an Overdue tab), so the
// Dashboard must not report "All caught up!" while one is sitting
// unfinished. Completed rows and rows with no valid date are excluded.
//
// Returns the list itself, not just a count, so the card and any list
// rendered from it can never disagree.
export function getDueAssignments(assignments, todayIso) {
  return (assignments || [])
    .filter((a) => a && a.status !== 'completed')
    .filter((a) => isRealDate(a.due_date))
    .sort((a, b) => {
      // Overdue first, then soonest due date, then stable by id.
      const ao = a.due_date < todayIso ? 0 : 1;
      const bo = b.due_date < todayIso ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
      return (a.id ?? 0) - (b.id ?? 0);
    });
}

// Split of getDueAssignments used by the "Today's Tasks" panel and the
// Assignments page tabs — same rows, same predicates, no re-filtering.
export function splitDueAssignments(dueAssignments, todayIso) {
  return {
    overdue: dueAssignments.filter((a) => a.due_date < todayIso),
    today: dueAssignments.filter((a) => a.due_date === todayIso),
    later: dueAssignments.filter((a) => a.due_date > todayIso),
  };
}

// ---------------------------------------------------------------- Upcoming tests
// Tests & Marks data only. A test is upcoming when it has a real
// scheduled date on/after today and has not been graded yet
// (marks_obtained === null ⇒ not taken). Past, graded and undated
// tests are excluded, and reg_deadline is never treated as a test date.
export function getUpcomingTests(tests, todayIso) {
  const seen = new Set();
  return (tests || [])
    .filter((t) => t && isRealDate(t.test_date) && t.test_date >= todayIso)
    .filter((t) => t.marks_obtained == null)
    .filter((t) => {
      if (t.id == null) return true;
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .sort((a, b) => (a.test_date < b.test_date ? -1 : a.test_date > b.test_date ? 1 : 0));
}

// ---------------------------------------------------------------- Upcoming events
// The union of BOTH event sources the student actually owns:
//   A. academic  — the official Academic Calendar (state key `events`)
//   B. user      — user-created Upcoming Events (state key `hackathons`)
// The weekly Class Schedule is never an event and never enters here.
//
// Qualifying = not ended yet: with a real end date, end_date >= today
// (so a multi-day event that started earlier stays visible); without
// one, start_date >= today. Undated "date to be announced" sentinels
// (9999-12-31) never qualify, and reg_deadline never decides.

export const EVENT_SOURCE = { ACADEMIC: 'academic', USER: 'user' };

// Identity for de-duplication.
//  1. source + id — the two tables have independent sequences, so the
//     numeric ids can collide and id alone is never enough.
//  2. normalised title + start + end + organiser — catches the same
//     event stored once in each source. Title alone is NOT enough:
//     two genuinely different events may share a name.
function eventKey(ev, source) {
  if (ev?.id != null) return `${source}:${ev.id}`;
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${source}:n:${norm(ev?.title)}|${ev?.start_date ?? ''}|${ev?.end_date ?? ''}|${norm(ev?.organizer)}`;
}

// Cross-source identity: same normalised title AND same start date is
// the same real-world event recorded twice, regardless of which table
// each copy lives in. Differently-dated same-titled events survive.
function crossSourceKey(ev) {
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${norm(ev?.title)}|${ev?.start_date ?? ''}`;
}

export function getUpcomingEvents({ academicEvents = [], userEvents = [] } = {}, todayIso) {
  const seenSourceKey = new Set();
  const seenCrossKey = new Set();
  const out = [];

  const take = (list, source) => {
    for (const ev of list || []) {
      if (!ev || !isEventUpcoming(ev, todayIso)) continue;

      const key = eventKey(ev, source);
      if (seenSourceKey.has(key)) continue;      // duplicate row in one table
      seenSourceKey.add(key);

      const xkey = crossSourceKey(ev);
      if (seenCrossKey.has(xkey)) continue;      // same event in both tables
      seenCrossKey.add(xkey);

      out.push({ ...ev, source, id: `${source}:${ev.id ?? key}` });
    }
  };

  // Official records first, so a duplicate user copy loses to the
  // authoritative academic-calendar row.
  take(academicEvents, EVENT_SOURCE.ACADEMIC);
  take(userEvents, EVENT_SOURCE.USER);

  return out.sort((a, b) => {
    const ad = a.start_date || a.end_date || '9999';
    const bd = b.start_date || b.end_date || '9999';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return 0;
  });
}

// User-created events only — the Upcoming Events module page owns this
// scope (it manages `events` rows, not the official calendar). Shares
// the same qualifying rule as getUpcomingEvents.
export function getUpcomingUserEvents(userEvents, todayIso) {
  return getUpcomingEvents({ userEvents }, todayIso);
}

// ---------------------------------------------------------------- Attendance
// Attendance has exactly ONE source: the rows synced from the Excel
// (Google Sheets) attendance sheet. Nothing here derives a mark, a
// record or a percentage from anything else — every surface reads
// these shapes, so the Attendance page, the Dashboard, Analytics,
// Summary and the AI snapshot cannot disagree.
//
//   Excel sheet ──► orbit_sync_attendance ──► attendance rows
//                                              │
//                            getSubjectAttendance ──┴──► every surface
//
// The 25 Aug 2026 period rule lives in attendanceForRecords, which
// both helpers below go through, so it is applied exactly once.

// Per-subject attendance, built from the same synced rows the overall
// figure comes from. Subjects with no synced classes are still listed
// (total 0, pct null) so the page shows the truth instead of hiding an
// enrolled subject.
export function getSubjectAttendance(records, subjects) {
  return (subjects || []).map((s) => ({
    subject: s,
    subjectId: s.id,
    name: s.name,
    required: s.attendance_required_pct,
    ...attendanceForRecords((records || []).filter((r) => r.subject_id === s.id)),
  }));
}

// Synced sessions the sheet recorded but the timetable could not
// attribute to a subject — today the undated "Clubs and clans"
// column. They are real classes and DO count towards the overall
// total; this count is surfaced so the subject cards can visibly
// reconcile with the headline number instead of quietly disagreeing.
export function getUnattributedAttendance(records) {
  return attendanceForRecords((records || []).filter((r) => r.subject_id == null));
}

// ---------------------------------------------------------------- Consistency trace
// Development aid: compares each dashboard-facing query against the
// raw source rows so a drift between a card and its list is obvious in
// the console instead of silently shipping.
export function traceDashboardCounts({ schedule = [], assignments = [], tests = [], academicEvents = [], userEvents = [] }, todayIso) {
  const classes = getTodayClasses(schedule, todayIso);
  const due = getDueAssignments(assignments, todayIso);
  const upcomingTests = getUpcomingTests(tests, todayIso);
  const upcomingEvents = getUpcomingEvents({ academicEvents, userEvents }, todayIso);

  const academicQualifying = (academicEvents || []).filter((e) => isEventUpcoming(e, todayIso));
  const userQualifying = (userEvents || []).filter((e) => isEventUpcoming(e, todayIso));
  const duplicatesRemoved = academicQualifying.length + userQualifying.length - upcomingEvents.length;

  const trace = {
    "TODAY'S CLASSES": { source: (schedule || []).length, dashboard: classes.length },
    "ASSIGNMENTS DUE": { source: (assignments || []).length, dashboard: due.length },
    "UPCOMING TESTS": { source: (tests || []).length, dashboard: upcomingTests.length },
    "UPCOMING EVENTS": {
      'academic qualifying': academicQualifying.length,
      'user qualifying': userQualifying.length,
      'duplicates removed': duplicatesRemoved,
      final: upcomingEvents.length,
    },
  };

  if (import.meta.env?.DEV) {
    for (const [k, v] of Object.entries(trace)) console.log(k, v);
  }
  return trace;
}