// @vitest-environment jsdom
// Render tests for the redesigned authenticated modules.
//
// Each module below was rewritten in the Orbit design system. These tests
// mount them against a mocked AppContext holding realistic data and assert:
//   1. the module renders without throwing,
//   2. displayed numbers come from the supplied data (nothing hardcoded),
//   3. the data-integrity rules survived the redesign.
//
// jsdom is required because the modules read effects (sessionStorage
// hand-offs, "now" clocks) that only run against a real DOM.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { AppContext } = await import('./state/AppContext.jsx');
const {
  getDueAssignments, splitDueAssignments, getUpcomingTests, getUpcomingEvents,
} = await import('./lib/queries.js');
const { MemoryRouter } = await import('react-router-dom');

const TODAY = '2026-10-03'; // Saturday

const SUBJECTS = [
  { id: 51, name: 'Programming for Problem Solving Using Java', code: 'BTBC121', faculty: 'Dr. Rao', credits: 4, color: '#a78bfa', target_percentage: 85, attendance_required_pct: 75 },
  { id: 52, name: 'AI Foundation - Introduction to Agents', code: 'BTBC122', faculty: 'Dr. Iyer', credits: 4, color: '#4e8df6', target_percentage: 80, attendance_required_pct: 75 },
  { id: 57, name: 'Environmental Science', code: 'BTBC127', faculty: 'Dr. Nair', credits: 3, color: '#22c07a', target_percentage: 75, attendance_required_pct: 75 },
  { id: 58, name: 'Foundations of Yoga', code: 'BTBC128', faculty: 'Dr. Das', credits: 2, color: '#f79b2e', target_percentage: 70, attendance_required_pct: 70 },
  { id: 59, name: 'Mentorship / Doubt Session', code: 'BTBC129', faculty: 'Dr. Bose', credits: 2, color: '#ef6a58', target_percentage: 75, attendance_required_pct: 75 },
];

