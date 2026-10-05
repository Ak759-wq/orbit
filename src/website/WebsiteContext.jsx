// Website data provider: wraps localdb with React state so every
// section re-renders when any record changes. Also exposes derived
// analytics via the shared calc engine.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as db from './localdb.js';
import { todayISO, addDaysISO, weekStart, fmtDate } from '../lib/datetime.js';
import {
  testStatsForSubject, overallTestStats, attendanceForRecords,
  assignmentBuckets, assignmentStats, studyStats,
} from '../lib/calc.js';

const Ctx = createContext(null);
export const useWebsite = () => useContext(Ctx);

// Bump to force re-render; localdb persists the actual data.
function useDbTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => db.onDbChange(() => setTick((t) => t + 1)), []);
  return tick;
}

export function WebsiteProvider({ children }) {
  const tick = useDbTick();
  // minute clock so live class statuses stay current
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const data = useMemo(() => ({
    subjects: db.list('subjects'),
    schedule: db.list('schedule'),
    events: db.list('events'),
    tests: db.list('tests'),
    assignments: db.list('assignments'),
    attendance: db.list('attendance'),
    sessions: db.list('sessions'),
    goals: db.list('goals'),
    resources: db.list('resources'),
  }), [tick]);

  const insert = useCallback((table, row) => db.insert(table, row), []);
  const update = useCallback((table, id, patch) => db.update(table, id, patch), []);
  const remove = useCallback((table, id) => db.remove(table, id), []);

  const subjectName = useCallback((id) => db.subjectName(id), [tick]);

  // ---------------- derived ----------------
  const derived = useMemo(() => {
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);
    const wStart = weekStart(today);
    const wEnd = addDaysISO(wStart, 6);

    // today command center
    const todayInfo = db.todayClasses(now);
    const gaps = db.todayGaps(now);

    // week schedule grouped by day — only days that actually have slots
    // (Mon–Fri initially; adapts if the timetable is edited later)
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const presentDays = new Set(data.schedule.map((c) => c.day_of_week));
    const week = dayOrder
      .filter((day) => presentDays.has(day))
      .map((day) => ({
        day,
        slots: data.schedule
          .filter((c) => c.day_of_week === day)
          .sort((a, b) => (a.start_time < b.start_time ? -1 : 1)),
      }));

    // events
    const upcoming = db.upcomingEvents(14, now);
    const todays = db.todaysEvents(now);

    // tests
    const overall = overallTestStats(data.tests);
    const subjectStats = data.subjects
      .map((s) => ({
        subject: s,
        name: s.name,
        ...testStatsForSubject(data.tests.filter((t) => t.subject_id === s.id)),
      }))
      .filter((r) => r.count > 0);

    // assignments
    const buckets = assignmentBuckets(data.assignments, today, tomorrow, wEnd);
    const assignStats = assignmentStats(data.assignments, today);

    // attendance per subject
    const subjectAttendance = data.subjects.map((s) => {
      const recs = data.attendance.filter((r) => r.subject_id === s.id);
      return { subject: s, subjectId: s.id, name: s.name, required: s.attendance_required_pct, ...attendanceForRecords(recs) };
    }).filter((r) => r.total > 0 || true); // keep subjects with zero too for marking UI
    const overallAtt = attendanceForRecords(data.attendance);

    // study
    const study = studyStats(data.sessions, wStart, wEnd);
    const todaySessions = data.sessions.filter((s) => s.session_date === today);

    // goals with live values
    const goalsLive = data.goals.map((g) => {
      let current = Number(g.current_value);
      if (g.goal_type === 'attendance') {
        current = g.subject_id
          ? (subjectAttendance.find((s) => s.subjectId === g.subject_id)?.pct ?? 0)
          : overallAtt.pct ?? 0;
      } else if (g.goal_type === 'test_average') {
        const scoped = g.subject_id ? data.tests.filter((t) => t.subject_id === g.subject_id) : data.tests;
        current = overallTestStats(scoped).avgPct ?? 0;
      } else if (g.goal_type === 'assignments_completed') {
        const scoped = g.subject_id ? data.assignments.filter((a) => a.subject_id === g.subject_id) : data.assignments;
        current = scoped.filter((a) => a.status === 'completed').length;
      } else if (g.goal_type === 'study_hours') {
        const scoped = g.subject_id ? data.sessions.filter((s) => s.subject_id === g.subject_id) : data.sessions;
        current = Math.round(scoped.filter((s) => s.status === 'completed').reduce((n, s) => {
          const [sh, sm] = s.start_time.split(':').map(Number);
          const [eh, em] = s.end_time.split(':').map(Number);
          return n + Math.max((eh * 60 + em) - (sh * 60 + sm), 0);
        }, 0) / 60);
      }
      const progress = g.target_value > 0 ? Math.min(Math.round((current / g.target_value) * 1000) / 10, 999) : null;
      const status = progress == null ? 'active' : progress >= 100 ? 'achieved' : 'active';
      return { ...g, live_current: current, progress, status };
    });

    return {
      today, tomorrow, weekStart: wStart, weekEnd: wEnd,
      todayInfo, gaps, week, upcoming, todaysEvents: todays,
      overall, subjectStats, buckets, assignStats,
      subjectAttendance, overallAtt, study, todaySessions, goalsLive,
      fmt: (iso) => fmtDate(iso),
    };
  }, [data, now, tick]);

  const value = useMemo(() => ({
    ...data, ...derived, now, insert, update, remove, subjectName,
  }), [data, derived, now, insert, update, remove, subjectName]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
