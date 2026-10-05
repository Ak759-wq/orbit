import { describe, it, expect } from 'vitest';
import {
  safePct, avg, round1, testPercentage, testStatsForSubject, overallTestStats,
  attendanceForRecords, attendanceProjection, classesToTarget,
  attendanceExcludedBeforeStart, ATTENDANCE_START_DATE,
  assignmentBuckets, assignmentStats, sessionMinutes, studyStats,
  goalProgress, classStatus, decorateDaySchedule, weeklySummary, buildNotifications,
  upcomingTestsList, upcomingCalendarEventsList, isEventUpcoming, isRealDate,
  academicRadar, dashboardRecommendation, attendanceTrend,
} from './calc.js';

describe('safePct — division-by-zero safety', () => {
  it('returns null for zero denominator', () => {
    expect(safePct(10, 0)).toBeNull();
  });
  it('returns null for non-finite inputs', () => {
    expect(safePct(NaN, 10)).toBeNull();
    expect(safePct(5, Infinity)).toBeNull();
    expect(safePct('5', 10)).toBeNull();
  });
  it('computes correctly', () => {
    expect(safePct(1, 4)).toBe(25);
    expect(safePct(2, 3)).toBe(66.7);
  });
  it('never returns NaN or Infinity', () => {
    for (const [a, b] of [[0, 0], [5, 0], [-1, 0], [NaN, 5], [5, NaN]]) {
      const v = safePct(a, b);
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
});

describe('avg / round1', () => {
  it('avg ignores non-numbers and empty lists', () => {
    expect(avg([60, 80])).toBe(70);
    expect(avg([])).toBeNull();
    expect(avg([NaN, 50])).toBe(50);
  });
  it('round1 rounds to one decimal', () => {
    expect(round1(66.66666)).toBe(66.7);
    expect(round1('x')).toBeNull();
  });
});

describe('test percentage & stats', () => {
  it('percentage = obtained / max × 100', () => {
    expect(testPercentage({ marks_obtained: 31, max_marks: 50 })).toBe(62);
  });
  it('ungraded tests yield null percentage', () => {
    expect(testPercentage({ marks_obtained: null, max_marks: 50 })).toBeNull();
  });

  const tests = [
    { name: 'T1', test_date: '2026-01-01', marks_obtained: 31, max_marks: 50 }, // 62%
    { name: 'T2', test_date: '2026-02-01', marks_obtained: 35.5, max_marks: 50 }, // 71%
    { name: 'T3', test_date: '2026-03-01', marks_obtained: 39, max_marks: 50 }, // 78%
  ];

  it('subject stats compute avg/high/low/latest in chronological order', () => {
    const s = testStatsForSubject([...tests].reverse());
    expect(s.count).toBe(3);
    expect(s.avgPct).toBe(70.3);
    expect(s.highest).toBe(78);
    expect(s.lowest).toBe(62);
    expect(s.latestPct).toBe(78);
  });

  it('trend: Java 62% → 78% = improving +16 points', () => {
    const s = testStatsForSubject(tests);
    expect(s.trend.direction).toBe('improving');
    expect(s.trend.delta).toBe(16);
    expect(s.trend.from).toBe(62);
    expect(s.trend.to).toBe(78);
  });

  it('trend declining and stable cases', () => {
    const declining = testStatsForSubject([
      { test_date: '2026-01-01', marks_obtained: 40, max_marks: 50 },
      { test_date: '2026-02-01', marks_obtained: 30, max_marks: 50 },
    ]);
    expect(declining.trend.direction).toBe('declining');
    expect(declining.trend.delta).toBe(-20);

    const stable = testStatsForSubject([
      { test_date: '2026-01-01', marks_obtained: 40, max_marks: 50 },
      { test_date: '2026-02-01', marks_obtained: 40.2, max_marks: 50 },
    ]);
    expect(stable.trend.direction).toBe('stable');
  });

  it('overallTestStats aggregates', () => {
    const o = overallTestStats(tests);
    expect(o.total).toBe(3);
    expect(o.avgPct).toBe(70.3);
    expect(o.latestName).toBe('T3');
  });
});

describe('attendance', () => {
  const recs = [
    { status: 'present' }, { status: 'present' }, { status: 'absent' }, { status: 'present' },
  ]; // 75%

  it('attendanceForRecords computes present/total/pct', () => {
    expect(attendanceForRecords(recs)).toEqual({ total: 4, present: 3, absent: 1, pct: 75 });
  });

  // ---- HARD RULE: attendance starts at ATTENDANCE_START_DATE ----
  it('excludes records before the attendance start date from every count', () => {
    const dated = [
      { class_date: '2026-08-10', status: 'present' },
      { class_date: '2026-08-24', status: 'absent' },
      { class_date: '2026-08-25', status: 'present' }, // boundary: counted
      { class_date: '2026-09-01', status: 'absent' },
    ];
    expect(attendanceForRecords(dated)).toEqual({ total: 2, present: 1, absent: 1, pct: 50 });
  });
  it('keeps undated (legacy manual) records', () => {
    expect(attendanceForRecords([{ status: 'present' }, { status: 'absent' }]).total).toBe(2);
  });
  it('boundary date 2026-08-25 itself is counted', () => {
    expect(attendanceForRecords([{ class_date: ATTENDANCE_START_DATE, status: 'present' }]).total).toBe(1);
  });
  it('excluded-before-start helper reports the right count', () => {
    const dated = [
      { class_date: '2026-08-10', status: 'present' },
      { class_date: '2026-08-24', status: 'present' },
      { class_date: '2026-08-25', status: 'absent' },
      { status: 'present' }, // undated: included
    ];
    expect(attendanceExcludedBeforeStart(dated)).toBe(2);
  });
  it('subject-wise aggregation inherits the cutoff (AppContext path)', () => {
    // Mirror of AppContext: per-subject filter then attendanceForRecords.
    const all = [
      { subject_id: 1, class_date: '2026-08-11', status: 'present' },
      { subject_id: 1, class_date: '2026-08-25', status: 'present' },
      { subject_id: 1, class_date: '2026-08-25', status: 'present' },
      { subject_id: 2, class_date: '2026-08-12', status: 'absent' },
    ];
    const java = all.filter((r) => r.subject_id === 1);
    expect(attendanceForRecords(java).total).toBe(2);
  });
  it('zero records → null pct, not NaN', () => {
    expect(attendanceForRecords([]).pct).toBeNull();
  });
  it('projection: attend next (3+1)/(4+1)=80%, miss → 60%', () => {
    const p = attendanceProjection(recs, 1);
    expect(p.attend).toBe(80);
    expect(p.miss).toBe(60);
  });
  it('classesToTarget: 3/4 now, target 80 → need 1', () => {
    expect(classesToTarget(recs, 80).need).toBe(1);
    expect(classesToTarget(recs, 80).feasible).toBe(true);
  });
  it('classesToTarget: already at target → 0', () => {
    expect(classesToTarget(recs, 75).need).toBe(0);
  });
  it('classesToTarget: target 100 unreachable unless perfect', () => {
    expect(classesToTarget(recs, 100).feasible).toBe(false);
    expect(classesToTarget([{ status: 'present' }, { status: 'present' }], 100).need).toBe(0);
  });
  it('classesToTarget math checks out on a longer run', () => {
    const recs2 = Array.from({ length: 10 }, (_, i) => ({ status: i < 6 ? 'present' : 'absent' })); // 60%
    const r = classesToTarget(recs2, 75);
    // (0.75·10 − 6)/(0.25) = 6 → need 6
    expect(r.need).toBe(6);
    const { present, total } = attendanceForRecords(recs2);
    expect(safePct(present + 6, total + 6)).toBeGreaterThanOrEqual(75);
  });
});

describe('assignments', () => {
  const today = '2026-10-01';
  const rows = [
    { id: 1, title: 'past', due_date: '2026-09-28', status: 'not_started' },
    { id: 2, title: 'today', due_date: '2026-10-01', status: 'in_progress' },
    { id: 3, title: 'tomorrow', due_date: '2026-10-02', status: 'not_started' },
    { id: 4, title: 'week', due_date: '2026-10-05', status: 'not_started' },
    { id: 5, title: 'later', due_date: '2026-10-20', status: 'not_started' },
    { id: 6, title: 'done-past', due_date: '2026-09-01', status: 'completed' },
  ];
  it('buckets classify correctly; completed never overdue', () => {
    const b = assignmentBuckets(rows, today, '2026-10-02', '2026-10-07');
    expect(b.overdue.map((a) => a.id)).toEqual([1]);
    expect(b.today.map((a) => a.id)).toEqual([2]);
    expect(b.tomorrow.map((a) => a.id)).toEqual([3]);
    expect(b.week.map((a) => a.id)).toEqual([4]);
    expect(b.later.map((a) => a.id)).toEqual([5]);
  });
  it('assignmentStats computes completion', () => {
    const s = assignmentStats(rows, today);
    expect(s.total).toBe(6);
    expect(s.completed).toBe(1);
    expect(s.pending).toBe(5);
    expect(s.overdue).toBe(1);
    expect(s.completionPct).toBe(16.7);
  });
  it('empty list → null completion pct', () => {
    expect(assignmentStats([], today).completionPct).toBeNull();
  });
});

describe('study sessions', () => {
  it('sessionMinutes handles normal and invalid spans', () => {
    expect(sessionMinutes({ start_time: '17:00', end_time: '18:30' })).toBe(90);
    expect(sessionMinutes({ start_time: '18:30', end_time: '17:00' })).toBe(0);
  });
  it('studyStats splits planned/completed/weekly', () => {
    const sessions = [
      { session_date: '2026-09-30', start_time: '10:00', end_time: '11:00', status: 'completed' },
      { session_date: '2026-10-01', start_time: '10:00', end_time: '12:00', status: 'planned' },
      { session_date: '2026-09-01', start_time: '10:00', end_time: '11:00', status: 'completed' },
    ];
    const s = studyStats(sessions, '2026-09-28', '2026-10-04');
    expect(s.plannedMinutes).toBe(240); // all sessions
    expect(s.completedMinutes).toBe(120); // both completed sessions
    expect(s.weeklyMinutes).toBe(180); // sessions within week window
    expect(s.completionPct).toBe(50);
  });
});

describe('goals', () => {
  it('goal progress = current / target × 100', () => {
    expect(goalProgress({ target_value: 85, current_value: 70.6 })).toBe(83.1);
    expect(goalProgress({ target_value: 50, current_value: 25 })).toBe(50);
  });
  it('handles bad values safely', () => {
    expect(goalProgress({ target_value: 0, current_value: 5 })).toBeNull();
    expect(goalProgress({ target_value: 'x', current_value: 5 })).toBeNull();
  });
});

describe('class status', () => {
  it('upcoming / ongoing / completed by current time', () => {
    expect(classStatus(540, 600, 500)).toBe('upcoming');
    expect(classStatus(540, 600, 570)).toBe('ongoing');
    expect(classStatus(540, 600, 601)).toBe('completed');
  });
  it('decorateDaySchedule finds current & next', () => {
    const { current, next } = decorateDaySchedule([
      { id: 1, start_time: '09:00', end_time: '10:00' },
      { id: 2, start_time: '10:00', end_time: '11:00' },
      { id: 3, start_time: '13:00', end_time: '14:00' },
    ], 630); // 10:30
    expect(current.id).toBe(2);
    expect(next.id).toBe(3);
  });
});

describe('weeklySummary — sentences from data only', () => {
  const ctx = {
    tests: [{ test_date: '2026-09-29', marks_obtained: 38, max_marks: 50 }], // 76%
    assignments: [
      { due_date: '2026-09-30', status: 'completed' },
      { due_date: '2026-10-01', status: 'in_progress' },
      { due_date: '2026-09-28', status: 'not_started' },
      { due_date: '2026-09-30', status: 'completed' },
      { due_date: '2026-09-29', status: 'completed' },
      { due_date: '2026-09-29', status: 'completed' },
      { due_date: '2026-09-28', status: 'completed' },
    ],
    attendanceRecords: [
      { class_date: '2026-09-29', status: 'present' },
      { class_date: '2026-09-30', status: 'present' },
      { class_date: '2026-10-01', status: 'absent' },
      { class_date: '2026-09-22', status: 'absent' },
      { class_date: '2026-09-23', status: 'present' },
    ],
    sessions: [{ session_date: '2026-09-30', start_time: '10:00', end_time: '11:30', status: 'completed' }],
    thisWeekStart: '2026-09-28',
    thisWeekEnd: '2026-10-04',
    lastWeekStart: '2026-09-21',
    lastWeekEnd: '2026-09-27',
    subjectTrends: [{ name: 'Java', trend: { from: 68, to: 79, delta: 11, direction: 'improving' } }],
  };

  it('mentions 1 test with 76% average', () => {
    const lines = weeklySummary(ctx).join(' ');
    expect(lines).toContain('1 test');
    expect(lines).toContain('76%');
  });
  it('mentions assignments completed this week (5 of 7 due this week)', () => {
    const lines = weeklySummary(ctx).join(' ');
    expect(lines).toContain('5 of 7 assignments');
  });
  it('mentions attendance with week-over-week delta', () => {
    const lines = weeklySummary(ctx).join(' ');
    expect(lines).toContain('2 of 3 classes (66.7%)');
    expect(lines).toContain('from last week');
  });
  it('mentions study hours', () => {
    const lines = weeklySummary(ctx).join(' ');
    expect(lines).toContain('1h 30m');
  });
  it('mentions Java improvement', () => {
    const lines = weeklySummary(ctx).join(' ');
    expect(lines).toContain('Java score moved from 68% to 79%');
  });
});

describe('buildNotifications', () => {
  const today = '2026-10-01';
  const data = {
    tests: [{ id: 1, name: 'Java Quiz', test_date: '2026-10-03', test_type: 'quiz', subjectName: 'Java' }],
    assignments: [
      { id: 2, title: 'Essay', due_date: '2026-10-02', status: 'not_started', subjectName: 'CS' },
      { id: 3, title: 'Old', due_date: '2026-09-20', status: 'not_started', subjectName: 'CS' },
    ],
    events: [
      { id: 4, title: 'Mid-Sem', event_type: 'midsem', start_date: '2026-10-10', end_date: '2026-10-14', priority: 'high' },
      { id: 6, title: 'DS Practical', event_type: 'practical', start_date: '2026-10-04', end_date: '2026-10-04', priority: 'normal' },
    ],
    subjectAttendance: [{ subjectId: 1, name: 'Java', total: 10, present: 7, pct: 70, required: 75 }],
    sessions: [{ id: 5, session_date: today, status: 'planned', topic: 'Revise', subjectName: 'Java' }],
  };
  const settings = { enabled_types: ['upcoming_test', 'assignment_deadline', 'overdue_assignment', 'upcoming_exam', 'low_attendance', 'study_session', 'academic_event'], days_ahead: 7, attendance_threshold: 75 };

  it('generates test/deadline/overdue/exam/low-attendance/study reminders', () => {
    const notes = buildNotifications(data, settings, today);
    const titles = notes.map((n) => n.title).join(' | ');
    expect(titles).toContain('Test in 2 days: Java Quiz');
    expect(titles).toContain('Due tomorrow: Essay');
    expect(titles).toContain('1 assignment overdue');
    expect(titles).toContain('Java attendance is 70%');
    expect(titles).toContain('1 study session today');
  });
  it('respects disabled notification types', () => {
    const off = { ...settings, enabled_types: ['upcoming_test'] };
    const notes = buildNotifications(data, off, today);
    expect(notes.every((n) => n.type === 'upcoming_test')).toBe(true);
  });
  it('generates exam reminder for exam-type event', () => {
    const notes = buildNotifications(data, settings, today);
    const exam = notes.find((n) => n.type === 'upcoming_exam');
    expect(exam).toBeTruthy();
    expect(exam.title).toContain('DS Practical');
  });
  it('window days_ahead gates reminders', () => {
    const tight = { ...settings, days_ahead: 1 };
    const notes = buildNotifications(data, tight, today);
    expect(notes.some((n) => n.type === 'upcoming_test')).toBe(false);
  });
  it('attendance below per-subject requirement triggers only once per subject', () => {
    const notes = buildNotifications(data, settings, today);
    const low = notes.filter((n) => n.type === 'low_attendance');
    expect(low).toHaveLength(1);
  });
});

describe('isRealDate / isEventUpcoming', () => {
  it('rejects null, blank, garbage and the 9999-12-31 sentinel', () => {
    for (const bad of [null, undefined, '', '  ', 'not-a-date', '2026-13-45', '9999-12-31']) {
      expect(isRealDate(bad)).toBe(false);
    }
    expect(isRealDate('2026-10-05')).toBe(true);
  });
  it('event with end_date counts while it has not ended (today incl.)', () => {
    expect(isEventUpcoming({ end_date: '2026-10-01', start_date: '2026-09-28' }, '2026-10-01')).toBe(true);
    expect(isEventUpcoming({ end_date: '2026-09-30', start_date: '2026-09-28' }, '2026-10-01')).toBe(false);
  });
  it('event without end_date falls back to start_date', () => {
    expect(isEventUpcoming({ end_date: null, start_date: '2026-10-02' }, '2026-10-01')).toBe(true);
    expect(isEventUpcoming({ end_date: null, start_date: '2026-10-01' }, '2026-10-01')).toBe(true);
    expect(isEventUpcoming({ end_date: null, start_date: '2026-09-30' }, '2026-10-01')).toBe(false);
  });
  it('dateless / sentinel events never count as upcoming', () => {
    expect(isEventUpcoming({ end_date: '9999-12-31', start_date: '9999-12-31' }, '2026-10-01')).toBe(false);
    expect(isEventUpcoming({ end_date: null, start_date: null }, '2026-10-01')).toBe(false);
    expect(isEventUpcoming(null, '2026-10-01')).toBe(false);
  });
  it('registration deadline never decides upcomingness', () => {
    expect(isEventUpcoming({ end_date: '2026-10-10', start_date: '2026-10-10', reg_deadline: '2026-10-05' }, '2026-10-06')).toBe(true);
  });
});

describe('upcomingTestsList — dashboard Upcoming Tests count', () => {
  const T = '2026-10-01';
  it('counts only tests on/after today that are not graded', () => {
    const tests = [
      { id: 1, name: 'Past', test_date: '2026-09-30', marks_obtained: null },
      { id: 2, name: 'Today', test_date: '2026-10-01', marks_obtained: null },
      { id: 3, name: 'Future', test_date: '2026-10-05', marks_obtained: null },
      { id: 4, name: 'Graded', test_date: '2026-10-06', marks_obtained: 8 },
      { id: 5, name: 'Undated', test_date: null, marks_obtained: null },
      { id: 6, name: 'Garbage', test_date: 'soon', marks_obtained: null },
    ];
    const up = upcomingTestsList(tests, T);
    expect(up.map((t) => t.name)).toEqual(['Today', 'Future']);
  });
  it('dedupes duplicate ids and keeps nearest first, uncapped', () => {
    const tests = [
      { id: 3, name: 'Later', test_date: '2026-10-10', marks_obtained: null },
      { id: 1, name: 'First', test_date: '2026-10-02', marks_obtained: null },
      { id: 1, name: 'First-dup', test_date: '2026-10-02', marks_obtained: null },
      { id: 2, name: 'Middle', test_date: '2026-10-05', marks_obtained: null },
    ];
    const up = upcomingTestsList(tests, T);
    expect(up).toHaveLength(3);
    expect(up.map((t) => t.name)).toEqual(['First', 'Middle', 'Later']);
  });
  it('live regression: the two real DB tests are past+graded ⇒ count 0 (never 7)', () => {
    const tests = [
      { id: 2, name: 'java test 1', test_date: '2026-09-29', marks_obtained: 8 },
      { id: 7, name: 'Web dev', test_date: '2026-09-29', marks_obtained: 9 },
    ];
    expect(upcomingTestsList(tests, '2026-10-01')).toHaveLength(0);
  });
});

describe('upcomingCalendarEventsList — dashboard Upcoming Events count', () => {
  const T = '2026-10-01';
  it('excludes past and ended events, keeps ongoing/future, nearest first', () => {
    const events = [
      { id: 244, title: 'Holiday Oct 2', event_type: 'holiday', start_date: '2026-10-02', end_date: '2026-10-02' },
      { id: 241, title: 'Semester start', event_type: 'semester_start', start_date: '2026-08-03', end_date: '2026-08-03' },
      { id: 259, title: 'Practical exams', event_type: 'practical', start_date: '2027-01-11', end_date: '2027-01-14' },
    ];
    const up = upcomingCalendarEventsList(events, T);
    expect(up.map((e) => e.title)).toEqual(['Holiday Oct 2', 'Practical exams']);
  });
  it('excludes 9999-12-31 dateless sentinels', () => {
    const events = [
      { id: 266, title: 'Announcement of Results (Odd Semester)', event_type: 'other', start_date: '9999-12-31', end_date: '9999-12-31' },
      { id: 287, title: 'Summer Term (Optional)', event_type: 'other', start_date: '9999-12-31', end_date: '9999-12-31' },
      { id: 2, title: 'Hackcache', event_type: 'Hackathon', start_date: '2026-10-23', end_date: '2026-10-24' },
    ];
    const up = upcomingCalendarEventsList(events, T);
    expect(up.map((e) => e.title)).toEqual(['Hackcache']);
  });
  it('dedupes duplicate ids and is uncapped (more than 8 counted)', () => {
    const events = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1, title: `E${i}`, event_type: 'holiday',
      start_date: `2026-10-${String(i + 2).padStart(2, '0')}`, end_date: `2026-10-${String(i + 2).padStart(2, '0')}`,
    }));
    events.push({ ...events[0] }); // duplicate id 1
    const up = upcomingCalendarEventsList(events, T);
    expect(up).toHaveLength(12);
  });
  it('live regression: real calendar shape (47 dated + 3 sentinels) + 1 custom ⇒ 45 counted (never 9)', () => {
    // Real shape for akpro4208 on 2026-10-01: 50 academic rows — 3 already
    // past, 3 undated sentinels, 44 still ahead — plus 1 custom event.
    const academic = [
      { id: 241, title: 'Commencement of Odd Semester (BST)', event_type: 'semester_start', start_date: '2026-08-03', end_date: '2026-08-03' },
      { id: 242, title: 'Government Holiday - Ganesh Chaturthi', event_type: 'holiday', start_date: '2026-09-14', end_date: '2026-09-14' },
      { id: 243, title: 'Freezing of Marks CIA - 1', event_type: 'assignment', start_date: '2026-09-28', end_date: '2026-09-28' },
      ...Array.from({ length: 44 }, (_, i) => ({
        id: 244 + i, title: `Upcoming calendar row ${i + 1}`, event_type: 'holiday',
        start_date: '2026-10-02', end_date: '2026-10-02',
      })),
      { id: 266, title: 'Announcement of Results (Odd Semester)', event_type: 'other', start_date: '9999-12-31', end_date: '9999-12-31' },
      { id: 286, title: 'Announcement of Results (SEE - July 2027)', event_type: 'other', start_date: '9999-12-31', end_date: '9999-12-31' },
      { id: 287, title: 'Summer Term (Optional)', event_type: 'other', start_date: '9999-12-31', end_date: '9999-12-31' },
    ];
    const custom = [{ id: 2, title: "Hackcache '26 | Cachedinfo", event_type: 'Hackathon', start_date: '2026-10-23', end_date: '2026-10-24', reg_deadline: '2026-10-20' }];
    const up = upcomingCalendarEventsList([...academic, ...custom], '2026-10-01');
    expect(up).toHaveLength(45); // 47 dated − 3 past + 1 custom
    expect(up.some((e) => e.start_date === '9999-12-31')).toBe(false);
  });
});

