// Central state: auth session + all academic data + actions.
// Derived analytics (testStats, attendance, buckets, notifications)
// are memoized here so every module reads the same connected truth.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, SUPABASE_ENABLED } from '../lib/supabase.js';
import * as api from '../lib/db.js';
import { buildDemoData } from './demo.js';
import { todayISO, addDaysISO, weekStart as weekStartOf } from '../lib/datetime.js';
import {
  overallTestStats, testStatsForSubject,
  attendanceForRecords, attendanceExcludedBeforeStart,
  assignmentBuckets, assignmentStats, studyStats,
  decorateDaySchedule, buildNotifications,
} from '../lib/calc.js';
// Single source of truth for the Dashboard/module shared numbers.
import {
  getTodayClasses, getDueAssignments, splitDueAssignments,
  getUpcomingTests, getUpcomingEvents,
  getSubjectAttendance, getUnattributedAttendance,
} from '../lib/queries.js';

// Exported so tests can inject a mocked context value.
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  // ---------------- auth ----------------
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!SUPABASE_ENABLED);
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState(null); // { subjects, schedule, events, ... }
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(SUPABASE_ENABLED);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const loadedForUser = useRef(null);

  const flash = useCallback((message) => {
    setToast({ id: Date.now(), message });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    let alive = true;
    supabase.auth.getSession().then(({ data: s }) => {
      if (!alive) return;
      setSession(s.session ?? null);
      setAuthReady(true);
      // Nothing to load without a session; stop the splash screen.
      if (!s.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!alive) return;
      setSession(s);
      if (!s) {
        loadedForUser.current = null;
        setProfile(null);
        setData(null);
        setSettings(null);
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const loadAll = useCallback(async (userId) => {
    const [p, st, d] = await Promise.all([
      api.fetchProfile(userId),
      api.fetchSettings(userId),
      api.fetchAll(),
    ]);
    return { p, st, d };
  }, []);

  // Load profile + data once per signed-in user
  useEffect(() => {
    if (!SUPABASE_ENABLED || !session?.user) return;
    const uid = session.user.id;
    if (loadedForUser.current === uid) return;
    loadedForUser.current = uid;
    setLoading(true);
    setError(null);
    loadAll(uid)
      .then(async ({ p, st, d }) => {
        if (!p) {
          // Session exists but the signup trigger never ran for this user
          // (created before the trigger existed). Self-heal: create the
          // missing profile row, then continue loading.
          p = await api.ensureProfile(uid, session.user.user_metadata);
        }
        setProfile(p);
        setSettings(st);
        setData(d);
      })
      .catch(async (e) => {
        // A session can also outlive its account (e.g. a deleted test user):
        // every write then fails with a foreign-key violation. Sign out so
        // the user returns to a clean sign-in screen instead of a dead app.
        const msg = String(e?.message || '');
        if (/foreign key|violates/i.test(msg)) {
          await supabase.auth.signOut();
          return;
        }
        loadedForUser.current = null;
        setError(msg || 'Failed to load your data.');
      })
      .finally(() => setLoading(false));
  }, [session, loadAll]);

  // ---------------- auth actions ----------------
  const signUp = useCallback(async (email, password, fullName) => {
    const { data, error: e } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (e) throw e;
    // data.session is null when the project requires email confirmation.
    return { needsEmailConfirmation: !data?.session };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) throw e;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (e) throw e;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const sendPasswordReset = useCallback(async (email) => {
    const { error: e } = supabase.auth.resetPasswordForEmail(email);
    if (e) throw e;
  }, []);

  // ---------------- CRUD ----------------
  const saveProfile = useCallback(async (patch) => {
    const p = await api.updateProfile(session.user.id, patch);
    setProfile(p);
    flash('Profile saved.');
    return p;
  }, [session, flash]);

  const saveSettings = useCallback(async (patch) => {
    const s = await api.updateSettings(session.user.id, patch);
    setSettings(s);
    flash('Notification settings saved.');
    return s;
  }, [session, flash]);

  // DB table name → state key ('events'/'event_bookmarks' are stored as
  // 'hackathons'/'bookmarks' because academic_events already owns 'events').
  const STATE_KEY = { events: 'hackathons', event_bookmarks: 'bookmarks' };

  const insertRow = useCallback(async (table, row) => {
    const created = await api.db[table].insert(row);
    const key = STATE_KEY[table] ?? table;
    setData((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), created] }));
    flash('Saved.');
    return created;
  }, [flash]);

  const updateRow = useCallback(async (table, id, patch) => {
    const updated = await api.db[table].update(id, patch);
    const key = STATE_KEY[table] ?? table;
    setData((prev) => ({ ...prev, [key]: (prev[key] ?? []).map((r) => (r.id === id ? updated : r)) }));
    return updated;
  }, []);

  const deleteRow = useCallback(async (table, id) => {
    await api.db[table].remove(id);
    const key = STATE_KEY[table] ?? table;
    setData((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((r) => r.id !== id) }));
    flash('Deleted.');
  }, [flash]);

  const insertMany = useCallback(async (table, rows) => {
    const created = await api.db[table].insertMany(rows);
    const key = STATE_KEY[table] ?? table;
    setData((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), ...created] }));
    return created;
  }, []);

  const clearDemo = useCallback(async () => {
    await api.clearDemoData();
    const { d } = await loadAll(session.user.id);
    setData(d);
    flash('Demo data cleared.');
  }, [session, loadAll, flash]);

  // Auto-seed the REAL BST Section A academic data server-side:
  // subjects + weekly timetable + official S-VYASA 2026-27 calendar.
  // Used by onboarding so a new account never lands on an empty app.
  // Server-side RPC (security definer, user-scoped, idempotent).
  // Manual "Sync Now" trigger for the Excel attendance pipeline.
  // Calls the attendance-sync edge function with the caller's JWT:
  // it syncs ONLY the signed-in user's own row from the Google Sheet.
  // Refreshes the fetched data + logs afterwards so every surface
  // (Attendance page, Dashboard, Analytics, Orbit AI) stays in step.
  const syncAttendanceNow = useCallback(async () => {
    const { data: res, error } = await supabase.functions.invoke('attendance-sync', { body: { trigger: 'manual' } });
    if (error) throw error;
    const { d } = await loadAll(session.user.id);
    setData(d);
    return res;
  }, [session, loadAll]);

  const seedAllReal = useCallback(async () => {
    const { error: e } = await supabase.rpc('orbit_seed_real_data');
    if (e) throw e;
    const { d } = await loadAll(session.user.id);
    setData(d);
    return d;
  }, [session, loadAll]);

  const seedDemo = useCallback(async () => {
    const demo = buildDemoData();
    const subjMap = new Map();
    const createdSubjects = [];
    for (const s of demo.subjects) {
      const row = await api.db.subjects.insert({
        name: s.name, code: s.code, faculty: s.faculty, credits: s.credits,
        semester: profile?.semester || '', description: s.description,
        target_percentage: s.target_percentage, attendance_required_pct: s.attendance_required_pct,
        color: s.color, is_demo: true,
      });
      subjMap.set(s.name, row.id);
      createdSubjects.push(row);
    }
    const scheduleRows = demo.schedule.map((c) => ({
      subject_id: subjMap.get(c.subject), room: c.room, day_of_week: c.day_of_week,
      start_time: c.start_time, end_time: c.end_time, semester: profile?.semester || '',
      academic_year: profile?.academic_year || '', notes: c.notes, is_demo: true,
    }));
    const eventRows = demo.events.map((e) => ({
      title: e.title, event_type: e.event_type, start_date: e.start_date, end_date: e.end_date,
      description: e.description, priority: e.priority,
      subject_id: e.subject ? subjMap.get(e.subject) : null, is_demo: true,
    }));
    const testRows = demo.tests.map((t) => ({
      name: t.name, subject_id: subjMap.get(t.subject), topic: t.topic, test_type: t.test_type,
      test_date: t.test_date, max_marks: t.max_marks, marks_obtained: t.marks_obtained, is_demo: true,
    }));
    const assignmentRows = demo.assignments.map((a) => ({
      title: a.title, subject_id: subjMap.get(a.subject), description: a.description,
      task_type: a.task_type, due_date: a.due_date, priority: a.priority, status: a.status, is_demo: true,
    }));
    // NOTE: demo.attendance is deliberately NOT seeded. Attendance is
    // Excel-only — a sample semester must not put invented P/A marks
    // into the same rows the Attendance page, Dashboard, Analytics and
    // Orbit AI all read.
    const sessionRows = demo.sessions.map((s) => ({
      subject_id: subjMap.get(s.subject), topic: s.topic, session_date: s.session_date,
      start_time: s.start_time, end_time: s.end_time, goal: s.goal, status: s.status, is_demo: true,
    }));
    const goalRows = demo.goals.map((g) => ({
      name: g.name, goal_type: g.goal_type, subject_id: g.subject ? subjMap.get(g.subject) : null,
      target_value: g.target_value, current_value: g.current_value,
      start_date: g.start_date, deadline: g.deadline, is_demo: true,
    }));
    const resourceRows = demo.resources.map((r) => ({
      title: r.title, resource_type: r.resource_type, subject_id: r.subject ? subjMap.get(r.subject) : null,
      url: r.url || null, content: r.content || null, description: r.description, is_demo: true,
    }));

    await api.db.class_schedule.insertMany(scheduleRows);
    await api.db.academic_events.insertMany(eventRows);
    await api.db.tests.insertMany(testRows);
    await api.db.assignments.insertMany(assignmentRows);
    await api.db.study_sessions.insertMany(sessionRows);
    await api.db.goals.insertMany(goalRows);
    await api.db.resources.insertMany(resourceRows);

    const { d } = await loadAll(session.user.id);
    setData(d);
    flash('Demo semester loaded. Rows are tagged demo and can be cleared anytime.');
  }, [session, profile, loadAll, flash]);

  // ---------------- shared analytics (memoized) ----------------
  const today = todayISO();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

  const subjectMap = useMemo(() => {
    const m = new Map();
    for (const s of data?.subjects ?? []) m.set(s.id, s);
    return m;
  }, [data?.subjects]);

  const subjectName = useCallback((id) => subjectMap.get(id)?.name ?? null, [subjectMap]);

  const analytics = useMemo(() => {
    if (!data) return null;
    const tests = data.tests ?? [];
    const assignments = data.assignments ?? [];
    const sessions = data.sessions ?? [];
    const attendanceRecords = data.attendance ?? [];
    const events = data.events ?? [];
    const schedule = data.schedule ?? [];

    const overall = overallTestStats(tests);
    const subjectStats = (data.subjects ?? []).map((s) => ({
      subject: s,
      name: s.name,
      ...testStatsForSubject(tests.filter((t) => t.subject_id === s.id)),
    }));

    // Attendance comes from ONE place: the rows synced from the Excel
    // sheet. Both figures below are built by the shared selectors in
    // lib/queries.js, which go through attendanceForRecords — so the
    // Attendance page, Dashboard, Analytics, Summary and the AI
    // snapshot can never calculate different attendance.
    const subjectAttendance = getSubjectAttendance(attendanceRecords, data.subjects ?? []);
    const unattributedAtt = getUnattributedAttendance(attendanceRecords);
    const overallAtt = attendanceForRecords(attendanceRecords);
    // Records outside the attendance period (before the start date) —
    // stored for transparency but excluded from every calculation.
    const excludedPreCutoff = attendanceExcludedBeforeStart(attendanceRecords);

    const tomorrow = addDaysISO(today, 1);
    const wStart = weekStartOf(today);
    const wEnd = addDaysISO(wStart, 6);
    const lastWStart = addDaysISO(wStart, -7);
    const lastWEnd = addDaysISO(wStart, -1);

    const buckets = assignmentBuckets(assignments, today, tomorrow, wEnd);
    const assignStats = assignmentStats(assignments, today);
    // Outstanding work: open + real due date. Drives both the Dashboard
    // card and the Assignments page so they can never disagree.
    const dueAssignments = getDueAssignments(assignments, today);
    const dueSplit = splitDueAssignments(dueAssignments, today);

    // Day-of-week comes from `today`, not a fresh Date(), so the derived
    // numbers are deterministic and testable.
    const todaySlots = getTodayClasses(schedule, today);
    const { slots: decoratedSlots, current, next } = decorateDaySchedule(todaySlots, nowMins);

    const todayEvents = events.filter((e) => e.start_date <= today && e.end_date >= today);
    // Union of the official Academic Calendar and user-created Upcoming
    // Events, de-duplicated across both sources. See lib/queries.js.
    const upcomingEvents = getUpcomingEvents(
      { academicEvents: events, userEvents: data.hackathons ?? [] },
      today,
    );

    const todayTests = tests.filter((t) => t.test_date === today);
    const upcomingTests = getUpcomingTests(tests, today);

    const todaySessions = sessions.filter((s) => s.session_date === today);
    const study = studyStats(sessions, wStart, wEnd);

    const goalDerived = (data.goals ?? []).map((g) => {
      let current = Number(g.current_value);
      if (g.goal_type === 'attendance') {
        current = g.subject_id
          ? (subjectAttendance.find((s) => s.subjectId === g.subject_id)?.pct ?? 0)
          : overallAtt.pct ?? 0;
      } else if (g.goal_type === 'test_average') {
        const scoped = g.subject_id ? tests.filter((t) => t.subject_id === g.subject_id) : tests;
        current = overallTestStats(scoped).avgPct ?? 0;
      } else if (g.goal_type === 'assignments_completed') {
        const scoped = g.subject_id ? assignments.filter((a) => a.subject_id === g.subject_id) : assignments;
        current = scoped.filter((a) => a.status === 'completed').length;
      } else if (g.goal_type === 'study_hours') {
        const scoped = g.subject_id ? sessions.filter((s) => s.subject_id === g.subject_id) : sessions;
        current = Math.round(scoped.filter((s) => s.status === 'completed').reduce((n, s) => {
          const mins = (Number(s.end_time?.slice(0, 2)) || 0) * 60 + (Number(s.end_time?.slice(3, 5)) || 0)
            - ((Number(s.start_time?.slice(0, 2)) || 0) * 60 + (Number(s.start_time?.slice(3, 5)) || 0));
          return n + Math.max(mins, 0);
        }, 0) / 60);
      }
      return { ...g, live_current: current };
    });

    const notifications = buildNotifications(
      {
        tests: upcomingTestsSource(tests, subjectMap),
        assignments: assignments.map((a) => ({ ...a, subjectName: subjectName(a.subject_id) })),
        events: events.map((e) => ({ ...e, subjectName: subjectName(e.subject_id) })),
        subjectAttendance,
        sessions: sessions.map((s) => ({ ...s, subjectName: subjectName(s.subject_id) })),
      },
      settings,
      today,
    );

    return {
      overall, subjectStats, subjectAttendance, overallAtt, excludedPreCutoff,
      unattributedAtt,
      buckets, assignStats, dueAssignments, dueSplit,
      todaySlots: decoratedSlots, current, next,
      todayEvents, upcomingEvents, todayTests, upcomingTests, todaySessions, study,
      goals: goalDerived,
      notifications,
      week: { start: wStart, end: wEnd, lastStart: lastWStart, lastEnd: lastWEnd },
    };
  }, [data, settings, today, nowMins, subjectMap, subjectName]);

  const value = useMemo(() => ({
    supabaseEnabled: SUPABASE_ENABLED,
    session, profile, data, settings, loading, error, toast, flash,
    analytics, subjectName, subjectMap, authReady,
    signUp, signIn, signInWithGoogle, signOut, sendPasswordReset,
    saveProfile, saveSettings,
    insertRow, updateRow, deleteRow, insertMany,
    seedDemo, clearDemo, seedAllReal, syncAttendanceNow,
    today,
  }), [session, profile, data, settings, loading, error, toast, flash, analytics, subjectName, subjectMap, authReady,
    signUp, signIn, signInWithGoogle, signOut, sendPasswordReset, saveProfile, saveSettings,
    insertRow, updateRow, deleteRow, insertMany, seedDemo, clearDemo, seedAllReal, syncAttendanceNow, today]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// helpers for notification inputs
function upcomingTestsSource(tests, subjectMap) {
  return tests.map((t) => ({ ...t, subjectName: subjectMap.get(t.subject_id)?.name }));
}
