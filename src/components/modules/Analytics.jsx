import { useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus, Trophy, ArrowDown, Percent, ClipboardList, CheckCircle2, Timer } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader } from '../ui.jsx';
import { OrbitCard, OrbitEmptyState, OrbitBadge, OrbitStat, OrbitProgress, OrbitSection, MiniBars, Sparkline, Donut } from '../orbit/Orbit.jsx';
import { overallTestStats, testStatsForSubject, attendanceTrend } from '../../lib/calc.js';
import { fmtDate } from '../../lib/datetime.js';

export default function Analytics() {
  const { data, analytics } = useApp();
  const tests = data?.tests ?? [];
  const assignments = data?.assignments ?? [];
  const sessions = data?.sessions ?? [];
  const attendanceRecords = data?.attendance ?? [];
  const today = analytics?.today ?? null;

  const overall = useMemo(() => overallTestStats(tests), [tests]);

  const subjectRows = useMemo(() =>
    (data?.subjects ?? [])
      .map((s) => {
        const scoped = tests.filter((t) => t.subject_id === s.id);
        return { subject: s, name: s.name, target: s.target_percentage, ...testStatsForSubject(scoped) };
      })
      .filter((r) => r.count > 0),
    [data?.subjects, tests]);

  // Real attendance series — weekly present/absent straight from synced records.
  const attTrend = useMemo(() => (today ? attendanceTrend(attendanceRecords, today, 6) : []), [attendanceRecords, today]);
  const attWeeks = attTrend.filter((w) => w.total > 0);

  const overallAtt = analytics?.overallAtt;

  // Assignment completion from stored rows only.
  const assignmentStats = useMemo(() => {
    const total = assignments.length;
    const completed = assignments.filter((a) => a.status === 'completed').length;
    const overdue = assignments.filter((a) => a.status !== 'completed' && today && a.due_date < today).length;
    return { total, completed, overdue, pct: total ? Math.round((completed / total) * 100) : 0 };
  }, [assignments, today]);

  // Study activity comes from the context's logged-session stats.
  const study = analytics?.study ?? null;
  const subjects = data?.subjects ?? [];
  const subjectName = (id) => subjects.find((s) => s.id === id)?.name || 'Unassigned';

  const best = subjectRows.length ? subjectRows.reduce((a, b) => ((b.avgPct ?? -1) > (a.avgPct ?? -1) ? b : a)) : null;
  const worst = subjectRows.length ? subjectRows.reduce((a, b) => ((b.avgPct ?? 101) < (a.avgPct ?? 101) ? b : a)) : null;

  const hasAnything = tests.length > 0 || attendanceRecords.length > 0 || assignments.length > 0 || sessions.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader kicker="ANALYTICS" title="Academic Analytics" sub="Everything below is calculated from your recorded data — nothing is estimated." />

      {!hasAnything ? (
        <OrbitCard>
          <OrbitEmptyState
            icon={BarChart3}
            title="Not enough data yet."
            sub="Add tests with marks, record attendance or log study sessions and analytics will appear here automatically."
          />
        </OrbitCard>
      ) : (
        <>
          {/* ---- Headline numbers ---- */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
            <OrbitStat icon={TrendingUp} tone="purple" value={overall.avgPct != null ? `${overall.avgPct}%` : '—'} label="Marks average" sub={overall.total ? `${overall.total} graded test${overall.total === 1 ? '' : 's'}` : 'No graded tests'} />
            <OrbitStat icon={Percent} tone="green" value={overallAtt?.pct != null ? `${overallAtt.pct}%` : '—'} label="Attendance" sub={overallAtt ? `${overallAtt.present}/${overallAtt.total} classes` : 'No attendance yet'} />
            <OrbitStat icon={ClipboardList} tone="orange" value={`${assignmentStats.pct}%`} label="Assignments done" sub={assignmentStats.total ? `${assignmentStats.completed} of ${assignmentStats.total} completed` : 'No assignments yet'} />
            <OrbitStat
              icon={Timer}
              tone="blue"
              value={study ? `${Math.round((study.weeklyCompletedMinutes / 60) * 10) / 10}h` : '—'}
              label="Study this week"
              sub={study ? `${study.weeklyMinutes ? `${Math.round(study.weeklyMinutes / 60)}h planned` : 'nothing planned'}` : 'No sessions logged'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* ---- Marks trend ---- */}
            <OrbitSection icon={TrendingUp} tone="purple" title="Marks trend" sub="Every graded test, oldest to newest.">
              {tests.filter((t) => t.marks_obtained != null).length < 2 ? (
                <OrbitEmptyState icon={TrendingUp} title="Not enough data yet." sub="Grade at least two tests to see a trend." compact />
              ) : (
                <>
                  <MiniBars
                    data={[...tests]
                      .filter((t) => t.marks_obtained != null)
                      .sort((a, b) => (a.test_date < b.test_date ? -1 : 1))
                      .map((t) => ({
                        label: fmtDate(t.test_date, { day: 'numeric', month: 'short' }),
                        value: testStatsForSubject([t]).avgPct,
                        color: (data?.subjects ?? []).find((s) => s.id === t.subject_id)?.color || '#8b5cf6',
                      }))}
                    height={160}
                    format={(v) => `${v}%`}
                  />
                  <div className="mt-4 pt-4 border-t border-orbit-border flex items-end justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute">Average</p>
                      <p className="text-[22px] font-extrabold text-orbit-text leading-none mt-1">{overall.avgPct}%</p>
                    </div>
                    <div className="w-[55%]"><Sparkline values={[...tests].filter((t) => t.marks_obtained != null).sort((a, b) => (a.test_date < b.test_date ? -1 : 1)).map((t) => testStatsForSubject([t]).avgPct)} color="#8b5cf6" height={46} /></div>
                  </div>
                </>
              )}
            </OrbitSection>

            {/* ---- Attendance trend ---- */}
            <OrbitSection icon={Percent} tone="green" title="Attendance trend" sub="Weekly, from the Excel attendance sheet.">
              {attWeeks.length < 2 ? (
                <OrbitEmptyState icon={Percent} title="Not enough data yet." sub="Attendance is charted week by week as the sheet syncs." compact />
              ) : (
                <>
                  <div className="flex items-center gap-5">
                    <Donut pct={overallAtt?.pct ?? 0} size={92} stroke={10} color={overallAtt?.pct >= 75 ? '#34d399' : overallAtt?.pct >= 70 ? '#f59e0b' : '#fb7185'}>
                      <span className="text-[16px] font-extrabold text-orbit-text">{overallAtt?.pct ?? '—'}%</span>
                    </Donut>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-[12.5px] font-bold text-orbit-text">{overallAtt?.present ?? 0} present</p>
                      <p className="text-[12.5px] font-bold text-orbit-text">{overallAtt?.absent ?? 0} absent</p>
                      <p className="text-[12.5px] font-semibold text-orbit-text-mute">{overallAtt?.total ?? 0} total classes</p>
                    </div>
                  </div>
                  <div className="mt-5 pt-4 border-t border-orbit-border">
                    <MiniBars
                      data={attTrend.map((w) => ({
                        label: fmtDate(w.start, { day: 'numeric', month: 'short' }),
                        value: w.total ? w.present : null,
                        color: '#34d399',
                      }))}
                      height={120}
                    />
                  </div>
                </>
              )}
            </OrbitSection>
          </div>

          {/* ---- Subject performance ---- */}
          <OrbitSection icon={BarChart3} tone="blue" title="Subject performance" sub="Averages measured against each subject's target." bodyClass="p-0">
            {subjectRows.length === 0 ? (
              <div className="p-5">
                <OrbitEmptyState icon={BarChart3} title="Not enough data yet." sub="Subject averages appear once a subject has a graded test." compact />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="or-table w-full min-w-[720px]">
                  <thead>
                    <tr>
                      <th className="text-left">Subject</th><th className="text-left">Tests</th><th className="text-left">Average</th>
                      <th className="text-left">Highest</th><th className="text-left">Lowest</th><th className="text-left">Latest</th>
                      <th className="text-left">vs Target</th><th className="text-left">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectRows.map((r) => (
                      <tr key={r.subject.id}>
                        <td>
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.subject.color }} />
                            <span className="font-bold text-orbit-text truncate">{r.name}</span>
                          </span>
                        </td>
                        <td>{r.count}</td>
                        <td className="font-extrabold text-orbit-text">{r.avgPct}%</td>
                        <td>{r.highest ?? '—'}</td>
                        <td>{r.lowest ?? '—'}</td>
                        <td>{r.latestPct ?? '—'}</td>
                        <td>
                          {r.avgPct != null && r.target != null ? (
                            <span className="font-bold" style={{ color: r.avgPct >= r.target ? '#34d399' : '#fb7185' }}>
                              {r.avgPct >= r.target ? '+' : ''}{Math.round((r.avgPct - r.target) * 10) / 10} pts
                            </span>
                          ) : '—'}
                        </td>
                        <td><TrendBadge trend={r.trend} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OrbitSection>

          {/* ---- Assignment completion ---- */}
          <OrbitSection icon={ClipboardList} tone="orange" title="Assignment completion" sub="Completion and backlog across every task.">
            {assignments.length === 0 ? (
              <OrbitEmptyState icon={ClipboardList} title="Not enough data yet." sub="Add assignments to track completion here." compact />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-4">
                  <Donut pct={assignmentStats.pct} size={80} stroke={9} color="#f59e0b">
                    <span className="text-[14px] font-extrabold text-orbit-text">{assignmentStats.pct}%</span>
                  </Donut>
                  <div>
                    <p className="text-[12.5px] font-bold text-orbit-text">{assignmentStats.completed} of {assignmentStats.total}</p>
                    <p className="text-[12px] text-orbit-text-mute mt-0.5">tasks completed</p>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute">Still open</p>
                  <p className="text-[24px] font-extrabold text-orbit-text leading-none mt-1.5">{assignmentStats.total - assignmentStats.completed}</p>
                  <OrbitProgress value={assignmentStats.total ? ((assignmentStats.total - assignmentStats.completed) / assignmentStats.total) * 100 : 0} tone="#f59e0b" size="sm" className="mt-2.5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute">Overdue</p>
                  <p className="text-[24px] font-extrabold leading-none mt-1.5" style={{ color: assignmentStats.overdue ? '#fb7185' : '#34d399' }}>{assignmentStats.overdue}</p>
                  <p className="text-[11.5px] text-orbit-text-mute mt-2">{assignmentStats.overdue ? 'Needs your attention' : "You're on top of it"}</p>
                </div>
              </div>
            )}
          </OrbitSection>

          {/* ---- Study activity ---- */}
          <OrbitSection icon={Timer} tone="lavender" title="Study activity" sub="Logged sessions for the current week.">
            {!study || !study.weeklyMinutes ? (
              <OrbitEmptyState icon={Timer} title="Not enough data yet." sub="Plan study sessions in the Study Planner and they will show up here." compact />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute">This week</p>
                  <p className="text-[24px] font-extrabold text-orbit-text leading-none mt-1.5">{Math.round((study.weeklyCompletedMinutes / 60) * 10) / 10}h</p>
                  <p className="text-[11.5px] text-orbit-text-mute mt-2">of {Math.round(study.weeklyMinutes / 60)}h planned</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute">Completion</p>
                  <p className="text-[24px] font-extrabold text-orbit-text leading-none mt-1.5">{study.completionPct ?? 0}%</p>
                  <OrbitProgress value={study.completionPct ?? 0} tone="#8b5cf6" size="sm" className="mt-2.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute mb-2">By subject</p>
                  {study.bySubject.length === 0 ? (
                    <p className="text-[12px] text-orbit-text-mute">No subjects logged yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {study.bySubject.slice(0, 4).map((s) => (
                        <div key={s.subjectId} className="flex items-center gap-2">
                          <span className="text-[11.5px] font-semibold text-orbit-text-soft truncate flex-1">{s.subjectId === 'none' ? 'Unassigned' : subjectName(s.subjectId)}</span>
                          <span className="text-[11.5px] font-bold text-orbit-text shrink-0">{Math.round(s.minutes / 60)}h</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </OrbitSection>

          {/* ---- Insights: statements only where data supports them ---- */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {best && best.avgPct != null && (
              <InsightCard tone="green" icon={Trophy}>
                <b>{best.name}</b> is your strongest subject at <b>{best.avgPct}%</b> average across {best.count} test{best.count === 1 ? '' : 's'}.
              </InsightCard>
            )}
            {worst && worst.avgPct != null && subjectRows.length > 1 && (
              <InsightCard tone="coral" icon={ArrowDown}>
                <b>{worst.name}</b> has the lowest average at <b>{worst.avgPct}%</b>{worst.target ? ` (target ${worst.target}%)` : ''}.
              </InsightCard>
            )}
            {overall.highest != null && overall.latestPct != null && (
              <InsightCard tone="blue" icon={TrendingUp}>
                Your best single score is <b>{overall.highest}%</b>; the most recent test scored <b>{overall.latestPct}%</b>.
              </InsightCard>
            )}
            {overallAtt?.pct != null && (
              <InsightCard tone="green" icon={CheckCircle2}>
                Attendance stands at <b>{overallAtt.pct}%</b> — {overallAtt.present} present of {overallAtt.total} recorded classes.
              </InsightCard>
            )}
            {trendSummary(subjectRows)}
          </section>
        </>
      )}
    </div>
  );
}

function InsightCard({ tone, icon: Icon, children }) {
  const color = { green: '#34d399', coral: '#fb7185', blue: '#38bdf8', purple: '#8b5cf6' }[tone] || '#8b5cf6';
  return (
    <OrbitCard className="p-4 flex gap-3">
      <Icon className="w-4.5 h-4.5 shrink-0 mt-0.5" style={{ color }} strokeWidth={2.2} />
      <p className="text-[13px] text-orbit-text-soft leading-relaxed">{children}</p>
    </OrbitCard>
  );
}

function trendSummary(rows) {
  const withTrend = rows.filter((r) => r.trend);
  if (!withTrend.length) return null;
  const up = withTrend.filter((r) => r.trend.direction === 'improving');
  const down = withTrend.filter((r) => r.trend.direction === 'declining');
  const parts = [];
  if (up.length) parts.push(`improving in ${up.map((r) => r.name).join(', ')}`);
  if (down.length) parts.push(`declining in ${down.map((r) => r.name).join(', ')}`);
  const rest = withTrend.length - up.length - down.length;
  if (rest > 0) parts.push(`${rest} stable`);
  return (
    <InsightCard key="trend" tone="purple" icon={TrendingUp}>
      Compared to your first recorded test, you are {parts.join(' · ')}.
    </InsightCard>
  );
}

function TrendBadge({ trend }) {
  if (!trend) return <span className="text-orbit-text-mute">—</span>;
  const { direction, delta, from, to } = trend;
  if (direction === 'improving') {
    return <OrbitBadge tone="green" title={`${from}% → ${to}%`}><TrendingUp className="w-3 h-3" strokeWidth={2.6} /> +{delta} pts</OrbitBadge>;
  }
  if (direction === 'declining') {
    return <OrbitBadge tone="coral" title={`${from}% → ${to}%`}><TrendingDown className="w-3 h-3" strokeWidth={2.6} /> {delta} pts</OrbitBadge>;
  }
  return <OrbitBadge title={`${from}% → ${to}%`}><Minus className="w-3 h-3" strokeWidth={2.6} /> stable</OrbitBadge>;
}