describe('academicRadar — dashboard attention list', () => {
  const T = '2026-10-03';
  it('merges ungraded future tests + open assignments + upcoming events, date-sorted', () => {
    const items = academicRadar({
      today: T,
      tests: [
        { id: 1, name: 'Math Internal 1', test_date: '2026-10-26', marks_obtained: null },
        { id: 2, name: 'Graded past test', test_date: '2026-09-29', marks_obtained: 8 }, // excluded: graded
        { id: 3, name: 'Future graded', test_date: '2026-10-30', marks_obtained: 9 }, // excluded: graded
      ],
      assignments: [
        { id: 10, title: 'Web Portfolio', due_date: '2026-10-08', status: 'not_started' },
        { id: 11, title: 'Old overdue', due_date: '2026-09-20', status: 'in_progress' }, // included: overdue
        { id: 12, title: 'Completed task', due_date: '2026-10-08', status: 'completed' }, // excluded
      ],
      events: [
        { id: 20, title: 'Class Committee Meeting', event_type: 'college_event', start_date: '2026-10-13', end_date: '2026-10-13' },
        { id: 21, title: 'Mahanavami', event_type: 'holiday', start_date: '2026-10-20', end_date: '2026-10-20' },
        { id: 22, title: 'TBA sentinel', event_type: 'other', start_date: '9999-12-31', end_date: '9999-12-31' }, // excluded
        { id: 23, title: 'Past event', event_type: 'other', start_date: '2026-09-01', end_date: '2026-09-02' }, // excluded
      ],
      customEvents: [
        { id: 30, title: "Hackcache '26", event_type: 'Hackathon', start_date: '2026-10-23', end_date: '2026-10-24' },
      ],
    });
    expect(items.map((i) => i.id)).toEqual([
      'assign-11', 'assign-10', 'event-20', 'event-21', 'custom-30', 'test-1',
    ]);
    expect(items.find((i) => i.id === 'assign-11').overdue).toBe(true);
    expect(items.find((i) => i.id === 'event-21').kind).toBe('HOLIDAY');
    expect(items.find((i) => i.id === 'test-1').daysLeft).toBe(23);
  });
  it('never invents entries from empty data', () => {
    expect(academicRadar({ today: T })).toEqual([]);
  });
  it('live regression: Aditya 2026-10-03 — 0 radar tests (both graded+past), Hackcache appears once', () => {
    const items = academicRadar({
      today: T,
      tests: [
        { id: 2, name: 'java test 1', test_date: '2026-09-29', marks_obtained: 8 },
        { id: 7, name: 'Web dev', test_date: '2026-09-29', marks_obtained: 9 },
      ],
      assignments: [],
      events: [
        { id: 300, title: 'Freezing of Marks CIA - 1', event_type: 'assignment', start_date: '2026-09-28', end_date: '2026-09-28' },
        { id: 266, title: 'Results (Odd)', event_type: 'other', start_date: '9999-12-31', end_date: '9999-12-31' },
      ],
      customEvents: [{ id: 2, title: "Hackcache '26", start_date: '2026-10-23', end_date: '2026-10-24' }],
    });
    expect(items.filter((i) => i.kind === 'TEST')).toHaveLength(0);
    expect(items.filter((i) => i.title.includes('Hackcache'))).toHaveLength(1);
  });
});