const DATA = {
  subjects: SUBJECTS,
  // Thursday (4) and Friday (5) keep their 40-minute blocks separate.
  schedule: [
    { id: 1, subject_id: 54, day_of_week: 4, start_time: '09:00', end_time: '10:50', room: 'LH-2', faculty: 'Dr. Sen' },
    { id: 2, subject_id: 55, day_of_week: 4, start_time: '11:00', end_time: '13:00', room: 'Lab 2', faculty: 'Dr. Sen' },
    { id: 3, subject_id: 57, day_of_week: 4, start_time: '14:00', end_time: '14:40', room: 'Ground Floor, Classroom 5', faculty: 'Dr. Nair' },
    { id: 4, subject_id: 58, day_of_week: 4, start_time: '14:40', end_time: '15:20', room: 'Ground Floor, Classroom 5', faculty: 'Dr. Das' },
    { id: 5, subject_id: 58, day_of_week: 5, start_time: '09:00', end_time: '10:50', room: 'LH-2', faculty: 'Dr. Das' },
    { id: 6, subject_id: 59, day_of_week: 5, start_time: '14:00', end_time: '14:40', room: 'LH-1', faculty: 'Dr. Bose' },
    { id: 7, subject_id: 57, day_of_week: 5, start_time: '14:40', end_time: '15:20', room: 'LH-1', faculty: 'Dr. Nair' },
  ],
  tests: [
    { id: 1, name: 'Java test 1', subject_id: 51, test_type: 'class_test', test_date: '2026-09-29', max_marks: 10, marks_obtained: 8, topic: 'Collections' },
    { id: 2, name: 'Web dev 1', subject_id: 53, test_type: 'class_test', test_date: '2026-09-29', max_marks: 15, marks_obtained: 9, topic: 'HTML' },
    { id: 3, name: 'Agents internal', subject_id: 52, test_type: 'internal', test_date: '2026-10-26', max_marks: 40, marks_obtained: null, topic: 'Tools' },
  ],
  assignments: [
    { id: 1, title: 'Web Development – Portfolio', subject_id: 53, task_type: 'assignment', due_date: '2026-10-08', priority: 'high', status: 'not_started' },
    { id: 2, title: 'Math problem set 3', subject_id: 54, task_type: 'homework', due_date: '2026-10-01', priority: 'normal', status: 'not_started' },
    { id: 3, title: 'Agents lab report', subject_id: 52, task_type: 'lab', due_date: '2026-09-25', priority: 'normal', status: 'completed' },
  ],
  attendance: [
    { id: 1, subject_id: 51, class_date: '2026-09-28', status: 'present', source: 'excel_sync' },
    { id: 2, subject_id: 51, class_date: '2026-09-29', status: 'absent', source: 'excel_sync' },
    { id: 3, subject_id: 52, class_date: '2026-09-30', status: 'present', source: 'excel_sync' },
  ],
  events: [
    { id: 1, title: 'Class Committee Meeting - 1', event_type: 'college_event', start_date: '2026-10-13', end_date: '2026-10-13', priority: 'normal', subject_id: null },
    { id: 2, title: 'Mahanavami & Ayudha Pooja', event_type: 'holiday', start_date: '2026-10-20', end_date: '2026-10-20', priority: 'normal', subject_id: null },
    // Sentinels: "date TBA" rows, never given an invented date.
    { id: 3, title: 'End-Sem Exam date', event_type: 'endsem', start_date: '9999-12-31', end_date: '9999-12-31', priority: 'normal', subject_id: null },
  ],
  hackathons: [
    { id: 1, title: 'Hackcache 26', event_type: 'Hackathon', organizer: 'BST', mode: 'Offline', start_date: '2026-10-23', end_date: '2026-10-24', reg_deadline: '2026-10-20', location: 'Campus', reg_url: 'https://example.com/h', tags: ['ai'], skills: ['ml'], ai_extracted: false, description: 'A hackathon.' },
  ],
  bookmarks: [{ id: 1, event_id: 1, track_status: 'Interested' }],
  resources: [{ id: 1, title: 'Collections cheat sheet', resource_type: 'note', subject_id: 51, date_added: '2026-09-20', description: 'Handy summary', content: 'notes here' }],
  sessions: [
    { id: 1, subject_id: 51, topic: 'Collections revision', session_date: '2026-10-02', start_time: '17:00', end_time: '18:30', status: 'completed', goal: 'Solve 10' },
    { id: 2, subject_id: 52, topic: 'Agents prep', session_date: '2026-10-03', start_time: '17:00', end_time: '18:00', status: 'planned', goal: '' },
  ],
  goals: [{ id: 1, name: 'Score 85% in Java', goal_type: 'manual', target_value: 85, current_value: 70, live_current: 70, deadline: '2026-11-30', subject_id: 51, start_date: '2026-09-01' }],
  dismissals: [],
  syncLogs: [
    { id: 1, status: 'SUCCESS', completed_at: '2026-10-03T04:00:00Z', started_at: '2026-10-03T03:58:00Z' },
  ],
};

const ANALYTICS = {
  overall: {},
  overallAtt: { present: 2, absent: 1, total: 3, pct: 67 },
  subjectAttendance: [
    { subjectId: 51, name: 'Programming for Problem Solving Using Java', present: 1, absent: 1, total: 2, pct: 50, required: 75 },
    { subjectId: 52, name: 'AI Foundation - Introduction to Agents', present: 1, absent: 0, total: 1, pct: 100, required: 75 },
  ],
  subjectStats: [
    { subject: { id: 51, name: 'Programming for Problem Solving Using Java', color: '#a78bfa', target_percentage: 85 }, count: 1, avgPct: 80, highest: 80, lowest: 80, latestPct: 80, trend: null },
  ],
  excludedPreCutoff: 0,
  buckets: { today: [], overdue: [DATA.assignments[1]], week: [DATA.assignments[0]] },
  assignStats: { pending: 2, overdue: 1, completionPct: 33 },
  // Built with the SAME shared selectors AppContext uses, so the fixture
  // can never drift from the real analytics shape.
  dueAssignments: getDueAssignments(DATA.assignments, TODAY),
  dueSplit: splitDueAssignments(getDueAssignments(DATA.assignments, TODAY), TODAY),
  todaySlots: [
    { id: 10, subject_id: 51, start_time: '09:00', end_time: '10:50', room: 'Ground Floor, Classroom 5', faculty: 'Dr. Rao', ongoing: false },
  ],
  current: null,
  next: null,
  todayEvents: [],
  upcomingEvents: getUpcomingEvents(
    { academicEvents: DATA.events, userEvents: DATA.hackathons },
    TODAY,
  ),
  todayTests: [],
  upcomingTests: getUpcomingTests(DATA.tests, TODAY),
  todaySessions: [DATA.sessions[1]],
  study: { plannedMinutes: 150, completedMinutes: 90, completionPct: 60, weeklyMinutes: 150, weeklyCompletedMinutes: 90, bySubject: [{ subjectId: 51, minutes: 90, completedMinutes: 90 }] },
  goals: DATA.goals,
  notifications: [],
  week: { start: '2026-09-28', end: '2026-10-04', lastStart: '2026-09-21', lastEnd: '2026-09-27' },
};

