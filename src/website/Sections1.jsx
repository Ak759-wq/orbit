// Orbit website sections 1–4.
// Everything reads from the persistent website DB (BST seed) and
// recalculates live statuses / countdowns from the current time.

import { useMemo, useState } from 'react';
import { useWebsite } from './WebsiteContext.jsx';
import {
  CalendarDays, CalendarClock, FileText, ClipboardList, Percent, BookOpenCheck,
  Target, BarChart3,
} from 'lucide-react';

const pad = (n) => String(n).padStart(2, '0');
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function fmt12(t) {
  const [h, m] = String(t).split(':').map(Number);
  const mer = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${mer}`;
}

export function minsUntil(timeStr, now = new Date()) {
  const [h, m] = String(timeStr).split(':').map(Number);
  return h * 60 + m - (now.getHours() * 60 + now.getMinutes());
}

export function fmtCountdown(mins) {
  if (mins == null) return '';
  if (mins <= 0) return 'starting now';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return `${h} hr ${m} min`;
}

/* ============================================================
   SECTION 1 — ACADEMIC UNIVERSE
   ============================================================ */
const MODULES = [
  { id: 'ws-schedule', icon: CalendarDays, name: 'Schedule', desc: 'Your weekly timetable with live class status' },
  { id: 'ws-calendar', icon: CalendarClock, name: 'Calendar', desc: 'Exams, holidays and deadlines with countdowns' },
  { id: 'ws-tests', icon: FileText, name: 'Tests & Marks', desc: 'Record scores, see averages and trends' },
  { id: 'ws-assignments', icon: ClipboardList, name: 'Assignments', desc: 'Deadlines sorted by urgency' },
  { id: 'ws-attendance', icon: Percent, name: 'Attendance', desc: 'Live percentages and forecasts' },
  { id: 'ws-planner', icon: BookOpenCheck, name: 'Study Planner', desc: 'Plan sessions, track real hours' },
  { id: 'ws-goals', icon: Target, name: 'Goals', desc: 'Targets that track themselves' },
  { id: 'ws-analytics', icon: BarChart3, name: 'Analytics', desc: 'Your trajectory, from real data' },
];

export function UniverseSection() {
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <section className="ws-sec" id="ws-universe">
      <div className="ws-head-center ws-reveal">
        <span className="ws-kicker">The concept</span>
        <h2 className="ws-h2">Everything you need for college.</h2>
        <p className="ws-lead">
          Orbit brings your classes, tests, assignments, attendance, goals and academic
          progress into one connected system.
        </p>
      </div>
      <div className="ws-modules">
        {MODULES.map((m, i) => {
          const Icon = m.icon;
          return (
            <button key={m.id} className="ws-mod ws-reveal" style={{ ['--rd']: `${i * 0.05}s` }} onClick={() => go(m.id)}>
              <span className="ws-mod-icon"><Icon strokeWidth={2.2} /></span>
              <b>{m.name}</b>
              <span>{m.desc}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================
   SECTION 2 — TODAY'S ACADEMIC COMMAND CENTER
   ============================================================ */
const STATUS_CHIP = {
  ongoing: { cls: 'mint', label: 'Ongoing' },
  upcoming: { cls: 'cyan', label: 'Upcoming' },
  completed: { cls: '', label: 'Completed' },
};

export function TodaySection() {
  const ws = useWebsite();
  const { todayInfo, gaps, now } = ws;
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const next = todayInfo.next;
  const current = todayInfo.current;

  return (
    <section className="ws-sec" id="ws-today">
      <div className="ws-reveal">
        <span className="ws-kicker">Today</span>
        <h2 className="ws-h2">Know exactly what's next.</h2>
        <p className="ws-lead">{dateStr} · statuses update live from your schedule.</p>
      </div>

      <div className="ws-today-grid">
        {/* next class card */}
        <div className="ws-panel ws-panel-pad ws-next-card ws-reveal">
          <span className="ws-date-big">Next class</span>
          {next ? (
            <>
              <p className="ws-next-name">{next.subject}</p>
              <div className="ws-next-meta">
                <span className="ws-chip">{fmt12(next.start_time)}–{fmt12(next.end_time)}</span>
                {next.kind && <span className="ws-chip cyan">{next.kind}</span>}
                {next.room && <span className="ws-chip">{next.room}</span>}
                {next.code && <span className="ws-chip">{next.code}</span>}
              </div>
              <p className="ws-countdown">
                Starts in <b>{fmtCountdown(minsUntil(next.start_time, now))}</b>
              </p>
            </>
          ) : current ? (
            <>
              <p className="ws-next-name">{current.subject}</p>
              <div className="ws-next-meta">
                <span className="ws-chip mint">Ongoing now</span>
                <span className="ws-chip">{fmt12(current.start_time)}–{fmt12(current.end_time)}</span>
                {current.room && <span className="ws-chip">{current.room}</span>}
              </div>
              <p className="ws-countdown">Ends in <b>{fmtCountdown(minsUntil(current.end_time, now))}</b></p>
            </>
          ) : (
            <>
              <p className="ws-next-name">{todayInfo.count ? 'Classes done for today' : 'No classes today'}</p>
              <p className="ws-countdown">{todayInfo.count ? 'All wrapped up 🎉' : 'Enjoy the free day 🌤'}</p>
            </>
          )}
        </div>

        {/* today's classes */}
        <div className="ws-panel ws-panel-pad ws-reveal" style={{ ['--rd']: '0.1s' }}>
          <div className="ws-today-stats">
            <div className="ws-tstat"><b>{todayInfo.count}</b><span>classes today</span></div>
            <div className="ws-tstat"><b>{gaps.freePeriods.length}</b><span>free period{gaps.freePeriods.length === 1 ? '' : 's'}</span></div>
            <div className="ws-tstat"><b>{gaps.lunch ? fmt12(gaps.lunch.start) : '—'}</b><span>lunch break</span></div>
          </div>

          {todayInfo.classes.length === 0 ? (
            <div className="ws-empty">
              <b>No classes scheduled today</b>
              <p>{DAY_NAMES[now.getDay()]}s are free in your timetable. Check the week view for what's coming.</p>
            </div>
          ) : (
            <>
              {todayInfo.classes.map((c) => {
                const st = STATUS_CHIP[c.status] || STATUS_CHIP.upcoming;
                return (
                  <div key={c.id} className={`ws-class-row ${c.status}`}>
                    <span className="ws-class-time">{fmt12(c.start_time)}<br /><span style={{ color: '#6f6a8a' }}>{fmt12(c.end_time)}</span></span>
                    <div className="ws-class-main">
                      <b>{c.subject}</b>
                      <span>{[c.code, c.kind, c.room].filter(Boolean).join(' · ')}</span>
                    </div>
                    {c.status === 'ongoing' && <span className="ws-live-dot" />}
                    <span className={`ws-chip ${st.cls}`}>{st.label}</span>
                  </div>
                );
              })}
              {gaps.freePeriods.map((g, i) => (
                <div key={i} className="ws-free-row">
                  <b>Free · {fmt12(g.start)}–{fmt12(g.end)}</b>
                  <span>{g.minutes} min gap · good for a study session</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   SECTION 3 — WEEKLY CLASS SCHEDULE
   ============================================================ */
export function ScheduleSection() {
  const ws = useWebsite();
  const [view, setView] = useState('today');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [editing, setEditing] = useState(false);
  const todayDow = ws.now.getDay();
  const todayName = DAY_NAMES[todayDow];

  const days = useMemo(() => {
    if (view === 'today') {
      const day = todayDow >= 1 && todayDow <= 5 ? todayDow : null;
      return day
        ? ws.week.filter((d) => d.day === day)
        : [{ day: todayDow, slots: [] }];
    }
    return subjectFilter
      ? ws.week.map((d) => ({ ...d, slots: d.slots.filter((s) => String(s.subject_id) === subjectFilter) }))
      : ws.week;
  }, [view, subjectFilter, ws.week, todayDow]);

  return (
    <section className="ws-sec" id="ws-schedule">
      <div className="ws-reveal">
        <span className="ws-kicker">Weekly timetable</span>
        <h2 className="ws-h2">Your week at a glance.</h2>
        <p className="ws-lead">
          Monday to Friday, from your class schedule — lectures, labs, practicals, contests and activities.
        </p>
      </div>

      <div className="ws-toolbar ws-reveal">
        <div className="ws-seg">
          <button className={view === 'today' ? 'on' : ''} onClick={() => setView('today')}>Today · {todayName}</button>
          <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Full week</button>
        </div>
        <select className="ws-select" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
          <option value="">All subjects</option>
          {ws.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="ws-btn ws-btn-ghost ws-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEditing((v) => !v)}>
          {editing ? 'Close editor' : 'Edit timetable'}
        </button>
      </div>

      {editing && (
        <ScheduleEditor ws={ws} onDone={() => setEditing(false)} />
      )}

      <div className="ws-week-grid ws-reveal" style={{ ['--rd']: '0.08s' }}>
        {days.map(({ day, slots }) => {
          const isToday = day === todayDow;
          const filteredSlots = view === 'today' && subjectFilter
            ? slots.filter((s) => String(s.subject_id) === subjectFilter)
            : slots;
          return (
            <div key={day} className={`ws-day-col ${isToday ? 'ws-day-today' : ''}`}>
              <div className="ws-day-head">
                <b>{DAY_NAMES[day]}{isToday ? ' · today' : ''}</b>
                <span>{filteredSlots.length}</span>
              </div>
              {filteredSlots.length === 0 ? (
                <div className="ws-empty-day">{view === 'today' && !filteredSlots.length ? 'No classes — free day' : '—'}</div>
              ) : filteredSlots.map((c) => {
                const subject = ws.subjects.find((s) => s.id === c.subject_id);
                return (
                  <div key={c.id} className="ws-slot" style={{ ['--ac']: subject?.color || '#a78bfa' }}>
                    <b>{c.subject}</b>
                    <span>{fmt12(c.start_time)}–{fmt12(c.end_time)}</span>
                    <span className="ws-kind">{[c.code, c.kind].filter(Boolean).join(' · ') || 'Class'}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================
   SCHEDULE EDITOR — add / edit / delete timetable slots without
   touching code. Persists to the same schedule table the Today,
   Weekly, Dashboard and Attendance views read from.
   ============================================================ */
const EMPTY_SLOT = { day_of_week: '1', start_time: '09:00', end_time: '10:50', subject: '', code: '', kind: 'Lecture', room: 'Ground Floor, Classroom 5' };
const SLOT_KINDS = ['Lecture', 'Laboratory', 'Lecture/Laboratory', 'Lecture/Tutorial', 'Practical', 'Contest', 'Activity', 'Mentorship', 'Other'];

function ScheduleEditor({ ws, onDone }) {
  const [f, setF] = useState(EMPTY_SLOT);
  const [editId, setEditId] = useState(null);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = (e) => {
    e.preventDefault();
    if (!f.subject.trim()) { setErrors({ subject: 'Subject is required.' }); return; }
    if (!/^\d{2}:\d{2}$/.test(f.start_time) || !/^\d{2}:\d{2}$/.test(f.end_time) || f.end_time <= f.start_time) {
      setErrors({ end_time: 'End time must be after start time.' });
      return;
    }
    setErrors({});
    const rec = { ...f, day_of_week: Number(f.day_of_week) };
    if (editId) ws.update('schedule', editId, rec);
    else ws.insert('schedule', rec);
    setF({ ...EMPTY_SLOT });
    setEditId(null);
  };

  const startEdit = (c) => {
    setEditId(c.id);
    setF({
      day_of_week: String(c.day_of_week),
      start_time: c.start_time,
      end_time: c.end_time,
      subject: c.subject || '',
      code: c.code || '',
      kind: c.kind || 'Lecture',
      room: c.room || '',
    });
    document.getElementById('ws-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cancelEdit = () => { setEditId(null); setF({ ...EMPTY_SLOT }); };

  const days = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="ws-panel ws-panel-pad ws-reveal in" style={{ marginTop: 16 }}>
      <form onSubmit={save}>
        <div className="ws-form-grid">
          <div className="ws-f">
            <label>Subject *</label>
            <input value={f.subject} onChange={set('subject')} placeholder="Exact subject name" list="ws-subject-names" />
            <datalist id="ws-subject-names">
              {ws.subjects.map((s) => <option key={s.id} value={s.name} />)}
            </datalist>
            {errors.subject && <span className="ws-err">{errors.subject}</span>}
          </div>
          <div className="ws-f">
            <label>Day *</label>
            <select value={f.day_of_week} onChange={set('day_of_week')}>
              {days.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
            </select>
          </div>
          <div className="ws-f">
            <label>Type</label>
            <select value={f.kind} onChange={set('kind')}>
              {SLOT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="ws-f">
            <label>Start time *</label>
            <input type="time" value={f.start_time} onChange={set('start_time')} />
          </div>
          <div className="ws-f">
            <label>End time *</label>
            <input type="time" value={f.end_time} onChange={set('end_time')} />
            {errors.end_time && <span className="ws-err">{errors.end_time}</span>}
          </div>
          <div className="ws-f">
            <label>Course code</label>
            <input value={f.code} onChange={set('code')} placeholder="BTBC121" />
          </div>
          <div className="ws-f" style={{ gridColumn: 'span 2' }}>
            <label>Room / location</label>
            <input value={f.room} onChange={set('room')} placeholder="Ground Floor, Classroom 5" />
          </div>
          <div className="ws-f" style={{ justifyContent: 'flex-end' }}>
            <label>&nbsp;</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {editId && <button type="button" className="ws-btn ws-btn-ghost" onClick={cancelEdit}>Cancel</button>}
              <button type="submit" className="ws-btn ws-btn-violet" style={{ justifyContent: 'center' }}>{editId ? 'Save changes' : 'Add class'}</button>
            </div>
          </div>
        </div>
      </form>

      <p style={{ margin: '18px 0 10px', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9a94b8' }}>
        Current timetable — {ws.schedule.length} slot{ws.schedule.length === 1 ? '' : 's'}
      </p>
      {ws.schedule.map((c) => (
        <div key={c.id} className="ws-row">
          <div className="ws-row-main">
            <b>{c.subject}</b>
            <span>{DAY_NAMES[c.day_of_week]} · {fmt12(c.start_time)}–{fmt12(c.end_time)} · {[c.code, c.kind, c.room].filter(Boolean).join(' · ')}</span>
          </div>
          <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => startEdit(c)}>Edit</button>
          <button className="ws-icon-btn" onClick={() => ws.remove('schedule', c.id)} title="Delete">✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="ws-btn ws-btn-ghost ws-btn-sm" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

const EVT_COLOR = {
  exam: 'exam', endsem: 'exam', midsem: 'exam', practical: 'exam',
  holiday: 'holiday', break: 'holiday',
};

export function CalendarSection() {
  const ws = useWebsite();
  const [monthOffset, setMonthOffset] = useState(0);

  const refDate = useMemo(() => {
    const d = new Date(ws.now.getFullYear(), ws.now.getMonth() + monthOffset, 1);
    return d;
  }, [ws.now, monthOffset]);

  const monthLabel = refDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const cells = useMemo(() => {
    const y = refDate.getFullYear();
    const m = refDate.getMonth();
    const first = new Date(y, m, 1);
    const startPad = (first.getDay() + 6) % 7; // Monday start
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < startPad; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
      const evts = ws.events.filter((e) => e.start_date <= iso && e.end_date >= iso);
      out.push({ day: d, iso, evts });
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [refDate, ws.events]);

  return (
    <section className="ws-sec" id="ws-calendar">
      <div className="ws-reveal">
        <span className="ws-kicker">Academic calendar</span>
        <h2 className="ws-h2">Never be surprised by a date.</h2>
        <p className="ws-lead">
          The full 2026–27 academic calendar — assessments, exams, holidays, deadlines and semester dates.
          Countdowns update every day.
        </p>
      </div>

      <div className="ws-cal-grid">
        <div className="ws-panel ws-panel-pad ws-reveal">
          <div className="ws-month-head">
            <span className="ws-month-title">{monthLabel}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ws-nav-btn" onClick={() => setMonthOffset((o) => o - 1)} aria-label="Previous month">‹</button>
              <button className="ws-nav-btn" onClick={() => setMonthOffset((o) => o + 1)} aria-label="Next month">›</button>
            </div>
          </div>
          <div className="ws-cal-dow">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <i key={d}>{d}</i>)}</div>
          <div className="ws-cal-cells">
            {cells.map((c, i) => c === null
              ? <span key={`e${i}`} />
              : (
                <div key={c.iso} className={`ws-cell ${c.iso === ws.today ? 'today' : ''}`}>
                  {c.day}
                  {c.evts.length > 0 && (
                    <span className="ws-cell-evt">
                      {c.evts.slice(0, 3).map((e) => <i key={e.id} className={EVT_COLOR[e.event_type] || ''} title={e.title} />)}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>

        <div className="ws-panel ws-panel-pad ws-reveal" style={{ ['--rd']: '0.1s' }}>
          <div className="ws-evt-row" style={{ border: 'none', padding: '0 0 10px', marginBottom: 4 }}>
            <div className="ws-evt-main"><b style={{ fontSize: 15 }}>Upcoming</b><span>{ws.upcoming.length} events ahead</span></div>
          </div>
          {ws.todaysEvents.map((e) => (
            <div key={`t${e.id}`} className="ws-evt-row">
              <div className="ws-evt-date">
                <b>•</b>
                <span>Today</span>
              </div>
              <div className="ws-evt-main">
                <b>{e.title}</b>
                <span>{e.event_type.replace('_', ' ')}</span>
              </div>
              <span className="ws-chip mint">Today</span>
            </div>
          ))}
          {ws.upcoming.filter((e) => !(e.start_date <= ws.today && e.end_date >= ws.today)).slice(0, 8).map((e) => {
            const d = new Date(e.start_date + 'T00:00:00');
            return (
              <div key={e.id} className="ws-evt-row">
                <div className="ws-evt-date">
                  <b>{d.getDate()}</b>
                  <span>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                </div>
                <div className="ws-evt-main">
                  <b>{e.title}</b>
                  <span>{e.event_type.replace('_', ' ')}{e.start_date !== e.end_date ? ` → ${ws.fmt(e.end_date)}` : ''}</span>
                </div>
                <span className={`ws-chip ${e.daysRemaining === 0 ? 'mint' : e.daysRemaining <= 7 ? 'cyan' : ''}`}>
                  {e.daysRemaining === 0 ? 'Today' : e.daysRemaining === 1 ? 'Tomorrow' : `${e.daysRemaining} days`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
