// @vitest-environment jsdom
// Regression guard for Dashboard data accuracy.
//
// Before lib/queries.js every surface re-filtered its own rows, so the
// Dashboard could disagree with the page it summarised. These tests pin
// the four headline statistics to the shared selectors and prove the
// card count is derived from the same list the card's panel renders.

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

import {
  getTodayClasses, getDueAssignments, splitDueAssignments,
  getUpcomingTests, getUpcomingEvents, getUpcomingUserEvents,
  traceDashboardCounts,
} from './lib/queries.js';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const TODAY = '2026-10-03'; // Saturday

const schedule = [
  { id: 1, subject_id: 51, day_of_week: 6, start_time: '09:00', end_time: '10:50' },
  { id: 2, subject_id: 52, day_of_week: 6, start_time: '11:00', end_time: '12:40' },
  { id: 3, subject_id: 57, day_of_week: 6, start_time: '14:00', end_time: '14:40' },
  { id: 4, subject_id: 58, day_of_week: 4, start_time: '09:00', end_time: '10:00' },
  { id: 5, subject_id: 59, day_of_week: 6, start_time: 'bad', end_time: 'x' },
];

const assignments = [
  { id: 1, status: 'completed', due_date: '2026-10-05' },   // completed → excluded
  { id: 2, status: 'not_started', due_date: '2026-10-01' },// overdue → outstanding
  { id: 3, status: 'in_progress', due_date: '2026-10-03' },// due today → counted
  { id: 4, status: 'not_started', due_date: '2026-10-20' },// future → counted (the bug)
  { id: 5, status: 'not_started', due_date: '9999-12-31' },// sentinel → excluded
  { id: 6, status: 'not_started', due_date: null },         // invalid → excluded
];

const tests = [
  { id: 1, test_date: '2026-09-29', marks_obtained: 8 },  // past + graded → excluded
  { id: 2, test_date: '2026-10-26', marks_obtained: null },// upcoming → counted
  { id: 3, test_date: '2026-10-22', marks_obtained: 5 },  // future but graded → excluded
  { id: 4, test_date: '9999-12-31', marks_obtained: null },// sentinel → excluded
  { id: 5, test_date: '2026-10-10', marks_obtained: null },// upcoming → counted
];

const academicEvents = [
  { id: 1, title: 'Class Committee Meeting - 1', start_date: '2026-10-13', end_date: '2026-10-13' },
  { id: 2, title: 'Past Event', start_date: '2026-09-01', end_date: '2026-09-01' },
  { id: 3, title: 'Undated', start_date: '9999-12-31', end_date: '9999-12-31' },
  { id: 4, title: 'Running Event', start_date: '2026-10-01', end_date: '2026-10-20' }, // ongoing → counted
];

const userEvents = [
  { id: 7, title: 'Hackcache 26', start_date: '2026-10-23', end_date: '2026-10-24' },
  { id: 1, title: 'Class Committee Meeting - 1', start_date: '2026-10-13', end_date: '2026-10-13' }, // dupe of academic id 1
  { id: 8, title: 'Over', start_date: '2026-08-01', end_date: '2026-08-02' },
];