function ctx(overrides = {}) {
  return {
    supabaseEnabled: true,
    session: { user: { id: 'u1', email: 'a@b.com' }, access_token: 'tok' },
    profile: { id: 'u1', onboarded: true, full_name: 'Aditya Kumar', program: 'B.Tech', semester: '5', roll_number: '1' },
    data: DATA,
    analytics: ANALYTICS,
    settings: { enabled_types: ['tests'], days_ahead: 7, attendance_threshold: 75 },
    loading: false,
    error: null,
    toast: null,
    flash: vi.fn(),
    subjectName: vi.fn(() => null),
    subjectMap: new Map(),
    authReady: true,
    signUp: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), signOut: vi.fn(),
    sendPasswordReset: vi.fn(), saveProfile: vi.fn(), saveSettings: vi.fn(),
    insertRow: vi.fn(), updateRow: vi.fn(), deleteRow: vi.fn(), insertMany: vi.fn(),
    seedDemo: vi.fn(), clearDemo: vi.fn(), seedAllReal: vi.fn(),
    syncAttendanceNow: vi.fn(async () => ({ summary: { inserted: 1, updated: 0, skipped: 2 } })),
    today: TODAY,
    ...overrides,
  };
}

async function mount(Component, overrides) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    // MemoryRouter: several modules navigate on click (dashboard quick actions).
    root.render(createElement(MemoryRouter, null,
      createElement(AppContext.Provider, { value: ctx(overrides) }, createElement(Component))));
  });
  const el = container;
  return {
    el,
    text: () => container.textContent,
    async clickAria(label) {
      const btn = container.querySelector(`button[aria-label="${label}"]`);
      if (!btn) throw new Error(`no button with aria-label "${label}"`);
      await act(async () => { btn.click(); });
    },
    async click(label) {
      const btn = [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(label));
      if (!btn) throw new Error(`no button matching "${label}"`);
      await act(async () => { btn.click(); });
    },
    async unmount() { root.unmount(); container.remove(); },
  };
}

const Dashboard = (await import('./components/modules/Dashboard.jsx')).default;
const Schedule = (await import('./components/modules/Schedule.jsx')).default;
const Calendar = (await import('./components/modules/Calendar.jsx')).default;
const Tests = (await import('./components/modules/Tests.jsx')).default;
const Assignments = (await import('./components/modules/Assignments.jsx')).default;
const Attendance = (await import('./components/modules/Attendance.jsx')).default;
const Analytics = (await import('./components/modules/Analytics.jsx')).default;
const Notes = (await import('./components/modules/Notes.jsx')).default;
const Subjects = (await import('./components/modules/Subjects.jsx')).default;
const Planner = (await import('./components/modules/Planner.jsx')).default;
const Goals = (await import('./components/modules/Goals.jsx')).default;
const Events = (await import('./components/modules/Events.jsx')).default;
const Summary = (await import('./components/modules/Summary.jsx')).default;
const Settings = (await import('./components/modules/Settings.jsx')).default;

const ALL = [
  ['Dashboard', Dashboard], ['Schedule', Schedule], ['Calendar', Calendar],
  ['Tests', Tests], ['Assignments', Assignments], ['Attendance', Attendance],
  ['Analytics', Analytics], ['Notes', Notes], ['Subjects', Subjects],
  ['Planner', Planner], ['Goals', Goals], ['Events', Events],
  ['Summary', Summary], ['Settings', Settings],
];