describe('dashboardRecommendation — honest context message', () => {
  const T = '2026-10-03';
  it('prioritizes the ongoing class', () => {
    const r = dashboardRecommendation({ today: T, current: { name: 'Java', end_time: '10:50' }, classesToday: 3 });
    expect(r.key).toBe('ongoing');
    expect(r.text).toContain('Java is happening now');
    expect(r.text).toContain('10:50');
  });
  it('then overdue assignments, then due today', () => {
    const r = dashboardRecommendation({ today: T, overdueCount: 2, dueTodayCount: 1 });
    expect(r.key).toBe('overdue');
    expect(r.text).toContain('2 assignments are overdue');
    const r2 = dashboardRecommendation({ today: T, overdueCount: 0, dueTodayCount: 1 });
    expect(r2.key).toBe('due-today');
  });
  it('then the next upcoming test with a real countdown', () => {
    const r = dashboardRecommendation({ today: T, nextTest: { name: 'Java Quiz', date: '2026-10-20' } });
    expect(r.key).toBe('test');
    expect(r.text).toContain('Java Quiz is coming up in 17 days');
  });
  it('then the next class of the day', () => {
    const r = dashboardRecommendation({ today: T, next: { name: 'Yoga', start_time: '14:40', room: 'Studio' }, classesToday: 2 });
    expect(r.key).toBe('next-class');
    expect(r.text).toContain('Yoga at 14:40 in Studio');
  });
  it('free day only when there are truly no classes today', () => {
    const r = dashboardRecommendation({ today: T, classesToday: 0 });
    expect(r.key).toBe('free');
    expect(r.text).toBe("You're done for today. Use the extra time to review your upcoming work.");
    const r2 = dashboardRecommendation({ today: T, classesToday: 1, next: null });
    expect(r2.key).toBe('clear');
  });
  it('ignores a nextTest whose date is the sentinel (never shows a fake countdown)', () => {
    const r = dashboardRecommendation({ today: T, nextTest: { name: 'TBA Test', date: '9999-12-31' }, classesToday: 0 });
    expect(r.key).toBe('free');
  });
});

describe('attendanceTrend — weekly buckets', () => {
  it('buckets records into Monday-start weeks, oldest first', () => {
    const recs = [
      { class_date: '2026-09-21', status: 'present' }, // prior Monday
      { class_date: '2026-09-28', status: 'present' }, // today's week Monday (today = Sat 2026-10-03)
      { class_date: '2026-09-29', status: 'absent' },
    ];
    const trend = attendanceTrend(recs, '2026-10-03', 3);
    expect(trend).toHaveLength(3);
    expect(trend[2].start).toBe('2026-09-28');
    expect(trend[2].present).toBe(1);
    expect(trend[2].absent).toBe(1);
    expect(trend[2].pct).toBe(50);
    expect(trend[1].start).toBe('2026-09-21');
    expect(trend[1].total).toBe(1);
    expect(trend[1].pct).toBe(100);
    expect(trend[0].total).toBe(0);
    expect(trend[0].pct).toBeNull();
  });
  it('excludes records before ATTENDANCE_START_DATE (same rule as every surface)', () => {
    const recs = [{ class_date: '2026-08-01', status: 'present' }];
    const trend = attendanceTrend(recs, '2026-10-03', 2);
    expect(trend.every((w) => w.total === 0)).toBe(true);
  });
});