describe('getTodayClasses', () => {
  it("returns only today's timetable entries, not lunch or other days", () => {
    const today = getTodayClasses(schedule, TODAY);
    expect(today.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('keeps separate class blocks separate', () => {
    const blocks = [
      { id: 1, day_of_week: 6, start_time: '14:00', end_time: '14:40' },
      { id: 2, day_of_week: 6, start_time: '14:40', end_time: '15:20' },
    ];
    expect(getTodayClasses(blocks, TODAY)).toHaveLength(2);
  });

  it('is empty on a day with no timetable (weekend is not assumed)', () => {
    expect(getTodayClasses(schedule, '2026-10-04')).toEqual([]); // Sunday
  });

  it('drops rows with unusable times', () => {
    expect(getTodayClasses(schedule, TODAY).some((c) => c.id === 5)).toBe(false);
  });

  it('card count equals the list length (never a separate counter)', () => {
    const list = getTodayClasses(schedule, TODAY);
    expect(list.length).toBe(schedule.filter((c) => c.day_of_week === 6 && c.id !== 5).length);
  });
});

describe('getDueAssignments', () => {
  const due = getDueAssignments(assignments, TODAY);

  it('counts every outstanding assignment, not just overdue/due-today', () => {
    // The regression: a future-due incomplete assignment used to be
    // ignored, so the Dashboard claimed "All caught up!".
    expect(due.map((a) => a.id).sort()).toEqual([2, 3, 4]);
  });

  it('excludes completed, sentinel and invalid-date rows', () => {
    expect(due.some((a) => a.id === 1)).toBe(false);
    expect(due.some((a) => a.id === 5)).toBe(false);
    expect(due.some((a) => a.id === 6)).toBe(false);
  });

  it('an assignment due today counts', () => {
    expect(due.some((a) => a.id === 3)).toBe(true);
  });

  it('sorts overdue first, then soonest due date', () => {
    expect(due.map((a) => a.id)).toEqual([2, 3, 4]);
  });

  it('splits into the buckets the Dashboard and page tabs use', () => {
    const split = splitDueAssignments(due, TODAY);
    expect(split.overdue.map((a) => a.id)).toEqual([2]);
    expect(split.today.map((a) => a.id)).toEqual([3]);
    expect(split.later.map((a) => a.id)).toEqual([4]);
    // Nothing is lost or double-counted by the split.
    expect(split.overdue.length + split.today.length + split.later.length).toBe(due.length);
  });

  it('reports zero when there is genuinely nothing outstanding', () => {
    expect(getDueAssignments([{ id: 9, status: 'completed', due_date: '2026-10-01' }], TODAY)).toEqual([]);
  });
});

describe('getUpcomingTests', () => {
  const upcoming = getUpcomingTests(tests, TODAY);

  it('counts only future, ungraded, real-dated tests', () => {
    expect(upcoming.map((t) => t.id)).toEqual([5, 2]); // 10 Oct then 26 Oct
  });

  it('excludes past, graded and sentinel tests', () => {
    expect(upcoming.some((t) => t.id === 1)).toBe(false);
    expect(upcoming.some((t) => t.id === 3)).toBe(false);
    expect(upcoming.some((t) => t.id === 4)).toBe(false);
  });

  it('collapses duplicate ids', () => {
    const dup = [...tests, { id: 2, test_date: '2026-10-26', marks_obtained: null }];
    expect(getUpcomingTests(dup, TODAY).filter((t) => t.id === 2)).toHaveLength(1);
  });

  it('card count equals the list length', () => {
    expect(upcoming.length).toBe(2);
  });
});

describe('getUpcomingEvents', () => {
  const merged = getUpcomingEvents({ academicEvents, userEvents }, TODAY);

  it('unions the academic calendar with user-created events', () => {
    const titles = merged.map((e) => e.title);
    expect(titles).toContain('Class Committee Meeting - 1');
    expect(titles).toContain('Hackcache 26');
  });

  it('keeps an event that started earlier but has not ended', () => {
    expect(merged.some((e) => e.title === 'Running Event')).toBe(true);
  });

  it('excludes past and undated rows from both sources', () => {
    expect(merged.some((e) => e.title === 'Past Event')).toBe(false);
    expect(merged.some((e) => e.title === 'Undated')).toBe(false);
    expect(merged.some((e) => e.title === 'Over')).toBe(false);
  });

  it('de-duplicates the same event stored in both sources', () => {
    expect(merged.filter((e) => e.title === 'Class Committee Meeting - 1')).toHaveLength(1);
  });

  it('does not de-duplicate same-titled events on different dates', () => {
    const two = [
      { id: 1, title: 'Workshop', start_date: '2026-10-12', end_date: '2026-10-12' },
      { id: 2, title: 'Workshop', start_date: '2026-10-19', end_date: '2026-10-19' },
    ];
    expect(getUpcomingEvents({ academicEvents: two }, TODAY)).toHaveLength(2);
  });

  it('never collides ids across the two independent tables', () => {
    // Both tables have their own sequences, so raw id 1 exists in each.
    const mixed = getUpcomingEvents({
      academicEvents: [{ id: 1, title: 'Official', start_date: '2026-10-15', end_date: '2026-10-15' }],
      userEvents: [{ id: 1, title: 'Mine', start_date: '2026-10-16', end_date: '2026-10-16' }],
    }, TODAY);
    expect(mixed).toHaveLength(2);
    expect(new Set(mixed.map((e) => e.id)).size).toBe(2);
  });

  it('sorts nearest-first by the event date, not the registration deadline', () => {
    const dates = merged.map((e) => e.start_date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('card count equals the list length', () => {
    expect(merged.length).toBe(new Set(merged.map((e) => `${e.title}|${e.start_date}`)).size);
  });

  it('the user-events scope reuses the same qualifying rule', () => {
    // Scoped to user rows only: both dated future/ongoing rows qualify,
    // the past one is dropped, and no academic row leaks in.
    expect(getUpcomingUserEvents(userEvents, TODAY).map((e) => e.title).sort())
      .toEqual(['Class Committee Meeting - 1', 'Hackcache 26']);
  });
});

describe('traceDashboardCounts', () => {
  it('reports the source counts that must match the dashboard', () => {
    const trace = traceDashboardCounts(
      { schedule, assignments, tests, academicEvents, userEvents },
      TODAY,
    );
    expect(trace["TODAY'S CLASSES"].dashboard).toBe(3);
    expect(trace['ASSIGNMENTS DUE'].dashboard).toBe(3);
    expect(trace['UPCOMING TESTS'].dashboard).toBe(2);
    expect(trace['UPCOMING EVENTS'].final).toBe(
      trace['UPCOMING EVENTS']['academic qualifying'] + trace['UPCOMING EVENTS']['user qualifying']
      - trace['UPCOMING EVENTS']['duplicates removed'],
    );
    expect(trace['UPCOMING EVENTS']['duplicates removed']).toBe(1); // the cross-source dupe
  });
});

// ---------------------------------------------------------------------------
// End-to-end: mount the real Dashboard against the shared selectors and
// assert every stat tile's number equals its panel's record count.
// ---------------------------------------------------------------------------
const { AppContext } = await import('./state/AppContext.jsx');
const { useApp } = AppContext ? { useApp: null } : {};
void useApp;

const Dashboard = (await import('./components/modules/Dashboard.jsx')).default;

const DATA = {
  subjects: [
    { id: 51, name: 'Java', code: 'BTBC121', color: '#a78bfa' },
    { id: 52, name: 'Agents', code: 'BTBC122', color: '#38bdf8' },
  ],
  schedule: schedule.slice(0, 4),
  assignments: assignments.map((a, i) => ({ ...a, subject_id: 51, title: `Task ${i + 1}` })),
  tests: tests.map((t, i) => ({ ...t, name: `Test ${i + 1}`, subject_id: 51 })),
  events: academicEvents.map((e) => ({ ...e, event_type: 'college_event', priority: 'normal' })),
  hackathons: userEvents.map((e) => ({ ...e, event_type: 'Hackathon' })),
  attendance: [], sessions: [], goals: [], resources: [], bookmarks: [],
  dismissals: [], syncLogs: [],
};

const ANALYTICS = {
  overall: { avgPct: null, total: 0 },
  overallAtt: { present: 0, absent: 0, total: 0, pct: null },
  subjectAttendance: [], subjectStats: [], excludedPreCutoff: 0,
  buckets: { today: [], overdue: [], week: [], tomorrow: [], later: [] },
  assignStats: { total: 6, completed: 1, pending: 5, overdue: 1, completionPct: 17 },
  dueAssignments: getDueAssignments(DATA.assignments, TODAY),
  dueSplit: splitDueAssignments(getDueAssignments(DATA.assignments, TODAY), TODAY),
  upcomingTests: getUpcomingTests(DATA.tests, TODAY),
  upcomingEvents: getUpcomingEvents(
    { academicEvents: DATA.events, userEvents: DATA.hackathons },
    TODAY,
  ),
  todaySlots: getTodayClasses(DATA.schedule, TODAY),
  current: null, next: null,
  todayEvents: [], todayTests: [], todaySessions: [],
  notifications: [],
  study: { plannedMinutes: 0, completedMinutes: 0, completionPct: 0, weeklyMinutes: 0, weeklyCompletedMinutes: 0, bySubject: [] },
  goals: [],
  week: { start: '2026-09-28', end: '2026-10-04', lastStart: '2026-09-21', lastEnd: '2026-09-27' },
};

const noop = () => {};
const ctx = {
  supabaseEnabled: true,
  session: { user: { id: 'u1', email: 'a@b.com' }, access_token: 'tok' },
  profile: { id: 'u1', onboarded: true, full_name: 'Ada', program: 'B.Tech' },
  data: DATA,
  analytics: ANALYTICS,
  settings: { attendance_threshold: 75 },
  loading: false, error: null, toast: null, flash: noop,
  subjectName: () => null, subjectMap: new Map(), authReady: true,
  signUp: noop, signIn: noop, signInWithGoogle: noop, signOut: noop,
  sendPasswordReset: noop, saveProfile: noop, saveSettings: noop,
  insertRow: noop, updateRow: noop, deleteRow: noop, insertMany: noop,
  seedDemo: noop, clearDemo: noop, seedAllReal: noop,
  syncAttendanceNow: async () => ({}),
  today: TODAY,
};

async function mountDashboard() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(MemoryRouter, null,
      createElement(AppContext.Provider, { value: ctx }, createElement(Dashboard, null))));
  });
  return {
    container,
    root,
    // The stat tile value rendered next to each label.
    statValue(label) {
      const el = [...container.querySelectorAll('button, div')]
        .find((n) => n.className?.includes?.('or-stat') && n.textContent.includes(label));
      return el ? Number(el.querySelector('.tracking-\\[-0\\.02em\\]')?.textContent.trim()) : null;
    },
    // Count the rows rendered inside a named section panel.
    rowsIn(heading, selector) {
      const heads = [...container.querySelectorAll('h2')];
      const head = heads.find((h) => h.textContent.trim() === heading);
      if (!head) return null;
      const card = head.closest('.or-card');
      return card ? card.querySelectorAll(selector).length : null;
    },
    async unmount() { root.unmount(); container.remove(); },
  };
}

describe('Dashboard statistics equal the shared queries (end-to-end)', () => {
  it('the four tiles report the selector output, not a separate counter', async () => {
    const v = await mountDashboard();
    expect(v.statValue("Today's Classes")).toBe(getTodayClasses(DATA.schedule, TODAY).length);
    expect(v.statValue('Assignments Due')).toBe(getDueAssignments(DATA.assignments, TODAY).length);
    expect(v.statValue('Upcoming Tests')).toBe(getUpcomingTests(DATA.tests, TODAY).length);
    expect(v.statValue('Upcoming Events')).toBe(ANALYTICS.upcomingEvents.length);
    await v.unmount();
  });

  it("the Today's Classes card equals the classes listed below it", async () => {
    const v = await mountDashboard();
    expect(v.statValue("Today's Classes")).toBe(v.rowsIn("Today's Classes", '.or-inset'));
    await v.unmount();
  });

  it('the Upcoming Tests card equals the tests listed in its panel', async () => {
    const v = await mountDashboard();
    expect(v.statValue('Upcoming Tests')).toBe(v.rowsIn('Upcoming Tests', '.or-inset'));
    await v.unmount();
  });

  it('the Upcoming Events card equals the events listed in its panel', async () => {
    const v = await mountDashboard();
    expect(v.statValue('Upcoming Events')).toBe(v.rowsIn('Upcoming Events', '.or-inset'));
    await v.unmount();
  });

  it('Assignments Due reflects future work instead of claiming "All caught up!"', async () => {
    const v = await mountDashboard();
    expect(v.statValue('Assignments Due')).toBe(3); // overdue + today + future
    expect(v.container.textContent).not.toContain('All caught up!');
    await v.unmount();
  });
});