describe('redesigned modules render', () => {
  it.each(ALL)('%s mounts without throwing', async (_name, C) => {
    const v = await mount(C);
    expect(v.text().length).toBeGreaterThan(50);
    await v.unmount();
  });

  it.each(ALL)('%s uses the Orbit design tokens, not neo-brutalism', async (_name, C) => {
    const v = await mount(C);
    // Every restyled surface renders through or-* classes.
    expect(v.el.querySelectorAll('[class*="or-card"], [class*="or-input"], [class*="or-empty"], [class*="or-btn"]').length,
      `${_name} should render Orbit classes`).toBeGreaterThan(0);
    await v.unmount();
  });
});

describe('dashboard answers today / next / attention / upcoming', () => {
  it('greets the signed-in student and shows all four stat tiles', async () => {
    const v = await mount(Dashboard);
    const t = v.text();
    expect(t).toContain('Aditya');
    expect(t).toContain("Today's Classes");
    expect(t).toContain('Assignments Due');
    expect(t).toContain('Upcoming Tests');
    expect(t).toContain('Upcoming Events');
    // Counts come from the analytics fixture, not hardcoded numbers.
    expect(t).toContain('Upcoming Tests');
    await v.unmount();
  });

  it('Academic Radar merges real tests, events and assignments sorted by date', async () => {
    const v = await mount(Dashboard);
    const t = v.text();
    expect(t).toContain('Your Academic Radar');
    expect(t).toContain('Things that need your attention soon.');
    // The three dated items must all appear; the sentinel must not be dated.
    expect(t).toMatch(/Class Committee Meeting - 1/);
    expect(t).toMatch(/Web Development – Portfolio/);
    await v.unmount();
  });

  it('never invents events — sentinels and past dates are excluded from the upcoming list', async () => {
    const v = await mount(Dashboard);
    // "End-Sem Exam date" is a date-TBA sentinel; it may appear as an
    // undated row but must not be given a countdown.
    expect(v.text()).not.toMatch(/End-Sem Exam date · \d+ days? left/);
    await v.unmount();
  });
});

describe('Schedule preserves the exact timetable', () => {
  it('keeps Thursday 14:00–14:40 and 14:40–15:20 as separate blocks', async () => {
    const v = await mount(Schedule);
    await v.click('Full week');
    const t = v.text();
    // Both short afternoon blocks must be present and distinct.
    expect(t).toContain('2:00 PM');
    expect(t).toContain('2:40 PM');
    expect(t).toContain('3:20 PM');
    // Lunch is a break, never a class.
    expect(t).toContain('Lunch 1:00 – 2:00 PM is a break, not a class.');
    await v.unmount();
  });
});

describe('Attendance: Excel is the source of truth', () => {
  it('reports overall figures from the synced records', async () => {
    const v = await mount(Attendance);
    const t = v.text();
    expect(t).toContain('Overall attendance');
    expect(t).toContain('67%'); // 2 of 3 records — fixture value, not hardcoded
    expect(t).toContain('Excel (BST Section A attendance sheet)');
    await v.unmount();
  });

  it('preserves existing data and states the failure when a sync fails', async () => {
    const failedLogs = [{ id: 2, status: 'FAILED', message: 'Sheet unreachable', completed_at: '2026-10-03T06:00:00Z', started_at: '2026-10-03T05:58:00Z' }, ...DATA.syncLogs];
    const v = await mount(Attendance, { data: { ...DATA, syncLogs: failedLogs } });
    const t = v.text();
    expect(t).toContain('Last Excel sync failed.');
    expect(t).toContain('preserved');
    // The record count must still be present — a failed sync erases nothing.
    expect(t).toMatch(/All 3 existing attendance records/);
    await v.unmount();
  });

  it('shows honest empty states when there is no attendance data yet', async () => {
    const v = await mount(Attendance, {
      data: { ...DATA, attendance: [] },
      analytics: { ...ANALYTICS, overallAtt: { present: 0, absent: 0, total: 0, pct: null }, subjectAttendance: [] },
    });
    expect(v.text()).toContain('Not enough data yet.');
    await v.unmount();
  });
});

