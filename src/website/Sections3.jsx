// Orbit website sections 9–13: Goals, Analytics, Notes & Resources,
// AI Assistant (grounded in the website DB), Final CTA.

import { useEffect, useRef, useState } from 'react';
import { validateGoal, validateResource } from '../lib/validate.js';
import { GOAL_TYPES, RESOURCE_TYPES, labelOf } from '../lib/constants.js';
import { testPercentage, sessionMinutes } from '../lib/calc.js';
import { fmtDuration } from '../lib/datetime.js';
import { useWebsite } from './WebsiteContext.jsx';
import { fmt12 } from './Sections1.jsx';
import { Trend } from './Sections2.jsx';

/* ============================================================
   SECTION 9 — GOALS
   ============================================================ */
const EMPTY_G = { name: '', goal_type: 'manual', subject_id: '', target_value: '', current_value: '', deadline: '' };

export function GoalsSection() {
  const ws = useWebsite();
  const [f, setF] = useState(EMPTY_G);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = (e) => {
    e.preventDefault();
    const rec = {
      ...f,
      subject_id: f.subject_id ? Number(f.subject_id) : null,
      target_value: f.target_value === '' ? '' : Number(f.target_value),
      current_value: f.current_value === '' ? 0 : Number(f.current_value),
    };
    const { ok, errors } = validateGoal(rec);
    setErrors(errors);
    if (!ok) return;
    ws.insert('goals', { ...rec, start_date: ws.today });
    setF({ ...EMPTY_G });
  };

  const bump = (g, delta) => ws.update('goals', g.id, { current_value: Math.max(0, Number(g.current_value) + delta) });

  return (
    <section className="ws-sec" id="ws-goals">
      <div className="ws-reveal">
        <span className="ws-kicker">Goals</span>
        <h2 className="ws-h2">Know what you're working toward.</h2>
        <p className="ws-lead">
          Attendance goals track your live attendance automatically, average goals follow your
          test scores, and manual goals get simple +/− controls.
        </p>
      </div>

      <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 30 }}>
        <form onSubmit={save}>
          <div className="ws-form-grid">
            <div className="ws-f" style={{ gridColumn: 'span 2' }}>
              <label>Goal name *</label>
              <input value={f.name} onChange={set('name')} placeholder="Score 85% in Java" />
              {errors.name && <span className="ws-err">{errors.name}</span>}
            </div>
            <Field label="Goal type" error={errors.goal_type}>
              <select value={f.goal_type} onChange={set('goal_type')}>
                {GOAL_TYPES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </Field>
            <Field label="Subject (optional)">
              <select value={f.subject_id ?? ''} onChange={set('subject_id')}>
                <option value="">None</option>
                {ws.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Target value *" error={errors.target_value}>
              <input type="number" step="any" min="1" value={f.target_value} onChange={set('target_value')} placeholder="85" />
            </Field>
            <Field label="Current value" error={errors.current_value}>
              <input type="number" step="any" min="0" value={f.current_value} onChange={set('current_value')} disabled={f.goal_type !== 'manual'} placeholder={f.goal_type === 'manual' ? '23' : 'Auto from your data'} />
            </Field>
            <Field label="Deadline">
              <input type="date" value={f.deadline} onChange={set('deadline')} />
            </Field>
          </div>
          <button type="submit" className="ws-btn ws-btn-violet" style={{ marginTop: 14 }}>Add goal</button>
        </form>
      </div>

      {ws.goalsLive.length > 0 ? (
        <div className="ws-goal-grid">
          {ws.goalsLive.map((g) => (
            <div key={g.id} className="ws-panel ws-panel-pad ws-goal ws-reveal">
              <div className="ws-goal-top">
                <div>
                  <b>{g.name}</b>
                  <p className="ws-goal-meta">
                    {labelOf(GOAL_TYPES, g.goal_type)}{g.subject_id && ws.subjectName(g.subject_id) ? ` · ${ws.subjectName(g.subject_id)}` : ''}
                    {g.deadline ? ` · by ${ws.fmt(g.deadline)}` : ''}
                  </p>
                </div>
                <span className={`ws-chip ${g.status === 'achieved' ? 'mint' : 'cyan'}`}>{g.status === 'achieved' ? 'Achieved 🎉' : `${g.progress ?? 0}%`}</span>
                <button className="ws-icon-btn" onClick={() => ws.remove('goals', g.id)} title="Delete">✕</button>
              </div>
              <div className="ws-goal-nums">
                <b>{Math.round(Number(g.live_current) * 10) / 10}</b>
                <span>/ {g.target_value}</span>
              </div>
              <div className="ws-bar"><div style={{ width: `${Math.min(g.progress ?? 0, 100)}%`, background: g.status === 'achieved' ? 'linear-gradient(90deg,#6ee7b7,#6ee7b7)' : undefined }} /></div>
              {g.goal_type === 'manual' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => bump(g, -1)}>−1</button>
                  <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => bump(g, 1)}>+1</button>
                  <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => bump(g, 5)}>+5</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="ws-empty ws-reveal" style={{ marginTop: 26 }}>
          <b>No goals set yet.</b>
          <p>Try "Maintain 85% attendance" (tracks automatically) or "Complete 50 DSA problems" (manual with +1/+5 buttons).</p>
        </div>
      )}
    </section>
  );
}

function Field({ label, error, children }) {
  return (
    <div className="ws-f">
      <label>{label}</label>
      {children}
      {error && <span className="ws-err">{error}</span>}
    </div>
  );
}

/* ============================================================
   SECTION 10 — ACADEMIC ANALYTICS
   ============================================================ */
export function AnalyticsSection() {
  const ws = useWebsite();
  const o = ws.overall;

  // previous test vs latest test per subject (real comparison)
  const comparisons = ws.subjectStats.filter((r) => r.trend);

  // week-over-week assignment completion
  const thisWeekDone = ws.assignments.filter((a) => a.status === 'completed' && a.due_date >= ws.weekStart && a.due_date <= ws.weekEnd).length;
  const lastWeekDone = ws.assignments.filter((a) => a.status === 'completed' && a.due_date >= addDaysIso(ws.weekStart, -7) && a.due_date <= addDaysIso(ws.weekStart, -1)).length;
  // real last-week study minutes (completed sessions dated in the previous week)
  const lastWeekStudyDone = ws.sessions
    .filter((s) => s.status === 'completed' && s.session_date >= addDaysIso(ws.weekStart, -7) && s.session_date <= addDaysIso(ws.weekStart, -1))
    .reduce((n, s) => n + sessionMinutes(s), 0);

  const hasAnyData = o.total > 0 || ws.assignStats.total > 0 || ws.overallAtt.total > 0 || ws.study.plannedMinutes > 0;

  return (
    <section className="ws-sec" id="ws-analytics">
      <div className="ws-reveal">
        <span className="ws-kicker">Analytics</span>
        <h2 className="ws-h2">See your academic trajectory.</h2>
        <p className="ws-lead">Every number here is computed from your own records — averages, trends and completion. No estimates, no filler.</p>
      </div>

      {!hasAnyData ? (
        <div className="ws-empty ws-reveal" style={{ marginTop: 32 }}>
          <b>Not enough data yet.</b>
          <p>Add a few test scores, mark some attendance, or log a study session — analytics build themselves from whatever you record. Nothing is invented in the meantime.</p>
        </div>
      ) : (
        <>
          <div className="ws-stats ws-reveal">
            <div className="ws-stat"><em>Test average</em><b>{o.avgPct != null ? `${o.avgPct}%` : '—'}</b></div>
            <div className="ws-stat"><em>Attendance</em><b>{ws.overallAtt.pct != null ? `${ws.overallAtt.pct}%` : '—'}</b></div>
            <div className="ws-stat"><em>Assignment completion</em><b>{ws.assignStats.completionPct != null ? `${ws.assignStats.completionPct}%` : '—'}</b></div>
            <div className="ws-stat"><em>Study hours</em><b>{fmtDuration(ws.study.completedMinutes) || '0m'}</b></div>
            <div className="ws-stat"><em>Goals on track</em><b>{ws.goalsLive.filter((g) => (g.progress ?? 0) >= 50).length}/{ws.goalsLive.length || 0}</b></div>
          </div>

          {o.total > 0 && (
            <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#67e8f9' }}>Subject performance over time</p>
              <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#9a94b8' }}>Each bar is a graded test in chronological order. Height = percentage.</p>
              {ws.subjectStats.map((r) => {
                const tests = ws.tests
                  .filter((t) => t.subject_id === r.subject.id && t.marks_obtained != null)
                  .sort((a, b) => (a.test_date < b.test_date ? -1 : 1));
                const pcts = tests.map((t) => testPercentage(t)).filter((p) => p != null);
                const max = Math.max(...pcts, 100);
                return (
                  <div key={r.subject.id} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <b style={{ fontSize: 13.5, color: '#fff' }}>{r.name}</b>
                      <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#9a94b8', fontWeight: 700 }}>avg {r.avgPct}%</span>
                        <Trend trend={r.trend} />
                      </span>
                    </div>
                    <div className="ws-bars" style={{ height: 64 }}>
                      {pcts.map((p, i) => (
                        <div key={i} style={{ height: `${(p / max) * 100}%` }} title={`${tests[i].name}: ${p}%`} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {comparisons.length > 0 && (
            <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#67e8f9' }}>Previous test vs latest</p>
              {comparisons.map((r) => (
                <div key={r.subject.id} className="ws-row">
                  <div className="ws-row-main">
                    <b>{r.name}</b>
                    <span>First test {r.trend.from}% → latest {r.trend.to}% ({r.count} graded)</span>
                  </div>
                  <Trend trend={r.trend} />
                </div>
              ))}
            </div>
          )}

          {(ws.assignStats.total > 0 || ws.study.plannedMinutes > 0) && (
            <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#67e8f9' }}>This week vs last week</p>
              <div className="ws-row">
                <div className="ws-row-main"><b>Assignments completed</b><span>{thisWeekDone} this week · {lastWeekDone} last week</span></div>
                <Trend trend={trendFrom(thisWeekDone, lastWeekDone)} />
              </div>
              <div className="ws-row">
                <div className="ws-row-main"><b>Study time</b><span>{fmtDuration(ws.study.weeklyMinutes)} planned this week · {fmtDuration(ws.study.weeklyCompletedMinutes)} done</span></div>
                <Trend trend={trendFrom(ws.study.weeklyCompletedMinutes, lastWeekStudyDone)} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function trendFrom(a, b) {
  const delta = Math.round((a - b) * 10) / 10;
  if (delta > 0) return { direction: 'improving', delta };
  if (delta < 0) return { direction: 'declining', delta };
  return { direction: 'stable', delta: 0 };
}

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ============================================================
   SECTION 11 — NOTES & RESOURCES
   ============================================================ */
const EMPTY_R = { title: '', resource_type: 'note', subject_id: '', url: '', content: '', description: '' };

export function ResourcesSection() {
  const ws = useWebsite();
  const [f, setF] = useState(EMPTY_R);
  const [errors, setErrors] = useState({});
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('');
  const [subjF, setSubjF] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = (e) => {
    e.preventDefault();
    const rec = { ...f, subject_id: f.subject_id ? Number(f.subject_id) : null };
    const { ok, errors } = validateResource(rec);
    setErrors(errors);
    if (!ok) return;
    ws.insert('resources', rec);
    setF({ ...EMPTY_R });
  };

  const filtered = ws.resources.filter((r) => {
    if (typeF && r.resource_type !== typeF) return false;
    if (subjF && String(r.subject_id) !== subjF) return false;
    if (q) {
      const hay = `${r.title} ${r.description || ''} ${r.content || ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <section className="ws-sec" id="ws-resources">
      <div className="ws-reveal">
        <span className="ws-kicker">Notes & Resources</span>
        <h2 className="ws-h2">Your academic library.</h2>
        <p className="ws-lead">Notes, links, documents, videos and practice sets — organized by subject, searchable anytime.</p>
      </div>

      <div className="ws-panel ws-panel-pad ws-reveal" style={{ marginTop: 30 }}>
        <form onSubmit={save}>
          <div className="ws-form-grid">
            <Field label="Title *" error={errors.title}>
              <input value={f.title} onChange={set('title')} placeholder="Java collections cheat sheet" />
            </Field>
            <Field label="Type">
              <select value={f.resource_type} onChange={set('resource_type')}>
                {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Subject">
              <select value={f.subject_id ?? ''} onChange={set('subject_id')}>
                <option value="">None</option>
                {ws.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {f.resource_type !== 'note' && (
              <Field label="URL *" error={errors.url}>
                <input value={f.url} onChange={set('url')} placeholder="https://…" />
              </Field>
            )}
            {f.resource_type === 'note' && (
              <Field label="Note content" span>
                <textarea rows={2} value={f.content} onChange={set('content')} placeholder="Write or paste your notes…" />
              </Field>
            )}
          </div>
          <button type="submit" className="ws-btn ws-btn-violet" style={{ marginTop: 14 }}>Add resource</button>
        </form>
      </div>

      <div className="ws-res-filters ws-reveal">
        <input className="ws-select" style={{ minWidth: 200 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search resources…" />
        <select className="ws-select" value={typeF} onChange={(e) => setTypeF(e.target.value)}>
          <option value="">All types</option>
          {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="ws-select" value={subjF} onChange={(e) => setSubjF(e.target.value)}>
          <option value="">All subjects</option>
          {ws.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="ws-res-grid ws-reveal" style={{ marginTop: 18 }}>
          {filtered.map((r) => (
            <div key={r.id} className="ws-panel ws-panel-pad ws-res">
              <div className="ws-res-top">
                <b>{r.title}</b>
                <button className="ws-icon-btn" onClick={() => ws.remove('resources', r.id)} title="Delete">✕</button>
              </div>
              <span className="ws-chip cyan">{labelOf(RESOURCE_TYPES, r.resource_type)}{r.subject_id && ws.subjectName(r.subject_id) ? ` · ${ws.subjectName(r.subject_id)}` : ''}</span>
              {r.description && <p>{r.description}</p>}
              {r.content && <p style={{ borderLeft: '2px solid rgba(139,92,246,0.4)', paddingLeft: 10 }}>{r.content}</p>}
              {r.url && <a href={r.url} target="_blank" rel="noreferrer">{r.url.length > 48 ? `${r.url.slice(0, 48)}…` : r.url} ↗</a>}
            </div>
          ))}
        </div>
      ) : (
        <div className="ws-empty ws-reveal" style={{ marginTop: 24 }}>
          <b>{ws.resources.length === 0 ? 'No resources yet.' : 'No matches.'}</b>
          <p>{ws.resources.length === 0 ? 'Save lecture notes, useful links and videos here so they are one search away during exam week.' : 'Try a different search term or clear the filters.'}</p>
        </div>
      )}
    </section>
  );
}

/* ============================================================
   SECTION 12 — AI ACADEMIC ASSISTANT (grounded, local)
   ============================================================ */
const SUGGESTIONS = [
  'What classes do I have tomorrow?',
  'What assignments are due this week?',
  'What is my Java average?',
  'Which subject am I performing lowest in?',
  'What test is coming next?',
  'How much attendance do I have?',
  'Summarize my academic performance.',
];

export function AISection() {
  return (
    <section className="ws-sec" id="ws-ai">
      <div className="ws-head-center ws-reveal">
        <span className="ws-kicker" style={{ justifyContent: 'center' }}>AI Assistant</span>
        <h2 className="ws-h2">Ask your academic universe.</h2>
        <p className="ws-lead">
          The assistant reads your actual schedule, marks, attendance and deadlines before
          answering. If something is not in your data, it says so — it never invents records.
        </p>
      </div>
      <div className="ws-ai-grid">
        <div className="ws-panel ws-panel-pad ws-reveal">
          <AIChat />
        </div>
        <div className="ws-reveal" style={{ ['--rd']: '0.1s' }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9a94b8' }}>Try asking</p>
          <div className="ws-sugg">
            {SUGGESTIONS.map((s) => <SuggButton key={s} text={s} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

// tiny event bus so suggestion buttons can drive the chat
const aiBus = { fn: null };
function SuggButton({ text }) {
  return (
    <button onClick={() => aiBus.fn?.(text)}>{text}</button>
  );
}

function AIChat() {
  const ws = useWebsite();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatRef, setChatRef] = useState(null);
  const answerRef = useRef(null);

  // Grounded answer — rebuilt every render so it always reads the
  // latest DB state; the ref lets the delayed reply use the newest copy.
  const answer = (question) => {
    const q = question.toLowerCase();
    const S = ws.subjects;
    const findSubj = () => S.find((s) => {
      const tokens = s.name.toLowerCase().split(/[\s-]+/).filter((t) => t.length >= 4);
      return tokens.some((t) => q.includes(t)) || (s.code && q.includes(s.code.toLowerCase()));
    });

    // --- tomorrow's classes ---
    if (q.includes('tomorrow') && (q.includes('class') || q.includes('schedule'))) {
      const dow = (ws.now.getDay() + 1) % 7;
      if (dow === 0 || dow === 6) return `Tomorrow is ${dow === 0 ? 'Sunday' : 'Saturday'} — no classes are scheduled. Your timetable runs Monday to Friday.`;
      const slots = ws.schedule.filter((c) => c.day_of_week === dow).sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
      if (!slots.length) return 'No classes found for tomorrow in your schedule.';
      const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow];
      return `Tomorrow (${day}) you have ${slots.length} class${slots.length > 1 ? 'es' : ''}:\n${slots.map((c) => `• ${fmt12(c.start_time)}–${fmt12(c.end_time)} — ${c.subject}${c.code ? ` (${c.code})` : ''}${c.kind ? `, ${c.kind}` : ''}`).join('\n')}`;
    }

    // --- today's classes ---
    if ((q.includes('class') || q.includes('schedule')) && (q.includes('today') || q.includes('now') || q.includes('next'))) {
      const { classes, next, current } = ws.todayInfo;
      if (!classes.length) return 'No classes are scheduled for today in your timetable.';
      const lines = classes.map((c) => `• ${fmt12(c.start_time)}–${fmt12(c.end_time)} — ${c.subject} [${c.status}]`);
      let head = '';
      if (current) head = `Right now: ${current.subject} (until ${fmt12(current.end_time)}). `;
      else if (next) head = `Next: ${next.subject} at ${fmt12(next.start_time)}. `;
      return `${head}Today's schedule:\n${lines.join('\n')}`;
    }

    // --- assignments due ---
    if (q.includes('assignment') || q.includes('due') || q.includes('deadline')) {
      const open = ws.assignments.filter((a) => a.status !== 'completed');
      if (q.includes('week')) {
        const wk = open.filter((a) => a.due_date >= ws.today && a.due_date <= ws.weekEnd);
        const od = open.filter((a) => a.due_date < ws.today);
        if (!wk.length && !od.length) return 'No assignments are due this week, and nothing is overdue. Add assignments in the Assignments section and they will show up here.';
        const parts = [];
        if (od.length) parts.push(`Overdue: ${od.map((a) => a.title).join(', ')}`);
        if (wk.length) parts.push(`This week: ${wk.map((a) => `${a.title} (due ${ws.fmt(a.due_date)})`).join(', ')}`);
        return parts.join('\n');
      }
      if (!open.length) return ws.assignments.length ? 'All assignments are completed. 🎉' : 'No assignments have been added yet.';
      return `You have ${open.length} open assignment${open.length > 1 ? 's' : ''}:\n${open.slice(0, 8).map((a) => `• ${a.title} — ${ws.subjectName(a.subject_id) || '—'}, due ${ws.fmt(a.due_date)}${a.due_date < ws.today ? ' (OVERDUE)' : ''}`).join('\n')}`;
    }

    // --- subject average ---
    const subj = findSubj();
    if (subj && (q.includes('average') || q.includes('score') || q.includes('perform'))) {
      const stats = ws.subjectStats.find((r) => r.subject.id === subj.id);
      if (!stats || !stats.count) return `No test marks recorded for ${subj.name} yet. Add a test in the Tests & Marks section and I can compute the average.`;
      let out = `${subj.name}: ${stats.count} graded test${stats.count > 1 ? 's' : ''}, average ${stats.avgPct}%. Highest ${stats.highest}%, latest ${stats.latestPct}%.`;
      if (stats.trend) out += ` Trend: ${stats.trend.direction} (${stats.trend.from}% → ${stats.trend.to}%, ${stats.trend.delta > 0 ? '+' : ''}${stats.trend.delta} points).`;
      return out;
    }

    // --- lowest subject ---
    if (q.includes('lowest') || q.includes('weakest') || q.includes('worst')) {
      if (!ws.subjectStats.length) return 'No test data yet — add test marks first and I will rank your subjects.';
      const worst = [...ws.subjectStats].sort((a, b) => (a.avgPct ?? 0) - (b.avgPct ?? 0))[0];
      return `Your lowest subject by test average is ${worst.name} at ${worst.avgPct}% across ${worst.count} test${worst.count > 1 ? 's' : ''}.${worst.trend ? ` Trend: ${worst.trend.direction} (${worst.trend.from}% → ${worst.trend.to}%).` : ''}`;
    }

    // --- next test ---
    if (q.includes('test') && (q.includes('next') || q.includes('coming') || q.includes('upcoming'))) {
      const upcoming = ws.tests.filter((t) => t.test_date >= ws.today && t.marks_obtained == null).sort((a, b) => (a.test_date < b.test_date ? -1 : 1));
      if (!upcoming.length) return ws.tests.length ? 'No ungraded upcoming tests — everything recorded has been taken.' : 'No tests added yet. Add one in Tests & Marks.';
      const t = upcoming[0];
      const days = Math.round((new Date(t.test_date) - new Date(ws.today)) / 86400000);
      return `Next test: ${t.name} (${ws.subjectName(t.subject_id) || '—'}) on ${ws.fmt(t.test_date)} — ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} remaining`}.`;
    }

    // --- attendance ---
    if (q.includes('attendance') || q.includes('absent') || q.includes('miss')) {
      if (!ws.overallAtt.total) return 'No attendance marked yet. Use the Present/Absent buttons in the Attendance section.';
      const subj = findSubj();
      if (subj) {
        const s = ws.subjectAttendance.find((r) => r.subjectId === subj.id);
        if (s && s.total) return `${subj.name}: attended ${s.present} of ${s.total} classes (${s.pct}%), missed ${s.absent}.`;
      }
      let out = `Overall attendance: ${ws.overallAtt.pct}% (${ws.overallAtt.present}/${ws.overallAtt.total} classes, ${ws.overallAtt.absent} missed).`;
      const per = ws.subjectAttendance.filter((s) => s.total > 0).map((s) => `${s.name}: ${s.pct}%`).join(' · ');
      if (per) out += `\nBy subject — ${per}`;
      return out;
    }

    // --- study plan ---
    if (q.includes('plan') || q.includes('study')) {
      const target = subj || (ws.subjectStats.length ? [...ws.subjectStats].sort((a, b) => (a.avgPct ?? 100) - (b.avgPct ?? 100))[0].subject : null);
      if (!target) return 'Add subjects and tests first, then I can suggest a study plan based on your real averages.';
      const stats = ws.subjectStats.find((r) => r.subject.id === target.id);
      const freePeriods = ws.gaps.freePeriods;
      const lines = [`Study plan focus: ${target.name}${stats?.avgPct != null ? ` (current average ${stats.avgPct}%)` : ''}.`,
        freePeriods.length
          ? `Use your free periods: ${freePeriods.map((g) => `${fmt12(g.start)}–${fmt12(g.end)} (${g.minutes} min)`).join(', ')}.`
          : 'No free periods today — plan a session after classes (your planner supports custom times).',
        'Schedule 2 sessions in the Study Planner below with a concrete goal each (e.g. "solve 10 problems").',
      ];
      if (stats?.trend?.direction === 'declining') lines.push('Your trend there is declining — prioritize it over stronger subjects.');
      return lines.join('\n');
    }

    // --- summary ---
    if (q.includes('summar') || q.includes('performance') || q.includes('how am i doing')) {
      const parts = [];
      if (ws.overallAtt.total) parts.push(`Attendance ${ws.overallAtt.pct}% (${ws.overallAtt.present}/${ws.overallAtt.total}).`);
      if (ws.overall.total) parts.push(`Test average ${ws.overall.avgPct}% across ${ws.overall.total} graded tests.`);
      if (ws.assignStats.total) parts.push(`Assignments: ${ws.assignStats.completed}/${ws.assignStats.total} done${ws.assignStats.overdue ? `, ${ws.assignStats.overdue} overdue` : ''}.`);
      if (ws.study.plannedMinutes) parts.push(`Study time: ${fmtDuration(ws.study.completedMinutes)} completed of ${fmtDuration(ws.study.plannedMinutes)} planned.`);
      if (ws.upcoming.length) parts.push(`Next event: ${ws.upcoming[0].title} — ${ws.upcoming[0].daysRemaining === 0 ? 'today' : `${ws.upcoming[0].daysRemaining} days remaining`}.`);
      if (!parts.length) return 'There is nothing to summarize yet — no attendance, tests, assignments or study time recorded. Start by marking today\'s attendance or adding a test.';
      return parts.join(' ');
    }

    return 'I can answer from your real data — try: "What classes do I have tomorrow?", "What is my Java average?", "Which subject am I performing lowest in?", "What assignments are due this week?", "How much attendance do I have?" or "Summarize my academic performance."';
  };

  // Latest closure each render so answers always read current DB state.
  useEffect(() => {
    answerRef.current = answer;
  });

  const ask = (text) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    setBusy(true);
    // grounded answer, computed from the live DB (slight delay = reading feel)
    setTimeout(() => {
      setMessages((m) => [...m, { role: 'ai', text: answerRef.current(question) }]);
      setBusy(false);
    }, 450);
  };

  // Suggestion buttons drive the chat through the tiny bus.
  useEffect(() => {
    aiBus.fn = ask;
    return () => { aiBus.fn = null; };
  });

  // Keep the newest message in view.
  useEffect(() => {
    if (chatRef) chatRef.scrollTop = chatRef.scrollHeight;
  }, [messages, busy, chatRef]);

  return (
    <>
      <div className="ws-chat-box" ref={setChatRef}>
        {messages.length === 0 && (
          <div className="ws-msg ai">Hi! Ask me anything about your schedule, marks, attendance, deadlines or study plan — I only answer from your Orbit data.</div>
        )}
        {messages.map((m, i) => <div key={i} className={`ws-msg ${m.role}`}>{m.text}</div>)}
        {busy && <div className="ws-msg ai">Checking your data…</div>}
      </div>
      <div className="ws-input-row">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder="Ask about your academic data…" />
        <button className="ws-btn ws-btn-violet" onClick={() => ask()}>Ask</button>
      </div>
    </>
  );
}

/* ============================================================
   SECTION 13 — FINAL CTA
   ============================================================ */
export function FinalCTASection({ onGetStarted }) {
  return (
    <section className="ws-final">
      <div className="ws-final-glow" />
      <div className="ws-sec-head ws-head-center ws-reveal" style={{ position: 'relative', zIndex: 2 }}>
        <h2 className="ws-h2">Your academic universe starts here.</h2>
        <p className="ws-lead" style={{ margin: '16px auto 0' }}>
          One place for your classes, progress, deadlines and goals.
        </p>
        <div className="ws-cta-row" style={{ justifyContent: 'center', marginTop: 28 }}>
          <button className="ob-btn ob-btn-white" onClick={onGetStarted}>Get started →</button>
        </div>
      </div>
    </section>
  );
}
