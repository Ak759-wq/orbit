import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Download, FileText, Trophy, TrendingUp, Target, CalendarClock } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader, Modal, Field, ConfirmDialog } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitEmptyState, OrbitBadge, OrbitStat, OrbitProgress, Sparkline, Donut } from '../orbit/Orbit.jsx';
import { validateTest } from '../../lib/validate.js';
import { TEST_TYPES, labelOf } from '../../lib/constants.js';
import { testPercentage, testStatsForSubject, overallTestStats } from '../../lib/calc.js';
import { getUpcomingTests } from '../../lib/queries.js';
import { todayISO, fmtDate, countdownLabel } from '../../lib/datetime.js';
import { downloadCSV } from '../../lib/csv.js';

const EMPTY = { name: '', subject_id: '', topic: '', test_type: 'class_test', test_date: todayISO(), max_marks: '', marks_obtained: '', notes: '' };

// Colour communicates meaning: green = strong, amber = ok, coral = needs work.
function scoreTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'green';
  if (pct >= 60) return 'orange';
  return 'coral';
}

export default function Tests() {
  const { data, insertRow, updateRow, deleteRow, today } = useApp();
  const subjects = data?.subjects ?? [];
  const tests = data?.tests ?? [];
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterType, setFilterType] = useState('');
  const [errors, setErrors] = useState({});

  // Quick Action hand-off from the Dashboard: open the create modal once.
  useEffect(() => {
    if (sessionStorage.getItem('orbit-quick-add') === 'tests') {
      sessionStorage.removeItem('orbit-quick-add');
      setEditing({ ...EMPTY });
    }
  }, []);

  const subjName = (id) => subjects.find((s) => s.id === id)?.name || '—';
  const subjColor = (id) => subjects.find((s) => s.id === id)?.color || '#8b5cf6';

  const filtered = useMemo(() =>
    [...tests]
      .filter((t) => (!filterSubject || String(t.subject_id) === filterSubject) && (!filterType || t.test_type === filterType))
      .sort((a, b) => (a.test_date < b.test_date ? 1 : -1)),
    [tests, filterSubject, filterType]);

  // Same shared query as the Dashboard's "Upcoming Tests" tile — one helper, one truth.
  const upcoming = useMemo(() => getUpcomingTests(filtered, today), [filtered, today]);
  const graded = useMemo(
    () => filtered.filter((t) => t.marks_obtained != null).sort((a, b) => (a.test_date < b.test_date ? -1 : 1)),
    [filtered],
  );
  const overall = useMemo(() => overallTestStats(filtered), [filtered]);

  // Per-subject performance, best average first. Subjects without marks are excluded.
  const perSubject = useMemo(() =>
    subjects
      .map((s) => ({ subject: s, stats: testStatsForSubject(filtered.filter((t) => t.subject_id === s.id)) }))
      .filter((r) => r.stats.count > 0)
      .sort((a, b) => (b.stats.avgPct ?? 0) - (a.stats.avgPct ?? 0)),
    [subjects, filtered]);

  const trend = useMemo(() => graded.map((t) => testPercentage(t)).filter((p) => p != null), [graded]);

  const save = async (e) => {
    e.preventDefault();
    const rec = {
      ...editing,
      subject_id: editing.subject_id ? Number(editing.subject_id) : '',
      max_marks: editing.max_marks === '' ? '' : Number(editing.max_marks),
      marks_obtained: editing.marks_obtained === '' || editing.marks_obtained == null ? '' : Number(editing.marks_obtained),
    };
    const { ok, errors: errs } = validateTest(rec);
    setErrors(errs);
    if (!ok) return;
    const row = { ...rec };
    delete row.id;
    if (row.marks_obtained === '') row.marks_obtained = null;
    if (editing.id) await updateRow('tests', editing.id, row);
    else await insertRow('tests', row);
    setEditing(null);
    setErrors({});
  };

  const openEditor = (t) => { setEditing(t ? { ...t, marks_obtained: t.marks_obtained ?? '' } : { ...EMPTY }); setErrors({}); };

  return (
    <div>
      <PageHeader
        kicker="TESTS & MARKS"
        title="Tests & Marks"
        sub="Record every test. Percentages and analytics are calculated automatically."
        actions={(
          <>
            <OrbitButton variant="outline" onClick={() => downloadCSV('tests.csv',
              ['Name', 'Subject', 'Type', 'Date', 'Max', 'Obtained', 'Percent'],
              tests.map((t) => [t.name, subjName(t.subject_id), t.test_type, t.test_date, t.max_marks, t.marks_obtained ?? '', testPercentage(t) ?? '']))}>
              <Download className="w-4 h-4" strokeWidth={2.2} /> Export
            </OrbitButton>
            <OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add test</OrbitButton>
          </>
        )}
      />

      {!tests.length ? (
        <OrbitCard>
          <OrbitEmptyState
            icon={FileText}
            title="No test records yet"
            sub="Add your first test to start tracking performance — averages, trends and subject analytics build themselves."
            action={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add your first test</OrbitButton>}
          />
        </OrbitCard>
      ) : (
        <div className="space-y-6">
          {/* ---- Summary ---- */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
            <OrbitStat icon={CalendarClock} tone="coral" value={upcoming.length} label="Upcoming tests" sub={upcoming.length ? `Next: ${upcoming[0].name}` : "Nothing scheduled"} />
            <OrbitStat icon={Target} tone="purple" value={overall.avgPct != null ? `${overall.avgPct}%` : '—'} label="Overall average" sub={`${overall.total} graded test${overall.total === 1 ? '' : 's'}`} />
            <OrbitStat icon={Trophy} tone="green" value={overall.highest != null ? `${overall.highest}%` : '—'} label="Best score" sub={overall.lowest != null ? `Lowest ${overall.lowest}%` : 'No scores yet'} />
            <OrbitStat icon={TrendingUp} tone="blue" value={overall.latestPct != null ? `${overall.latestPct}%` : '—'} label="Latest result" sub={overall.latestName || 'No graded test'} />
          </div>

          {/* ---- Upcoming Tests ---- */}
          <section>
            <p className="or-kicker mb-2.5">Upcoming tests</p>
            <OrbitCard>
              {upcoming.length === 0 ? (
                <OrbitEmptyState
                  icon={CalendarClock}
                  title="No upcoming tests."
                  sub="You're all clear for now."
                  compact
                  action={<OrbitButton size="sm" onClick={() => openEditor(null)}><Plus className="w-3.5 h-3.5" strokeWidth={2.4} /> Add test</OrbitButton>}
                />
              ) : (
                <div className="or-timeline">
                  {upcoming.slice(0, 6).map((t) => (
                    <div key={t.id} className="or-timeline-item">
                      <span className="or-timeline-dot" style={{ background: subjColor(t.subject_id) }} />
                      <div className="min-w-0 flex-1 flex items-center gap-3 pt-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-bold text-orbit-text truncate">{t.name}</p>
                          <p className="text-[12px] text-orbit-text-mute mt-0.5 truncate">
                            {subjName(t.subject_id)}{t.topic ? ` · ${t.topic}` : ''} · {labelOf(TEST_TYPES, t.test_type)} · {fmtDate(t.test_date)}
                          </p>
                        </div>
                        <OrbitBadge tone="coral">{countdownLabel(t.test_date, today)}</OrbitBadge>
                        <button className="or-iconbtn or-iconbtn-bordered w-7 h-7 shrink-0" onClick={() => openEditor(t)} title="Edit"><Pencil className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </OrbitCard>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* ---- Recent Results ---- */}
            <div className="lg:col-span-3">
              <p className="or-kicker mb-2.5">Recent results</p>
              <OrbitCard className="overflow-hidden">
                {graded.length === 0 ? (
                  <OrbitEmptyState icon={Target} title="No graded tests yet" sub="Add marks to a past test and results will appear here." compact />
                ) : (
                  <div className="divide-y divide-orbit-border">
                    {[...graded].reverse().map((t) => {
                      const pct = testPercentage(t);
                      return (
                        <div key={t.id} className="flex items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-orbit-bg">
                          <Donut pct={pct ?? 0} size={44} stroke={5} color={pct >= 80 ? '#34d399' : pct >= 60 ? '#f59e0b' : '#fb7185'}>
                            <span className="text-[10px] font-extrabold text-orbit-text">{pct ?? '—'}</span>
                          </Donut>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-bold text-orbit-text truncate">{t.name}</p>
                            <p className="text-[12px] text-orbit-text-mute mt-0.5 truncate">
                              {subjName(t.subject_id)} · {fmtDate(t.test_date)} · {t.marks_obtained}/{t.max_marks} marks
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => openEditor(t)} title="Edit"><Pencil className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                            <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => setConfirmDelete(t)} title="Delete"><Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </OrbitCard>
            </div>

            {/* ---- Performance Trend ---- */}
            <div className="lg:col-span-2">
              <p className="or-kicker mb-2.5">Performance trend</p>
              <OrbitCard className="h-full">
                {trend.length < 2 ? (
                  <OrbitEmptyState icon={TrendingUp} title="Not enough data yet." sub="Grade at least two tests to see a trend." compact />
                ) : (
                  <>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[30px] font-extrabold text-orbit-text leading-none">{overall.avgPct}%</p>
                        <p className="text-[12px] text-orbit-text-mute mt-1.5">Average across {overall.total} graded test{overall.total === 1 ? '' : 's'}</p>
                      </div>
                      <OrbitBadge tone={scoreTone(overall.avgPct)}>
                        {overall.latestPct >= overall.avgPct ? 'Above average' : 'Below average'}
                      </OrbitBadge>
                    </div>
                    <div className="mt-4 pt-4 border-t border-orbit-border">
                      <Sparkline values={trend} color="#8b5cf6" height={70} />
                      <div className="flex justify-between mt-2">
                        <span className="text-[10.5px] font-semibold text-orbit-text-mute">{fmtDate(graded[0].test_date)}</span>
                        <span className="text-[10.5px] font-semibold text-orbit-text-mute">{fmtDate(graded[graded.length - 1].test_date)}</span>
                      </div>
                    </div>
                  </>
                )}
              </OrbitCard>
            </div>
          </div>

          {/* ---- Subject Performance ---- */}
          <section>
            <p className="or-kicker mb-2.5">Subject performance</p>
            <OrbitCard>
              {perSubject.length === 0 ? (
                <OrbitEmptyState icon={Target} title="Not enough data yet." sub="Subject averages appear once a subject has a graded test." compact />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
                  {perSubject.map(({ subject, stats }) => (
                    <div key={subject.id}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: subject.color || '#8b5cf6' }} />
                        <p className="text-[13px] font-bold text-orbit-text truncate flex-1">{subject.name}</p>
                        <span className="text-[13px] font-extrabold text-orbit-text shrink-0">{stats.avgPct}%</span>
                      </div>
                      <OrbitProgress value={stats.avgPct} tone={stats.avgPct >= 80 ? '#34d399' : stats.avgPct >= 60 ? '#f59e0b' : '#fb7185'} size="sm" />
                      <p className="text-[11px] text-orbit-text-mute mt-1">
                        {stats.count} test{stats.count === 1 ? '' : 's'} · best {stats.highest ?? '—'}%
                        {stats.latestPct != null ? ` · latest ${stats.latestPct}%` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </OrbitCard>
          </section>

          {/* ---- All marks (filterable table) ---- */}
          <section>
            <p className="or-kicker mb-2.5">Marks</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <select className="or-input px-3 py-2 text-xs font-semibold" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
                <option value="">All subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className="or-input px-3 py-2 text-xs font-semibold" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">All types</option>
                {TEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <OrbitCard className="overflow-x-auto">
              <table className="or-table w-full min-w-[620px]">
                <thead>
                  <tr>
                    <th className="text-left">Test</th><th className="text-left">Subject</th><th className="text-left">Type</th>
                    <th className="text-left">Date</th><th className="text-left">Score</th><th className="text-left">%</th><th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const pct = testPercentage(t);
                    const ungraded = t.marks_obtained == null;
                    return (
                      <tr key={t.id}>
                        <td>
                          <p className="font-bold text-orbit-text">{t.name}</p>
                          {t.topic && <p className="text-[11px] text-orbit-text-mute">{t.topic}</p>}
                        </td>
                        <td>{subjName(t.subject_id)}</td>
                        <td><OrbitBadge tone="neutral">{labelOf(TEST_TYPES, t.test_type)}</OrbitBadge></td>
                        <td className="whitespace-nowrap">{fmtDate(t.test_date)}</td>
                        <td className="whitespace-nowrap">{ungraded ? <OrbitBadge tone="orange">Ungraded</OrbitBadge> : <span className="font-bold text-orbit-text">{t.marks_obtained}/{t.max_marks}</span>}</td>
                        <td>
                          {pct != null && (
                            <span className="font-extrabold" style={{ color: pct >= 80 ? '#34d399' : pct >= 60 ? '#f59e0b' : '#fb7185' }}>{pct}%</span>
                          )}
                        </td>
                        <td>
                          <div className="flex gap-1 justify-end">
                            <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => openEditor(t)} title="Edit"><Pencil className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                            <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => setConfirmDelete(t)} title="Delete"><Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && <tr><td colSpan={7} className="text-center text-orbit-text-mute py-6">No tests match the filters.</td></tr>}
                </tbody>
              </table>
            </OrbitCard>
          </section>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit test' : 'Add test'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <Field label="Test name *" error={errors.name}>
              <input className="or-input w-full px-3 py-2 text-sm" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Java Class Test 2" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Subject *" error={errors.subject_id}>
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.subject_id ?? ''} onChange={(e) => setEditing({ ...editing, subject_id: e.target.value })}>
                  <option value="">Select…</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Test type">
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.test_type} onChange={(e) => setEditing({ ...editing, test_type: e.target.value })}>
                  {TEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Date *" error={errors.test_date}>
                <input type="date" className="or-input w-full px-3 py-2 text-sm" value={editing.test_date} onChange={(e) => setEditing({ ...editing, test_date: e.target.value })} />
              </Field>
              <Field label="Topic / chapter">
                <input className="or-input w-full px-3 py-2 text-sm" value={editing.topic || ''} onChange={(e) => setEditing({ ...editing, topic: e.target.value })} placeholder="Collections" />
              </Field>
              <Field label="Maximum marks *" error={errors.max_marks}>
                <input type="number" min="1" className="or-input w-full px-3 py-2 text-sm" value={editing.max_marks} onChange={(e) => setEditing({ ...editing, max_marks: e.target.value })} placeholder="50" />
              </Field>
              <Field label="Marks obtained" error={errors.marks_obtained}>
                <input type="number" min="0" className="or-input w-full px-3 py-2 text-sm" value={editing.marks_obtained} onChange={(e) => setEditing({ ...editing, marks_obtained: e.target.value })} placeholder="Leave blank if ungraded" />
              </Field>
            </div>
            {editing.max_marks !== '' && editing.marks_obtained !== '' && Number(editing.max_marks) > 0 && Number.isFinite(Number(editing.marks_obtained)) && (
              <OrbitBadge tone="purple" className="mb-3">Percentage: {Math.round((Number(editing.marks_obtained) / Number(editing.max_marks)) * 1000) / 10}%</OrbitBadge>
            )}
            <Field label="Notes">
              <textarea className="or-input w-full px-3 py-2 text-sm" rows={2} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 mt-4">
              <OrbitButton type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</OrbitButton>
              <OrbitButton type="submit">Save test</OrbitButton>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog title="Delete test?" message={`Remove "${confirmDelete.name}" and its marks from analytics?`} onConfirm={() => deleteRow('tests', confirmDelete.id)} onClose={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}