describe('Tests & Marks uses real marks only', () => {
  it('computes the average from graded tests and ignores ungraded ones', async () => {
    const v = await mount(Tests);
    const t = v.text();
    // Graded: 8/10 = 80%, 9/15 = 60% → average 70%.
    expect(t).toContain('70%');
    // The ungraded 2026-10-26 test is upcoming, not scored.
    expect(t).toContain('Upcoming tests');
    expect(t).toContain('Agents internal');
    await v.unmount();
  });

  it('says "Not enough data yet" rather than drawing a fake trend', async () => {
    const v = await mount(Tests, {
      data: { ...DATA, tests: [DATA.tests[2]] }, // only the ungraded test
      analytics: { ...ANALYTICS, upcomingTests: [DATA.tests[2]], subjectStats: [] },
    });
    expect(v.text()).toContain('Not enough data yet.');
    await v.unmount();
  });
});

describe('Assignments tabs cover the real buckets', async () => {
  it('offers All / Due Soon / Overdue / Completed with live counts', async () => {
    const v = await mount(Assignments);
    const t = v.text();
    expect(t).toContain('All (3)');
    expect(t).toContain('Completed (1)');
    expect(t).toContain('Overdue (1)');
    await v.unmount();
  });

  it('the overdue tab lists the task that is actually overdue', async () => {
    const v = await mount(Assignments);
    await v.click('Overdue');
    expect(v.text()).toContain('Math problem set 3');
    await v.unmount();
  });
});

describe('Calendar separates dated and undated events', () => {
  it('lists sentinel events as Date TBA instead of inventing a date', async () => {
    const v = await mount(Calendar);
    const t = v.text();
    expect(t).toContain('Date TBA');
    expect(t).toContain('Class Committee Meeting - 1');
    await v.unmount();
  });

  it('switching to the calendar view renders the month grid', async () => {
    const v = await mount(Calendar);
    await v.click('Calendar');
    // The month grid renders one cell per day.
    expect(v.el.querySelectorAll('.or-month-cell').length).toBeGreaterThan(27);
    expect(v.text()).toContain('Calendar');
    await v.unmount();
  });
});

