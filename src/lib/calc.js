// ============================================================
// ScholarOS calculation engine.
// Every derived number in the app flows through these pure
// functions — dashboard, analytics, notifications, weekly
// summary and the AI snapshot share one source of truth.
// Division-by-zero always yields null (UI renders "—").
// ============================================================
import { timeToMinutes, daysBetween as daysBetweenISO, fmtDuration, parseISO, toISODate, addDaysISO, weekStart } from './datetime.js';

export function safePct(part, total) {
  if (typeof part !== 'number' || typeof total !== 'number' || !Number.isFinite(part) || !Number.isFinite(total)) return null;
  if (total <= 0) return null;
  const v = (part / total) * 100;
  return Math.round(v * 10) / 10;
}

export function avg(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export function round1(n) {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function chrono(a, b) {
  return a.test_date < b.test_date ? -1 : a.test_date > b.test_date ? 1 : 0;
}

// ---------------- Tests ----------------
export function testPercentage(test) {
  if (!test) return null;
  return safePct(test.marks_obtained, test.max_marks);
}

// Chronological per-subject stats with trend (first vs latest %).
export function testStatsForSubject(tests) {
  const graded = (tests || []).filter((t) => t.marks_obtained != null).sort(chrono);
  const pcts = graded.map((t) => testPercentage(t));
  const nonNull = pcts.filter((p) => p != null);
  let trend = null;
  if (nonNull.length >= 2) {
    const first = nonNull[0];
    const latest = nonNull[nonNull.length - 1];
    const delta = round1(latest - first);
    trend = {
      from: first,
      to: latest,
      delta,
      direction: delta > 0.5 ? 'improving' : delta < -0.5 ? 'declining' : 'stable',
    };
  }
  return {
    count: graded.length,
    avgPct: avg(nonNull),
    highest: nonNull.length ? Math.max(...nonNull) : null,
    lowest: nonNull.length ? Math.min(...nonNull) : null,
    latestPct: nonNull.length ? nonNull[nonNull.length - 1] : null,
    trend,
  };
}

export function overallTestStats(tests) {
  const graded = (tests || []).filter((t) => t.marks_obtained != null);
  const pcts = graded.map((t) => testPercentage(t)).filter((p) => p != null);
  const sorted = [...graded].sort(chrono);
  return {
    total: graded.length,
    avgPct: avg(pcts),
    highest: pcts.length ? Math.max(...pcts) : null,
    lowest: pcts.length ? Math.min(...pcts) : null,
    latestPct: sorted.length ? testPercentage(sorted[sorted.length - 1]) : null,
    latestName: sorted.length ? sorted[sorted.length - 1].name : null,
  };
}

// ---------------- Attendance ----------------
// HARD BUSINESS RULE: attendance is only counted from this date onward
// (the official attendance start date). Records dated before it — even
// though they are imported and stored — are excluded from EVERY
// calculation: overall, subject-wise, projections and the AI snapshot.
// Undated records (legacy manual entries with no class_date) are kept.
export const ATTENDANCE_START_DATE = '2026-08-25';

export function attendanceForRecords(records) {
  const valid = (records || []).filter((r) => !r.class_date || r.class_date >= ATTENDANCE_START_DATE);
  const total = valid.length;
  const present = valid.filter((r) => r.status === 'present').length;
  return { total, present, absent: total - present, pct: safePct(present, total) };
}

// How many stored records fall outside the attendance period (before
// ATTENDANCE_START_DATE). Surfaced on the Attendance page so the
// exclusion is visible rather than silent. Records with no date count
// as included, mirroring attendanceForRecords.
export function attendanceExcludedBeforeStart(records) {
  return (records || []).filter((r) => r.class_date && r.class_date < ATTENDANCE_START_DATE).length;
}

// The same stats over a date window, for "this week" panels and the
// weekly trend. The window narrows WHICH synced records count; the
// 25 Aug period rule still comes from attendanceForRecords, so every
// windowed figure obeys the identical rule as the overall one.
export function attendanceBetween(records, fromIso, toIso) {
  return attendanceForRecords(
    (records || []).filter((r) => r.class_date && r.class_date >= fromIso && r.class_date <= toIso),
  );
}

// If the student attends/misses `n` more classes of a subject:
export function attendanceProjection(records, n = 1) {
  const { total, present, pct } = attendanceForRecords(records);
  if (total === 0) return { base: pct, baseTotal: 0, basePresent: 0, attend: null, miss: null };
  return {
    base: pct,
    baseTotal: total,
    basePresent: present,
    attend: safePct(present + n, total + n),
    miss: safePct(present, total + n),
  };
}

// Consecutive attended classes needed to reach target (0 → already there).
// Feasibility: with all-present from here, pct → 100 as n → ∞, so any
// target < 100 is reachable; target ≥ 100 only if pct already = 100.
export function classesToTarget(records, targetPct) {
  const { total, present, pct } = attendanceForRecords(records);
  if (total === 0) return { need: null, feasible: false, current: null };
  if (pct == null) return { need: null, feasible: false, current: null };
  if (pct >= targetPct) return { need: 0, feasible: true, current: pct };
  if (targetPct >= 100) return { need: null, feasible: false, current: pct };
  // solve (present + n) / (total + n) = t  →  n = (t·total − present) / (1 − t)
  const t = targetPct / 100;
  const raw = (t * total - present) / (1 - t);
  // guard against FP noise like 1.0000000000000009
  const need = Math.ceil(Math.round(raw * 1e9) / 1e9);
  return { need: Math.max(need, 1), feasible: true, current: pct };
}

// ---------------- Assignments ----------------
// Buckets: overdue / today / tomorrow / this week / later
export function assignmentBuckets(assignments, todayIso, tomorrowIso, weekEndIso) {
  const open = (assignments || []).filter((a) => a.status !== 'completed');
  const b = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
  for (const a of open) {
    if (a.due_date < todayIso) b.overdue.push(a);
    else if (a.due_date === todayIso) b.today.push(a);
    else if (a.due_date === tomorrowIso) b.tomorrow.push(a);
    else if (weekEndIso && a.due_date <= weekEndIso) b.week.push(a);
    else b.later.push(a);
  }
  return b;
}

export function assignmentStats(assignments, todayIso) {
  const list = assignments || [];
  const total = list.length;
  const completed = list.filter((a) => a.status === 'completed').length;
  const pending = total - completed;
  const overdue = list.filter((a) => a.status !== 'completed' && a.due_date < todayIso).length;
  return { total, completed, pending, overdue, completionPct: safePct(completed, total) };
}

// ---------------- Study sessions ----------------
export function sessionMinutes(s) {
  const a = timeToMinutes(s.start_time);
  const b = timeToMinutes(s.end_time);
  if (a == null || b == null || b <= a) return 0;
  return b - a;
}

function sumMinutes(list) {
  return (list || []).reduce((n, s) => n + sessionMinutes(s), 0);
}

// Planned/completed/weekly hours + subject-wise study time.
export function studyStats(sessions, weekStartIso, weekEndIso) {
  const list = sessions || [];
  const completedList = list.filter((s) => s.status === 'completed');
  const weekList = list.filter((s) => s.session_date >= weekStartIso && s.session_date <= weekEndIso);
  const planned = sumMinutes(list);
  const completed = sumMinutes(completedList);
  return {
    plannedMinutes: planned,
    completedMinutes: completed,
    completionPct: safePct(completed, planned),
    weeklyMinutes: sumMinutes(weekList),
    weeklyCompletedMinutes: sumMinutes(weekList.filter((s) => s.status === 'completed')),
    bySubject: bySubjectMinutes(list),
  };
}

export function bySubjectMinutes(sessions) {
  const map = new Map();
  for (const s of sessions || []) {
    const key = s.subject_id ?? 'none';
    const cur = map.get(key) || { subjectId: key, minutes: 0, completedMinutes: 0 };
    const m = sessionMinutes(s);
    cur.minutes += m;
    if (s.status === 'completed') cur.completedMinutes += m;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

// ---------------- Goals ----------------
// progress = current / target × 100, capped for display sanity.
export function goalProgress(goal) {
  const target = Number(goal.target_value);
  const current = Number(goal.current_value);
  if (!Number.isFinite(target) || target <= 0) return null;
  if (!Number.isFinite(current) || current < 0) return null;
  return Math.min(round1((current / target) * 100), 999);
}

// ---------------- Dashboard: today's schedule ----------------
export function classStatus(startMins, endMins, nowMins) {
  if (startMins == null || endMins == null || nowMins == null) return 'upcoming';
  if (nowMins < startMins) return 'upcoming';
  if (nowMins >= startMins && nowMins < endMins) return 'ongoing';
  return 'completed';
}

export function decorateDaySchedule(slots, nowMins) {
  const list = (slots || []).slice().sort((a, b) => (a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0));
  const decorated = list.map((s) => ({ ...s, status: classStatus(timeToMinutes(s.start_time), timeToMinutes(s.end_time), nowMins) }));
  const current = decorated.find((s) => s.status === 'ongoing') || null;
  const next = decorated.find((s) => s.status === 'upcoming') || null;
  return { slots: decorated, current, next };
}

// ---------------- Weekly summary ----------------
// Facts generated purely from stored data; nulls mean "no data".
export function weeklySummary(ctx) {
  const { tests, assignments, attendanceRecords, sessions, thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd, subjectTrends } = ctx;
  const lines = [];

  // Tests completed this week + average score
  const gradedAll = (tests || []).filter((t) => t.marks_obtained != null);
  const testsThisWeek = gradedAll.filter((t) => t.test_date >= thisWeekStart && t.test_date <= thisWeekEnd);
  if (testsThisWeek.length) {
    const scores = testsThisWeek.map((t) => testPercentage(t)).filter((p) => p != null);
    const a = avg(scores);
    lines.push(`You completed ${testsThisWeek.length} test${testsThisWeek.length > 1 ? 's' : ''} this week${a != null ? ` with an average score of ${a}%` : ''}.`);
  } else {
    lines.push('No tests were recorded this week.');
  }

  // Assignments completed / pending this week (by due date)
  const dueThisWeek = (assignments || []).filter((a) => a.due_date >= thisWeekStart && a.due_date <= thisWeekEnd);
  if (dueThisWeek.length) {
    const done = dueThisWeek.filter((a) => a.status === 'completed').length;
    lines.push(`You completed ${done} of ${dueThisWeek.length} assignments due this week.`);
  } else {
    lines.push('No assignments were due this week.');
  }

  // Attendance change vs last week
  const attThis = attendanceBetween(attendanceRecords, thisWeekStart, thisWeekEnd);
  const attLast = attendanceBetween(attendanceRecords, lastWeekStart, lastWeekEnd);
  if (attThis.total > 0) {
    let s = `This week you attended ${attThis.present} of ${attThis.total} classes (${attThis.pct}%).`;
    if (attLast.total > 0 && attThis.pct != null && attLast.pct != null) {
      const diff = round1(attThis.pct - attLast.pct);
      s += diff === 0 ? ' Same as last week.' : diff > 0 ? ` Up ${Math.abs(diff)} points from last week (${attLast.pct}%).` : ` Down ${Math.abs(diff)} points from last week (${attLast.pct}%).`;
    }
    lines.push(s);
  } else if (attLast.total > 0) {
    lines.push(`No attendance was marked this week (last week: ${attLast.pct}%).`);
  }

  // Study hours this week
  const weekSessions = (sessions || []).filter((s) => s.session_date >= thisWeekStart && s.session_date <= thisWeekEnd);
  const plannedMin = sumMinutes(weekSessions);
  const doneMin = sumMinutes(weekSessions.filter((s) => s.status === 'completed'));
  if (plannedMin > 0) {
    lines.push(`You planned ${fmtDuration(plannedMin)} of study and completed ${fmtDuration(doneMin)}.`);
  } else {
    lines.push('No study sessions were planned this week.');
  }

  // Subject performance change: last-week window vs prior
  if (Array.isArray(subjectTrends)) {
    const movers = subjectTrends.filter((t) => t.trend && t.trend.delta !== 0);
    if (movers.length) {
      const best = movers.reduce((a, b) => (b.trend.delta > a.trend.delta ? b : a));
      const worst = movers.reduce((a, b) => (b.trend.delta < a.trend.delta ? b : a));
      if (best.trend.delta > 0) lines.push(`Your ${best.name} score moved from ${best.trend.from}% to ${best.trend.to}% (${best.trend.delta > 0 ? '+' : ''}${best.trend.delta} points).`);
      if (worst.trend.delta < 0) lines.push(`Your ${worst.name} score moved from ${worst.trend.from}% to ${worst.trend.to}% (${worst.trend.delta} points).`);
    }
  }

  return lines;
}

// ---------------- Upcoming counting (dashboard cards) ----------------
// A dateless academic-calendar row is stored with the far-future sentinel
// 9999-12-31 (see seed-real-data.sql) until a real date is published. It has
// no date to compare, so it must never count as "upcoming" anywhere.
export const DATELESS_EVENT_DATE = '9999-12-31';

// A real, comparable 'YYYY-MM-DD' date — rejects null/blank/garbage,
// impossible calendar dates (2026-13-45) and the 9999-12-31 "date to be
// announced" sentinel via a parse/round-trip check.
export function isRealDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso === DATELESS_EVENT_DATE) return false;
  const d = parseISO(iso);
  return d != null && toISODate(d) === iso;
}

// Collapse duplicate records (same id) so a logical row counts only once.
// Rows without an id are kept (they cannot be deduped reliably).
function dedupeById(rows) {
  const seen = new Set();
  return (rows || []).filter((r) => {
    if (!r) return false;
    if (r.id == null) return true;
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

// An event is upcoming until it ends (end_date >= today); without an end
// date, the start date decides. Registration deadlines are display metadata
// and never decide whether an event is counted.
export function isEventUpcoming(ev, todayIso) {
  if (!ev) return false;
  if (isRealDate(ev.end_date)) return ev.end_date >= todayIso;
  if (isRealDate(ev.start_date)) return ev.start_date >= todayIso;
  return false;
}

// Upcoming tests: valid date on/after today, not graded yet
// (marks_obtained == null ⇒ not completed), duplicates collapsed,
// nearest date first. Tests are date-only in this schema, so a test
// scheduled for today stays "upcoming" until the day has passed.
export function upcomingTestsList(tests, todayIso) {
  return dedupeById(tests)
    .filter((t) => isRealDate(t.test_date) && t.test_date >= todayIso)
    .filter((t) => t.marks_obtained == null)
    .sort((a, b) => (a.test_date < b.test_date ? -1 : a.test_date > b.test_date ? 1 : 0));
}

// Upcoming calendar events: everything that has not ended yet (ongoing
// included), sentinels/undated rows excluded, nearest start date first.
export function upcomingCalendarEventsList(events, todayIso) {
  return dedupeById(events)
    .filter((e) => isEventUpcoming(e, todayIso))
    .sort((a, b) => ((a.start_date || a.end_date || '') < (b.start_date || b.end_date || '') ? -1 : 1));
}

// ---------------- Notifications ----------------
// Rules run on stored data; settings decide which fire.
// Every item carries a dedupeKey so dismissals stick.
export function buildNotifications(data, settings, todayIso) {
  const items = [];
  const on = (t) => !settings || !Array.isArray(settings.enabled_types) || settings.enabled_types.includes(t);
  const daysAhead = settings?.days_ahead ?? 7;
  // attendance_threshold is respected via each subject's required % (s.required);
  // the global threshold additionally applies to subjects using their default.
  const attThreshold = settings?.attendance_threshold ?? 75;
  const add = (n) => items.push(n);

  // Upcoming tests within window
  if (on('upcoming_test') && Array.isArray(data.tests)) {
    for (const t of data.tests) {
      const d = daysBetweenISO(todayIso, t.test_date);
      if (d != null && d >= 0 && d <= daysAhead) {
        add({ dedupeKey: `test:${t.id}:${todayIso}`, type: 'upcoming_test', severity: d === 0 ? 'high' : 'info', title: d === 0 ? `Test today: ${t.name}` : d === 1 ? `Test tomorrow: ${t.name}` : `Test in ${d} days: ${t.name}`, detail: `${t.subjectName || 'Subject'} · ${t.test_type}`, date: t.test_date, link: 'tests' });
      }
    }
  }

  // Assignment deadlines within window (open only)
  if (on('assignment_deadline') && Array.isArray(data.assignments)) {
    for (const a of data.assignments) {
      if (a.status === 'completed') continue;
      const d = daysBetweenISO(todayIso, a.due_date);
      if (d != null && d >= 0 && d <= daysAhead) {
        add({ dedupeKey: `assign:${a.id}:${todayIso}`, type: 'assignment_deadline', severity: d <= 1 ? 'high' : 'info', title: d === 0 ? `Due today: ${a.title}` : d === 1 ? `Due tomorrow: ${a.title}` : `Due in ${d} days: ${a.title}`, detail: `${a.subjectName || 'Subject'} · ${a.task_type}`, date: a.due_date, link: 'assignments' });
      }
    }
  }

  // Overdue assignments (most recent 10 to avoid nag spam)
  if (on('overdue_assignment') && Array.isArray(data.assignments)) {
    const overdue = data.assignments.filter((a) => a.status !== 'completed' && a.due_date < todayIso);
    if (overdue.length > 0) {
      add({ dedupeKey: `overdue:${todayIso}`, type: 'overdue_assignment', severity: 'high', title: `${overdue.length} assignment${overdue.length > 1 ? 's' : ''} overdue`, detail: overdue.slice(0, 3).map((a) => a.title).join(', ') + (overdue.length > 3 ? ` +${overdue.length - 3} more` : ''), link: 'assignments' });
    }
  }

  // Upcoming exams (exam-type events)
  if (on('upcoming_exam') && Array.isArray(data.events)) {
    const examTypes = ['exam', 'midsem', 'endsem', 'practical'];
    for (const e of data.events) {
      if (!examTypes.includes(e.event_type)) continue;
      const d = daysBetweenISO(todayIso, e.start_date);
      if (d != null && d >= 0 && d <= daysAhead) {
        add({ dedupeKey: `exam:${e.id}:${todayIso}`, type: 'upcoming_exam', severity: d <= 2 ? 'high' : 'info', title: d === 0 ? `Exam today: ${e.title}` : d === 1 ? `Exam tomorrow: ${e.title}` : `Exam in ${d} days: ${e.title}`, detail: e.description || 'Academic calendar', date: e.start_date, link: 'calendar' });
      }
    }
  }

  // Low attendance per subject (only below threshold)
  if (on('low_attendance') && Array.isArray(data.subjectAttendance)) {
    for (const s of data.subjectAttendance) {
      const req = s.required ?? attThreshold;
      if (s.total > 0 && s.pct != null && s.pct < req) {
        add({ dedupeKey: `lowatt:${s.subjectId}:${todayIso}`, type: 'low_attendance', severity: 'high', title: `${s.name} attendance is ${s.pct}%`, detail: `Below your ${req}% requirement · ${s.present}/${s.total} classes`, link: 'attendance' });
      }
    }
  }

  // Today's study sessions
  if (on('study_session') && Array.isArray(data.sessions)) {
    const todaySessions = data.sessions.filter((s) => s.session_date === todayIso && s.status !== 'completed');
    if (todaySessions.length > 0) {
      add({ dedupeKey: `study:${todayIso}`, type: 'study_session', severity: 'info', title: `${todaySessions.length} study session${todaySessions.length > 1 ? 's' : ''} today`, detail: todaySessions.map((s) => s.topic || s.subjectName || 'Session').slice(0, 3).join(', '), link: 'planner' });
    }
  }

  // Academic events today / this week (non-exam types)
  if (on('academic_event') && Array.isArray(data.events)) {
    for (const e of data.events) {
      if (e.end_date && e.end_date < todayIso) continue;
      const d = daysBetweenISO(todayIso, e.start_date);
      if (d != null && d >= 0 && d <= Math.min(daysAhead, 7)) {
        add({ dedupeKey: `event:${e.id}:${todayIso}`, type: 'academic_event', severity: d === 0 ? 'high' : 'info', title: d === 0 ? `Today: ${e.title}` : d === 1 ? `Tomorrow: ${e.title}` : `${e.title} in ${d} days`, detail: e.event_type, date: e.start_date, link: 'calendar' });
      }
    }
  }

  // sort: severity then date
  const order = { high: 0, info: 1 };
  return items.sort((a, b) => (order[a.severity] - order[b.severity]) || String(a.date || '').localeCompare(String(b.date || '')));
}

// ============================================================
// Orbit redesign helpers (additive — pure, UI-support only).
// They never invent data: they filter/sort/label rows that exist.
// ============================================================

// ---------------- Academic Radar ----------------
// Everything that needs attention soon: ungraded future tests, open
// assignment deadlines (overdue included — they need attention most),
// upcoming calendar events (holidays tagged separately) and upcoming
// custom events. Sentinel/undated rows are excluded via the same
// isRealDate/isEventUpcoming rules that power the dashboard counts.
// Returns a date-sorted list; callers slice for display.
export function academicRadar({ tests = [], assignments = [], events = [], customEvents = [], today }) {
  const items = [];
  for (const t of tests || []) {
    if (t.marks_obtained != null) continue;
    if (!isRealDate(t.test_date) || t.test_date < today) continue;
    items.push({ id: `test-${t.id}`, kind: 'TEST', title: t.name, date: t.test_date, daysLeft: daysBetweenISO(today, t.test_date), subjectId: t.subject_id ?? null });
  }
  for (const a of assignments || []) {
    if (a.status === 'completed' || !a.due_date) continue;
    items.push({ id: `assign-${a.id}`, kind: 'ASSIGNMENT', title: a.title, date: a.due_date, daysLeft: daysBetweenISO(today, a.due_date), subjectId: a.subject_id ?? null, overdue: a.due_date < today });
  }
  for (const e of events || []) {
    if (!isEventUpcoming(e, today)) continue;
    const holiday = e.event_type === 'holiday' || e.event_type === 'break';
    items.push({ id: `event-${e.id}`, kind: holiday ? 'HOLIDAY' : 'EVENT', title: e.title, date: e.start_date || e.end_date, daysLeft: daysBetweenISO(today, e.start_date || e.end_date), subjectId: e.subject_id ?? null });
  }
  for (const e of customEvents || []) {
    if (!isEventUpcoming(e, today)) continue;
    items.push({ id: `custom-${e.id}`, kind: 'EVENT', title: e.title, date: e.start_date || e.end_date, daysLeft: daysBetweenISO(today, e.start_date || e.end_date), custom: true });
  }
  return items.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
}

// ---------------- Dashboard recommendation ----------------
// One honest, context-driven sentence for the hero pill. Priority:
// happening now → overdue work → due today → next test → next class →
// free day. All inputs are pre-resolved real rows (never fabricated).
export function dashboardRecommendation({ today, current, next, overdueCount = 0, dueTodayCount = 0, nextTest = null, classesToday = 0 }) {
  if (current) {
    return { key: 'ongoing', to: 'schedule', text: `${current.name || 'Class'} is happening now${current.end_time ? ` — it ends at ${current.end_time}` : ''}.` };
  }
  if (overdueCount > 0) {
    return { key: 'overdue', to: 'assignments', text: `${overdueCount} assignment${overdueCount === 1 ? ' is' : 's are'} overdue. Clear ${overdueCount === 1 ? 'it' : 'them'} before starting anything new.` };
  }
  if (dueTodayCount > 0) {
    return { key: 'due-today', to: 'assignments', text: `${dueTodayCount} assignment${dueTodayCount === 1 ? '' : 's'} due today — wrap ${dueTodayCount === 1 ? 'it' : 'them'} up before the day ends.` };
  }
  if (nextTest && isRealDate(nextTest.date)) {
    const d = daysBetweenISO(today, nextTest.date);
    const when = d == null ? '' : d === 0 ? ' today' : d === 1 ? ' tomorrow' : ` in ${d} day${d === 1 ? '' : 's'}`;
    return { key: 'test', to: 'tests', text: `${nextTest.name || 'A test'} is coming up${when} — a quick review session will pay off.` };
  }
  if (next) {
    return { key: 'next-class', to: 'schedule', text: `Next class: ${next.name || 'Class'}${next.start_time ? ` at ${next.start_time}` : ''}${next.room ? ` in ${next.room}` : ''}.` };
  }
  if (!classesToday) {
    return { key: 'free', to: 'planner', text: "You're done for today. Use the extra time to review your upcoming work." };
  }
  return { key: 'clear', to: 'planner', text: 'A clear stretch — a good moment to get ahead on upcoming work.' };
}

// ---------------- Attendance trend ----------------
// Per-week attendance over the last `weeks` ISO weeks (Monday-start,
// oldest first). Weeks with no records report total 0 / pct null — the
// UI renders "no data", never a fabricated value.
export function attendanceTrend(records, todayIso, weeks = 6) {
  const ws = weekStart(todayIso);
  if (ws == null) return [];
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDaysISO(ws, -7 * i);
    const end = addDaysISO(start, 6);
    const stats = attendanceBetween(records, start, end);
    out.push({ start, end, ...stats });
  }
  return out;
}