// Orbit website sections 5–8: Tests & Marks, Assignments,
// Attendance, Study Planner. All CRUD against the persistent
// website DB; stats computed by the shared calc engine.

import { useState } from 'react';
import { validateTest, validateAssignment, validateSession } from '../lib/validate.js';
import { TEST_TYPES, TASK_TYPES, labelOf } from '../lib/constants.js';
import { testPercentage, sessionMinutes } from '../lib/calc.js';
import { fmtDuration } from '../lib/datetime.js';
import { useWebsite } from './WebsiteContext.jsx';
import { fmt12 } from './Sections1.jsx';

/* ---------- small form helper ---------- */
function Field({ label, error, children, span }) {
  return (
    <div className="ws-f" style={span ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      {children}
      {error && <span className="ws-err">{error}</span>}
    </div>
  );
}

/* ============================================================
   SECTION 5 — TESTS & MARKS
   ============================================================ */
const EMPTY_TEST = { name: '', subject_id: '', topic: '', test_type: 'class_test', test_date: new Date().toISOString().slice(0, 10), max_marks: '', marks_obtained: '' };

export function TestsSection() {
  const ws = useWebsite();
  const [f, setF] = useState(EMPTY_TEST);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = (e) => {
    e.preventDefault();
    const rec = {
      ...f,
      subject_id: f.subject_id ? Number(f.subject_id) : '',
      max_marks: f.max_marks === '' ? '' : Number(f.max_marks),
      marks_obtained: f.marks_obtained === '' ? '' : Number(f.marks_obtained),
    };
    const { ok, errors } = validateTest(rec);
    setErrors(errors);
    if (!ok) return;
    ws.insert('tests', { ...rec, marks_obtained: rec.marks_obtained === '' ? null : rec.marks_obtained, notes: '' });
    setF({ ...EMPTY_TEST });
  };

  const o = ws.overall;
  const removeTest = (id) => ws.remove('tests', id);

  return (
    <section className="ws-sec" id="ws-tests">
      <div className="ws-reveal">
        <span className="ws-kicker">Tests & Marks</span>
        <h2 className="ws-h2">Turn every test into progress.</h2>
        <p className="ws-lead">Add a test and the percentage, averages and trends calculate themselves — always from your real marks.</p>
      </div>

      <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 30 }}>
        <form onSubmit={save}>
          <div className="ws-form-grid">
            <Field label="Test name *" error={errors.name}>
              <input value={f.name} onChange={set('name')} placeholder="Java Class Test 1" />
            </Field>
            <Field label="Subject *" error={errors.subject_id}>
              <select value={f.subject_id} onChange={set('subject_id')}>
                <option value="">Select subject…</option>
                {ws.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select value={f.test_type} onChange={set('test_type')}>
                {TEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Topic">
              <input value={f.topic} onChange={set('topic')} placeholder="Collections" />
            </Field>
            <Field label="Date *" error={errors.test_date}>
              <input type="date" value={f.test_date} onChange={set('test_date')} />
            </Field>
            <Field label="Max marks *" error={errors.max_marks}>
              <input type="number" min="1" value={f.max_marks} onChange={set('max_marks')} placeholder="50" />
            </Field>
            <Field label="Marks obtained" error={errors.marks_obtained}>
              <input type="number" min="0" value={f.marks_obtained} onChange={set('marks_obtained')} placeholder="Leave blank if ungraded" />
            </Field>
            <div className="ws-f" style={{ justifyContent: 'flex-end' }}>
              <label>&nbsp;</label>
              <button type="submit" className="ws-btn ws-btn-violet" style={{ width: '100%', justifyContent: 'center' }}>Add test</button>
            </div>
          </div>
          {f.max_marks !== '' && f.marks_obtained !== '' && Number(f.max_marks) > 0 && Number.isFinite(Number(f.marks_obtained)) && (
            <p style={{ margin: '12px 2px 0', fontSize: 12.5, fontWeight: 700, color: '#6ee7b7' }}>
              Percentage: {Math.round((Number(f.marks_obtained) / Number(f.max_marks)) * 1000) / 10}%
            </p>
          )}
        </form>
      </div>

      {/* stats */}
      {o.total > 0 ? (
        <>
          <div className="ws-stats ws-reveal">
            <div className="ws-stat"><em>Overall avg</em><b>{o.avgPct}%</b></div>
            <div className="ws-stat"><em>Tests</em><b>{o.total}</b></div>
            <div className="ws-stat"><em>Highest</em><b className="ws-pct good">{o.highest}%</b></div>
            <div className="ws-stat"><em>Lowest</em><b className="ws-pct bad">{o.lowest}%</b></div>
            <div className="ws-stat"><em>Recent</em><b>{o.latestPct}%</b></div>
          </div>

          {/* subject averages + trends */}
          {ws.subjectStats.length > 0 && (
            <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 16 }}>
              <table className="ws-table">
                <thead><tr><th>Subject</th><th>Tests</th><th>Average</th><th>High</th><th>Low</th><th>Latest</th><th>Trend</th></tr></thead>
                <tbody>
                  {ws.subjectStats.map((r) => (
                    <tr key={r.subject.id}>
                      <td style={{ color: '#fff', fontWeight: 700 }}>{r.name}</td>
                      <td>{r.count}</td>
                      <td className="ws-pct">{r.avgPct != null ? `${r.avgPct}%` : '—'}</td>
                      <td>{r.highest != null ? `${r.highest}%` : '—'}</td>
                      <td>{r.lowest != null ? `${r.lowest}%` : '—'}</td>
                      <td>{r.latestPct != null ? `${r.latestPct}%` : '—'}</td>
                      <td><Trend trend={r.trend} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* recent tests */}
          <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 16 }}>
            <table className="ws-table">
              <thead><tr><th>Test</th><th>Subject</th><th>Date</th><th>Score</th><th>%</th><th></th></tr></thead>
              <tbody>
                {ws.tests.slice(0, 10).map((t) => {
                  const pct = testPercentage(t);
                  return (
                    <tr key={t.id}>
                      <td style={{ color: '#fff', fontWeight: 700 }}>{t.name}{t.topic ? <span style={{ color: '#6f6a8a', fontWeight: 600 }}> · {t.topic}</span> : null}</td>
                      <td>{ws.subjectName(t.subject_id) || '—'}</td>
                      <td>{ws.fmt(t.test_date)}</td>
                      <td>{t.marks_obtained != null ? `${t.marks_obtained}/${t.max_marks}` : <span className="ws-chip warn">Ungraded</span>}</td>
                      <td><PctVal v={pct} /></td>
                      <td><button className="ws-icon-btn" onClick={() => removeTest(t.id)} title="Delete">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="ws-empty ws-reveal" style={{ marginTop: 26 }}>
          <b>No tests yet.</b>
          <p>Add your first test above to start tracking your performance. Averages, highest/lowest scores and subject trends appear automatically as soon as you do.</p>
        </div>
      )}
    </section>
  );
}

export function PctVal({ v }) {
  if (v == null) return <span style={{ color: '#6f6a8a' }}>—</span>;
  const cls = v >= 75 ? 'good' : v >= 55 ? 'mid' : 'bad';
  return <span className={`ws-pct ${cls}`}>{v}%</span>;
}

export function Trend({ trend }) {
  if (!trend) return <span className="ws-trend flat">—</span>;
  if (trend.direction === 'improving') return <span className="ws-trend up">▲ +{trend.delta} pts</span>;
  if (trend.direction === 'declining') return <span className="ws-trend down">▼ {trend.delta} pts</span>;
  return <span className="ws-trend flat">— stable</span>;
}

/* ============================================================
   SECTION 6 — ASSIGNMENTS
   ============================================================ */
const EMPTY_A = { title: '', subject_id: '', description: '', task_type: 'assignment', due_date: '', priority: 'normal', status: 'not_started' };
const BUCKETS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'tomorrow', label: 'Due tomorrow' },
  { id: 'week', label: 'This week' },
  { id: 'later', label: 'Later' },
  { id: 'completed', label: 'Completed' },
];

export function AssignmentsSection() {
  const ws = useWebsite();
  const [f, setF] = useState(EMPTY_A);
  const [errors, setErrors] = useState({});
  const [tab, setTab] = useState('open');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = (e) => {
    e.preventDefault();
    const rec = { ...f, subject_id: f.subject_id ? Number(f.subject_id) : '' };
    const { ok, errors } = validateAssignment(rec);
    setErrors(errors);
    if (!ok) return;
    ws.insert('assignments', rec);
    setF({ ...EMPTY_A });
  };

  // Check toggles done ↔ not-started; the status button cycles all three.
  const complete = (a) => ws.update('assignments', a.id, { status: a.status === 'completed' ? 'not_started' : 'completed' });
  const cycle = (a) => ws.update('assignments', a.id, {
    status: a.status === 'not_started' ? 'in_progress' : a.status === 'in_progress' ? 'completed' : 'not_started',
  });

  const listFor = (tab) => {
    const all = ws.assignments;
    if (tab === 'completed') return all.filter((a) => a.status === 'completed');
    if (tab === 'open') return all.filter((a) => a.status !== 'completed');
    const ids = new Set(ws.buckets[tab]?.map((a) => a.id));
    return all.filter((a) => ids.has(a.id));
  };
  const shown = listFor(tab);
  const countFor = (id) => id === 'completed'
    ? ws.assignStats.completed
    : id === 'open'
      ? ws.assignStats.pending
      : ws.buckets[id]?.length ?? 0;

  return (
    <section className="ws-sec" id="ws-assignments">
      <div className="ws-reveal">
        <span className="ws-kicker">Assignments</span>
        <h2 className="ws-h2">Never lose track of a deadline.</h2>
        <p className="ws-lead">
          {ws.assignStats.total > 0
            ? `${ws.assignStats.pending} pending · ${ws.assignStats.overdue} overdue · ${ws.assignStats.completed} of ${ws.assignStats.total} done`
            : 'Add assignments and Orbit sorts them by urgency automatically.'}
        </p>
      </div>

      <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 30 }}>
        <form onSubmit={save}>
          <div className="ws-form-grid">
            <Field label="Assignment *" error={errors.title}>
              <input value={f.title} onChange={set('title')} placeholder="Java Assignment 3" />
            </Field>
            <Field label="Subject *" error={errors.subject_id}>
              <select value={f.subject_id} onChange={set('subject_id')}>
                <option value="">Select subject…</option>
                {ws.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Due date *" error={errors.due_date}>
              <input type="date" value={f.due_date} onChange={set('due_date')} />
            </Field>
            <Field label="Type">
              <select value={f.task_type} onChange={set('task_type')}>
                {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select value={f.priority} onChange={set('priority')}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </Field>
            <div className="ws-f" style={{ justifyContent: 'flex-end' }}>
              <label>&nbsp;</label>
              <button type="submit" className="ws-btn ws-btn-violet" style={{ width: '100%', justifyContent: 'center' }}>Add assignment</button>
            </div>
          </div>
        </form>
      </div>

      {ws.assignments.length > 0 ? (
        <>
          <div className="ws-buckets ws-reveal">
            <button className={`ws-bucket ${tab === 'open' ? 'on' : ''}`} onClick={() => setTab('open')}>All open <em>({countFor('open')})</em></button>
            {BUCKETS.filter((b) => b.id !== 'completed').map((b) => (
              <button key={b.id} className={`ws-bucket ${tab === b.id ? 'on' : ''}`} onClick={() => setTab(b.id)}>
                {b.label} <em>({countFor(b.id)})</em>
              </button>
            ))}
            <button className={`ws-bucket ${tab === 'completed' ? 'on' : ''}`} onClick={() => setTab('completed')}>Completed <em>({countFor('completed')})</em></button>
          </div>

          <div className="ws-reveal" style={{ marginTop: 18 }}>
            {shown.length === 0 ? (
              <div className="ws-empty"><b>Nothing here</b><p>No assignments in this bucket right now.</p></div>
            ) : shown.map((a) => {
              const overdue = a.status !== 'completed' && a.due_date < ws.today;
              const bucketLabel = a.status === 'completed' ? 'Done' : overdue ? 'Overdue' : a.due_date === ws.today ? 'Due today' : a.due_date === ws.tomorrow ? 'Due tomorrow' : ws.fmt(a.due_date);
              return (
                <div key={a.id} className="ws-row">
                  <button
                    className={`ws-check ${a.status === 'completed' ? 'on' : ''}`}
                    onClick={() => complete(a)}
                    title={a.status === 'completed' ? 'Mark as not started' : 'Mark complete'}
                  >✓</button>
                  <div className="ws-row-main">
                    <b className={a.status === 'completed' ? '' : undefined} style={a.status === 'completed' ? { textDecoration: 'line-through', color: '#6f6a8a' } : undefined}>{a.title}</b>
                    <span>{ws.subjectName(a.subject_id) || '—'} · {labelOf(TASK_TYPES, a.task_type)} · {a.priority === 'high' ? 'HIGH PRIORITY' : a.priority === 'low' ? 'low priority' : 'normal'}</span>
                  </div>
                  <span className={`ws-chip ${overdue ? 'red' : a.status === 'completed' ? 'mint' : a.due_date === ws.today ? 'warn' : 'cyan'}`}>{bucketLabel}</span>
                  {a.status !== 'completed' && (
                    <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => cycle(a)}>
                      {a.status === 'not_started' ? 'Start' : 'Progressing…'}
                    </button>
                  )}
                  <button className="ws-icon-btn" onClick={() => ws.remove('assignments', a.id)} title="Delete">✕</button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="ws-empty ws-reveal" style={{ marginTop: 26 }}>
          <b>No assignments yet.</b>
          <p>Add your first assignment above — Orbit will sort it into due today, this week or overdue automatically and count it on your dashboard.</p>
        </div>
      )}
    </section>
  );
}

/* ============================================================
   SECTION 7 — ATTENDANCE
   ============================================================ */
export function AttendanceSection() {
  const ws = useWebsite();
  const [targets, setTargets] = useState({});

  // Idempotent today-mark: same status again = undo; opposite = flip; none = insert.
  const mark = (subjectId, status) => {
    const rec = ws.attendance.find((r) => r.subject_id === subjectId && r.class_date === ws.today);
    if (!rec) ws.insert('attendance', { subject_id: subjectId, class_date: ws.today, status });
    else if (rec.status === status) ws.remove('attendance', rec.id);
    else ws.update('attendance', rec.id, { status });
  };
  const undoToday = (subjectId) => {
    const rec = ws.attendance.find((r) => r.subject_id === subjectId && r.class_date === ws.today);
    if (rec) ws.remove('attendance', rec.id);
  };
  const todayStatus = (subjectId) =>
    ws.attendance.find((r) => r.subject_id === subjectId && r.class_date === ws.today)?.status ?? null;

  return (
    <section className="ws-sec" id="ws-attendance">
      <div className="ws-reveal">
        <span className="ws-kicker">Attendance</span>
        <h2 className="ws-h2">Stay on top of attendance.</h2>
        <p className="ws-lead">
          Attendance syncs straight from your connected Excel sheet — no manual marking to drift out
          of date. See per-subject percentages, and use the forecast to know exactly how many
          classes you can miss — or must attend — for your own target. {ws.overallAtt.total > 0 ? `Overall: ${ws.overallAtt.pct}% across ${ws.overallAtt.total} classes.` : ''}
        </p>
      </div>

      <div className="ws-att-grid">
        {ws.subjectAttendance.map((s) => (
          <AttCard
            key={s.subjectId}
            s={s}
            targets={targets}
            setTargets={setTargets}
            onMark={mark}
            onUndo={undoToday}
            today={ws.today}
            markedTodayStatus={todayStatus(s.subjectId)}
          />
        ))}
      </div>

      {ws.overallAtt.total === 0 && (
        <div className="ws-empty ws-reveal" style={{ marginTop: 24 }}>
          <b>No attendance marked yet.</b>
          <p>Use the Present / Absent buttons on each subject. Percentages, forecasts and low-attendance warnings appear as soon as you start marking.</p>
        </div>
      )}
    </section>
  );
}

function AttCard({ s, targets, setTargets, onMark, onUndo, today, markedTodayStatus }) {
  const markedToday = markedTodayStatus != null;
  const target = Number(targets[s.subjectId] ?? 75);
  const proj = attendanceProjectionFor(s, target);
  const low = s.total > 0 && s.pct != null && s.pct < target;

  return (
    <div className="ws-panel ws-panel-pad ws-att-card ws-reveal">
      <div className="ws-att-head">
        <b>{s.name}</b>
        {low && <span className="ws-chip red">Below {target}%</span>}
      </div>
      <div className="ws-att-nums">
        <b>{s.pct != null ? `${s.pct}%` : '—'}</b>
        <span>{s.present}/{s.total} held · {s.absent} missed</span>
      </div>
      <div className="ws-bar"><div className={low ? 'low' : ''} style={{ width: `${Math.min(s.pct ?? 0, 100)}%` }} /></div>

      <div className="ws-mark-row">
        <button
          className={`ws-mark-btn p${markedTodayStatus === 'present' ? ' on' : ''}`}
          onClick={() => onMark(s.subjectId, 'present')}
          title={markedTodayStatus === 'present' ? 'Tap again to undo' : 'Mark present today'}
        >Present</button>
        <button
          className={`ws-mark-btn a${markedTodayStatus === 'absent' ? ' on' : ''}`}
          onClick={() => onMark(s.subjectId, 'absent')}
          title={markedTodayStatus === 'absent' ? 'Tap again to undo' : 'Mark absent today'}
        >Absent</button>
      </div>

      {s.total > 0 && (
        <div className="ws-forecast">
          <p>Attendance forecast for a <b>{target}%</b> target:</p>
          <p>• Attend next → <b>{proj.attendPct != null ? `${proj.attendPct}%` : '—'}</b> · Miss next → <b>{proj.missPct != null ? `${proj.missPct}%` : '—'}</b></p>
          <p>• {proj.missable === null
            ? 'You are already below this target — attend every class to climb back.'
            : proj.missable === 0
              ? 'You are exactly at the target — attend the next one to gain buffer.'
              : <>You can miss <b>{proj.missable}</b> more class{proj.missable === 1 ? '' : 'es'} before dropping below {target}%.</>}</p>
          <p>• Or attend <b>{proj.needToReach}</b> in a row to reach {target}% from here.</p>
          <div className="ws-f">
            <label>Your target %</label>
            <select value={target} onChange={(e) => setTargets((p) => ({ ...p, [s.subjectId]: e.target.value }))}>
              {[70, 75, 80, 85, 90].map((v) => <option key={v} value={v}>{v}%</option>)}
            </select>
          </div>
          {markedToday && (
            <button className="ws-btn ws-btn-ghost ws-btn-sm" style={{ marginTop: 8 }} onClick={() => onUndo(s.subjectId)}>Undo today's mark</button>
          )}
          {!markedToday && s.total > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 11.5, fontWeight: 700, color: '#565173' }}>
              Not marked for today ({today}) yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// can-miss & need-to-attend math (target-configurable)
function attendanceProjectionFor(s, targetPct) {
  const { total, present, pct } = s;
  if (!total) return { attendPct: null, missPct: null, missable: null, needToReach: '—' };
  const t = targetPct / 100;
  const attendPct = Math.round(((present + 1) / (total + 1)) * 1000) / 10;
  const missPct = Math.round((present / (total + 1)) * 1000) / 10;
  // missable n: (present)/(total+n) >= t  →  n <= present/t - total
  let missable = null;
  if (pct != null && pct >= targetPct) {
    missable = Math.max(0, Math.floor(present / t - total));
  }
  // need n: (present+n)/(total+n) >= t → n >= (t·total − present)/(1 − t)
  let needToReach = '—';
  if (pct != null && pct < targetPct && targetPct < 100) {
    const raw = (t * total - present) / (1 - t);
    needToReach = String(Math.max(1, Math.ceil(Math.round(raw * 1e9) / 1e9)));
  } else if (pct != null && pct >= targetPct) {
    needToReach = '0 (already there)';
  }
  return { attendPct, missPct, missable, needToReach };
}

/* ============================================================
   SECTION 8 — STUDY PLANNER
   ============================================================ */
const EMPTY_S = { subject_id: '', topic: '', session_date: '', start_time: '17:00', end_time: '18:30', goal: '', status: 'planned' };

export function PlannerSection() {
  const ws = useWebsite();
  const [f, setF] = useState(EMPTY_S);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = (e) => {
    e.preventDefault();
    const rec = { ...f, subject_id: f.subject_id ? Number(f.subject_id) : '', session_date: f.session_date || ws.today };
    const { ok, errors } = validateSession(rec);
    setErrors(errors);
    if (!ok) return;
    ws.insert('sessions', rec);
    setF({ ...EMPTY_S });
  };

  const todayList = ws.todaySessions;
  const upcoming = ws.sessions.filter((s) => s.session_date > ws.today).slice(0, 6);

  return (
    <section className="ws-sec" id="ws-planner">
      <div className="ws-reveal">
        <span className="ws-kicker">Study planner</span>
        <h2 className="ws-h2">Turn free time into progress.</h2>
        <p className="ws-lead">
          Plan sessions around your free periods. {ws.study.plannedMinutes > 0
            ? `${fmtDuration(ws.study.plannedMinutes)} planned · ${fmtDuration(ws.study.completedMinutes)} completed (${ws.study.completionPct ?? 0}%).`
            : 'Mark sessions complete to build your real study hours.'}
        </p>
      </div>

      <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 30 }}>
        <form onSubmit={save}>
          <div className="ws-form-grid">
            <Field label="Subject *" error={errors.subject_id}>
              <select value={f.subject_id} onChange={set('subject_id')}>
                <option value="">Select subject…</option>
                {ws.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Topic">
              <input value={f.topic} onChange={set('topic')} placeholder="Collections revision" />
            </Field>
            <Field label="Date *">
              <input type="date" value={f.session_date} onChange={set('session_date')} />
            </Field>
            <Field label="Start *" error={errors.start_time}>
              <input type="time" value={f.start_time} onChange={set('start_time')} />
            </Field>
            <Field label="End *" error={errors.end_time}>
              <input type="time" value={f.end_time} onChange={set('end_time')} />
            </Field>
            <Field label="Goal">
              <input value={f.goal} onChange={set('goal')} placeholder="Solve 10 problems" />
            </Field>
          </div>
          <button type="submit" className="ws-btn ws-btn-violet" style={{ marginTop: 14 }}>Plan session</button>
        </form>
      </div>

      {/* hours stats — column count follows the ws-stats responsive rules */}
      <div className="ws-stats ws-reveal">
        <div className="ws-stat"><em>Planned (all)</em><b>{fmtDuration(ws.study.plannedMinutes) || '0m'}</b></div>
        <div className="ws-stat"><em>Completed</em><b>{fmtDuration(ws.study.completedMinutes) || '0m'}</b></div>
        <div className="ws-stat"><em>This week</em><b>{fmtDuration(ws.study.weeklyMinutes) || '0m'}</b></div>
        <div className="ws-stat"><em>Today</em><b>{ws.todaySessions.length} session{ws.todaySessions.length === 1 ? '' : 's'}</b></div>
      </div>

      <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 16 }}>
        <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#67e8f9' }}>Today's plan</p>
        {todayList.length === 0 ? (
          <div className="ws-empty"><b>Nothing planned for today.</b><p>Schedule a session above — even 45 focused minutes in a free period moves the needle.</p></div>
        ) : todayList.map((s) => (
          <SessionRow key={s.id} s={s} ws={ws} />
        ))}
        {upcoming.length > 0 && (
          <>
            <p style={{ margin: '18px 0 14px', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9a94b8' }}>Coming up</p>
            {upcoming.map((s) => <SessionRow key={s.id} s={s} ws={ws} />)}
          </>
        )}
      </div>
    </section>
  );
}

function SessionRow({ s, ws }) {
  const done = s.status === 'completed';
  return (
    <div className="ws-row">
      <button
        className={`ws-check ${done ? 'on' : ''}`}
        onClick={() => ws.update('sessions', s.id, { status: done ? 'planned' : 'completed' })}
        title={done ? 'Mark as planned' : 'Mark completed'}
      >✓</button>
      <div className="ws-row-main">
        <b style={done ? { textDecoration: 'line-through', color: '#6f6a8a' } : undefined}>{s.topic || 'Study session'}</b>
        <span>{ws.subjectName(s.subject_id) || '—'} · {fmt12(s.start_time)}–{fmt12(s.end_time)} · {fmtDuration(sessionMinutes(s))}{s.goal ? ` · ${s.goal}` : ''}</span>
      </div>
      <span className={`ws-chip ${done ? 'mint' : 'cyan'}`}>{done ? 'Completed' : 'Planned'}</span>
      <button className="ws-icon-btn" onClick={() => ws.remove('sessions', s.id)} title="Delete">✕</button>
    </div>
  );
}
