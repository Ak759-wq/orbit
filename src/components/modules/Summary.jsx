import { useMemo } from 'react';
import { Sparkles, CalendarCheck, ClipboardList, GraduationCap, Timer, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader } from '../ui.jsx';
import { OrbitCard, OrbitSection, OrbitStat, OrbitEmptyState, OrbitBadge } from '../orbit/Orbit.jsx';
import { weeklySummary, attendanceBetween, overallTestStats, upcomingTestsList } from '../../lib/calc.js';
import { fmtDate, fmtDuration, fmtTime12, addDaysISO } from '../../lib/datetime.js';
import { DAYS_SHORT } from '../../lib/constants.js';

export default function Summary() {
  const { data, analytics, profile } = useApp();

  const lines = useMemo(() => {
    if (!data || !analytics) return [];
    return weeklySummary({
      tests: data.tests ?? [],
      assignments: data.assignments ?? [],
      attendanceRecords: data.attendance ?? [],
      sessions: data.sessions ?? [],
      thisWeekStart: analytics.week.start,
      thisWeekEnd: analytics.week.end,
      lastWeekStart: analytics.week.lastStart,
      lastWeekEnd: analytics.week.lastEnd,
      subjectTrends: (analytics.subjectStats ?? []).map((s) => ({ name: s.name, trend: s.trend })),
    });
  }, [data, analytics]);

  // Next week's real workload: classes + assignments + tests from stored rows.
  const nextWeek = useMemo(() => {
    if (!data || !analytics) return null;
    const start = analytics.week.end;
    const end = addDaysISO(start, 6);
    const dowOf = (iso) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8))).getDay();

    // A recurring class counts once per matching weekday inside the window.
    const weekdays = new Set();
    for (let i = 1; i <= 6; i += 1) {
      const iso = addDaysISO(start, i);
      if (iso <= end) weekdays.add(dowOf(iso));
    }
    const classes = (data.schedule ?? []).filter((c) => weekdays.has(c.day_of_week));

    const assignments = (data.assignments ?? []).filter((a) => a.status !== 'completed' && a.due_date > analytics.week.end && a.due_date <= end);
    const tests = upcomingTestsList(data.tests ?? [], analytics.week.end).filter((t) => t.test_date <= end);
    return { start, end, classes, assignments, tests };
  }, [data, analytics]);

  const weekClasses = useMemo(() => {
    if (!data || !analytics) return {};
    const byDow = {};
    for (let i = 0; i < 7; i += 1) {
      const iso = addDaysISO(analytics.week.start, i);
      if (iso > analytics.week.end) break;
      const dow = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8))).getDay();
      byDow[dow] = (data.schedule ?? []).filter((c) => c.day_of_week === dow);
    }
    return byDow;
  }, [data, analytics]);

  if (!data || !analytics) return null;

  const week = analytics.week;
  const thisWeekAtt = attendanceBetween(data.attendance, week.start, week.end);
  const lastWeekAtt = attendanceBetween(data.attendance, week.lastStart, week.lastEnd);
  const overall = overallTestStats(data.tests ?? []);
  const tasksDue = (data.assignments ?? []).filter((a) => a.due_date >= week.start && a.due_date <= week.end);
  const tasksDone = tasksDue.filter((a) => a.status === 'completed');
  const weekTests = (data.tests ?? []).filter((t) => t.test_date >= week.start && t.test_date <= week.end);
  const attDelta = thisWeekAtt.pct != null && lastWeekAtt.pct != null ? Math.round((thisWeekAtt.pct - lastWeekAtt.pct) * 10) / 10 : null;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="WEEKLY ACADEMIC SUMMARY"
        title={`Week of ${fmtDate(week.start, { day: 'numeric', month: 'short' })} – ${fmtDate(week.end, { day: 'numeric', month: 'short' })}`}
        sub="Every statement below is generated from your recorded data — nothing is guessed."
      />

      {/* ---- Headline ---- */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
        <OrbitStat
          icon={CalendarCheck}
          tone="green"
          value={thisWeekAtt.pct != null ? `${thisWeekAtt.pct}%` : '—'}
          label="Attendance"
          sub={thisWeekAtt.total ? `${thisWeekAtt.present}/${thisWeekAtt.total} this week${attDelta != null ? ` · ${attDelta >= 0 ? '+' : ''}${attDelta} vs last week` : ''}` : 'No classes recorded this week'}
        />
        <OrbitStat
          icon={Timer}
          tone="purple"
          value={fmtDuration(analytics.study?.weeklyMinutes ?? 0)}
          label="Study time"
          sub={`${fmtDuration(analytics.study?.weeklyCompletedMinutes ?? 0)} completed`}
        />
        <OrbitStat
          icon={ClipboardList}
          tone="orange"
          value={String(tasksDue.length)}
          label="Tasks due"
          sub={`${tasksDone.length} completed this week`}
        />
        <OrbitStat
          icon={GraduationCap}
          tone="blue"
          value={overall.avgPct != null ? `${overall.avgPct}%` : '—'}
          label="Overall average"
          sub={`${weekTests.length} test${weekTests.length === 1 ? '' : 's'} this week`}
        />
      </div>

      {/* ---- Narrative ---- */}
      <OrbitCard>
        <div className="or-card-head">
          <span className="or-icon-chip or-icon-chip-sm or-tone-purple"><Sparkles className="w-[18px] h-[18px]" strokeWidth={2.2} /></span>
          <div className="min-w-0">
            <h2 className="font-bold text-[15.5px] text-orbit-text leading-tight">Your week, summarized</h2>
            <p className="text-[12px] text-orbit-text-mute mt-0.5">Written from your records.</p>
          </div>
        </div>
        <div className="p-5">
          {lines.length === 0 ? (
            <OrbitEmptyState icon={Sparkles} title="Not enough data yet." sub="Record attendance, tasks and tests and this section writes itself." compact />
          ) : (
            <ul className="space-y-2.5">
              {lines.map((line, i) => (
                <li key={i} className="text-[13.5px] text-orbit-text-soft leading-relaxed flex gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orbit-purple shrink-0 mt-2" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </OrbitCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ---- This week's classes ---- */}
        <OrbitSection icon={CalendarCheck} tone="purple" title="Classes this week" sub="From your recurring timetable.">
          {Object.keys(weekClasses).length === 0 ? (
            <OrbitEmptyState icon={CalendarCheck} title="No classes this week" sub="Your timetable has no scheduled classes in this window." compact />
          ) : (
            <div className="space-y-2.5">
              {Object.entries(weekClasses).map(([dow, list]) => (
                <div key={dow}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute mb-1.5">{DAYS_SHORT[dow]}</p>
                  {list.length === 0 ? (
                    <p className="text-[12px] text-orbit-text-mute">No classes</p>
                  ) : (
                    <div className="space-y-1">
                      {list.map((c) => {
                        const subject = (data.subjects ?? []).find((s) => s.id === c.subject_id);
                        return (
                          <div key={c.id} className="flex items-center gap-2.5 text-[12.5px]">
                            <span className="w-1.5 self-stretch min-h-[18px] rounded-full shrink-0" style={{ background: subject?.color || '#94a3b8' }} />
                            <span className="font-semibold text-orbit-text truncate flex-1">{subject?.name || 'Unknown subject'}</span>
                            <span className="text-orbit-text-mute shrink-0">{fmtTime12(c.start_time)}–{fmtTime12(c.end_time)}</span>
                            {c.room && <span className="text-orbit-text-mute shrink-0">· {c.room}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </OrbitSection>

        {/* ---- This week's tasks ---- */}
        <OrbitSection icon={ClipboardList} tone="orange" title="Tasks this week" sub={`${tasksDone.length} of ${tasksDue.length} completed`}>
          {tasksDue.length === 0 ? (
            <OrbitEmptyState icon={CheckCircle2} title="No tasks due this week" sub="Nothing on your plate in this window." compact />
          ) : (
            <div className="space-y-1.5">
              {tasksDue.map((a) => {
                const done = a.status === 'completed';
                return (
                  <div key={a.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: done ? '#34d399' : '#f59e0b' }} />
                    <span className={`truncate flex-1 ${done ? 'line-through text-orbit-text-mute' : 'font-semibold text-orbit-text'}`}>{a.title}</span>
                    <OrbitBadge tone={done ? 'green' : 'neutral'}>{done ? 'Done' : fmtDate(a.due_date, { day: 'numeric', month: 'short' })}</OrbitBadge>
                  </div>
                );
              })}
            </div>
          )}
        </OrbitSection>
      </div>

      {/* ---- Next week's workload ---- */}
      <OrbitSection
        icon={CalendarDays}
        tone="blue"
        title="Next week's workload"
        sub={nextWeek ? `${fmtDate(nextWeek.start, { day: 'numeric', month: 'short' })} – ${fmtDate(nextWeek.end, { day: 'numeric', month: 'short' })}` : undefined}
      >
        {!nextWeek ? (
          <OrbitEmptyState icon={CalendarDays} title="Not enough data yet." compact />
        ) : nextWeek.classes.length + nextWeek.assignments.length + nextWeek.tests.length === 0 ? (
          <OrbitEmptyState icon={CalendarDays} title="Nothing scheduled next week" sub="No classes, tasks or tests fall in that window." compact />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute mb-2">Classes</p>
              <p className="text-[24px] font-extrabold text-orbit-text leading-none">{nextWeek.classes.length}</p>
              <p className="text-[11.5px] text-orbit-text-mute mt-1.5">recurring sessions</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute mb-2">Tasks due</p>
              <p className="text-[24px] font-extrabold text-orbit-text leading-none">{nextWeek.assignments.length}</p>
              {nextWeek.assignments.slice(0, 3).map((a) => (
                <p key={a.id} className="text-[11.5px] text-orbit-text-mute truncate mt-0.5">{a.title}</p>
              ))}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute mb-2">Tests</p>
              <p className="text-[24px] font-extrabold text-orbit-text leading-none">{nextWeek.tests.length}</p>
              {nextWeek.tests.slice(0, 3).map((t) => (
                <p key={t.id} className="text-[11.5px] text-orbit-text-mute truncate mt-0.5">{t.name} · {fmtDate(t.test_date, { day: 'numeric', month: 'short' })}</p>
              ))}
            </div>
          </div>
        )}
      </OrbitSection>

      <p className="text-[11px] text-orbit-text-mute text-center">
        Signed in as {profile?.full_name || 'student'} · window: {fmtDate(week.start)} → {fmtDate(week.end)}
      </p>
    </div>
  );
}