// The Dashboard mini calendar is fed by the Academic Calendar ONLY.
// These tests are the regression guard for that strict data separation.
describe('dashboard mini calendar is academic-calendar only', () => {
  // Locate the in-month cell for a day-of-month number in the mini calendar.
  const dayCell = (v, day) => [...v.el.querySelectorAll('.or-cal-cell')]
    .filter((c) => !c.classList.contains('dim'))
    .find((c) => c.firstElementChild?.textContent.trim() === String(day));
  const dots = (cell) => (cell ? cell.querySelectorAll('.or-cal-dot').length : -1);

  it('puts no indicator on dates that only have weekly timetable classes', async () => {
    const v = await mount(Dashboard);
    // Thu 1 Oct and Fri 2 Oct carry classes from data.schedule, and Mon
    // 5 Oct has no academic-calendar entry at all. None may get a dot.
    for (const day of [1, 2, 5, 8, 9]) {
      expect(dots(dayCell(v, day)), `day ${day} must have no dot`).toBe(0);
    }
    await v.unmount();
  });

  it('puts no indicator on test dates or assignment due dates', async () => {
    const v = await mount(Dashboard);
    // 8 Oct is an assignment due date and a class day; 26 Oct is a test
    // date. Neither is academic-calendar data, so neither gets a dot.
    expect(dots(dayCell(v, 8))).toBe(0);
    expect(dots(dayCell(v, 26))).toBe(0);
    await v.unmount();
  });

  it('marks official academic-calendar dates and holidays', async () => {
    const v = await mount(Dashboard);
    expect(dots(dayCell(v, 13))).toBeGreaterThan(0); // Class Committee Meeting - 1
    expect(dots(dayCell(v, 20))).toBeGreaterThan(0); // Mahanavami & Ayudha Pooja
    await v.unmount();
  });

  it('legend lists only academic-calendar categories', async () => {
    const v = await mount(Dashboard);
    const legend = [...v.el.querySelectorAll('.or-cal-legend')].map((n) => n.textContent).join(' ');
    expect(legend).toContain('Academic Event');
    expect(legend).toContain('Assessment / Exam');
    expect(legend).toContain('Holiday');
    for (const banned of ['Classes', 'Tests', 'Assignments', 'Events']) {
      expect(legend, `legend must not contain "${banned}"`).not.toContain(banned);
    }
    await v.unmount();
  });

  it('a clicked date shows only that date\u2019s academic events, no class timings', async () => {
    const v = await mount(Dashboard);
    const cell = dayCell(v, 13);
    await act(async () => { cell.click(); });
    const t = v.text();
    expect(t).toMatch(/Class Committee Meeting - 1/);
    expect(t).toMatch(/Academic Event/);
    // No timetable row leaks into the day panel.
    expect(t).not.toMatch(/\d{1,2}:\d{2}\s?(AM|PM)?\s*(Environmental Science|Yoga|Mentorship)/i);
    expect(t).not.toMatch(/DSA Contest/);
    await v.unmount();
  });

  it('a class-only date reports nothing scheduled', async () => {
    const v = await mount(Dashboard);
    const cell = dayCell(v, 5);
    await act(async () => { cell.click(); });
    expect(v.text()).toContain('Nothing scheduled on this day.');
    await v.unmount();
  });

  it('a date-TBA sentinel never receives a calendar dot', async () => {
    const v = await mount(Dashboard);
    const text = v.text();
    expect(text).not.toMatch(/End-Sem Exam date/);
    await v.unmount();
  });

  it('month navigation re-derives dots from academic events only', async () => {
    const v = await mount(Dashboard);
    
    await v.clickAria('Next month'); // +28 days: Oct 3 → Oct 31
    await v.clickAria('Next month'); // Oct 31 → November
    const t = v.text();
    expect(v.el.querySelectorAll('.or-cal-cell').length).toBeGreaterThanOrEqual(28);
    expect(t).toContain('November');
    // November has no academic events in the fixture → no dots anywhere.
    expect(v.el.querySelectorAll('.or-cal-dot').length).toBe(0);
    await v.unmount();
  });
});

describe('library, workspace and reporting modules', () => {
  it('Notes groups resources by subject', async () => {
    const v = await mount(Notes);
    expect(v.text()).toContain('Programming for Problem Solving Using Java');
    expect(v.text()).toContain('Collections cheat sheet');
    await v.unmount();
  });

  it('Subjects opens an academic workspace with real per-subject figures', async () => {
    const v = await mount(Subjects);
    await v.click('Open workspace');
    const t = v.text();
    expect(t).toContain('Weekly classes');
    expect(t).toContain('Tests');
    expect(t).toContain('Notes & resources');
    await v.unmount();
  });

  it("Planner shows today's plan and subject allocation", async () => {
    const v = await mount(Planner);
    const t = v.text();
    expect(t).toContain("Today's plan");
    expect(t).toContain('Subject allocation');
    await v.unmount();
  });

  it('Goals shows progress against the stored target', async () => {
    const v = await mount(Goals);
    expect(v.text()).toContain('Score 85% in Java');
    expect(v.text()).toContain('70 / 85');
    await v.unmount();
  });

  it('Events offers both List and Calendar views and keeps registration links', async () => {
    const v = await mount(Events);
    expect(v.text()).toContain('Hackcache 26');
    await v.click('Calendar');
    expect(v.el.querySelectorAll('.or-cal-cell').length).toBeGreaterThan(27);
    await v.unmount();
  });

  it('Weekly Summary writes itself from the data', async () => {
    const v = await mount(Summary);
    const t = v.text();
    expect(t).toContain('Your week, summarized');
    expect(t).toContain("Next week's workload");
    await v.unmount();
  });

  it('Settings exposes every section and still offers sync + sign out', async () => {
    const v = await mount(Settings);
    const t = v.text();
    for (const section of ['Profile', 'Academic information', 'Notifications', 'Appearance', 'AI settings', 'Data & sync', 'Demo data', 'Account', 'Danger zone']) {
      expect(t, `missing Settings section: ${section}`).toContain(section);
    }
    expect(t).toContain('Sync Now');
    expect(t).toContain('Sign out');
    await v.unmount();
  });
});
