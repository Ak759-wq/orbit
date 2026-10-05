import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, BookOpenCheck, Clock, Timer, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader, Modal, Field, ConfirmDialog, TabBar } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitSection, OrbitEmptyState, OrbitBadge, OrbitStat, OrbitProgress } from '../orbit/Orbit.jsx';
import { validateSession } from '../../lib/validate.js';
import { SESSION_STATUSES, labelOf } from '../../lib/constants.js';
import { todayISO, fmtTime12, fmtDate, fmtDuration } from '../../lib/datetime.js';
import { sessionMinutes } from '../../lib/calc.js';

const EMPTY = { subject_id: '', topic: '', session_date: todayISO(), start_time: '17:00', end_time: '18:30', goal: '', status: 'planned', notes: '' };

const STATUS_TONE = { planned: 'neutral', in_progress: 'orange', completed: 'green' };

export default function Planner() {
  const { data, analytics, insertRow, updateRow, deleteRow, today } = useApp();
  const subjects = data?.subjects ?? [];
  const sessions = data?.sessions ?? [];
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [tab, setTab] = useState('today');
  const [errors, setErrors] = useState({});

  const subjName = (id) => subjects.find((s) => s.id === id)?.name || 'General';
  const subjColor = (id) => subjects.find((s) => s.id === id)?.color || '#94a3b8';

  const filtered = useMemo(() => {
    let list = [...sessions];
    if (tab === 'today') list = list.filter((s) => s.session_date === today);
    if (tab === 'upcoming') list = list.filter((s) => s.session_date > today);
    if (tab === 'past') list = list.filter((s) => s.session_date < today);
    return list.sort((a, b) => (a.session_date + a.start_time < b.session_date + b.start_time ? -1 : 1));
  }, [sessions, tab, today]);

  const save = async (e) => {
    e.preventDefault();
    const rec = { ...editing, subject_id: editing.subject_id ? Number(editing.subject_id) : '' };
    const { ok, errors: errs } = validateSession(rec);
    setErrors(errs);
    if (!ok) return;
    const row = { ...rec };
    delete row.id;
    if (editing.id) await updateRow('study_sessions', editing.id, row);
    else await insertRow('study_sessions', row);
    setEditing(null);
    setErrors({});
  };

  const cycle = async (s) => {
    const next = s.status === 'planned' ? 'in_progress' : s.status === 'in_progress' ? 'completed' : 'planned';
    await updateRow('study_sessions', s.id, { status: next });
  };

  const openEditor = (s) => { setEditing(s ? { ...s } : { ...EMPTY }); setErrors({}); };

  const study = analytics?.study;
  const bySubject = study?.bySubject ?? [];
  const todaySessions = filtered.length && tab === 'today' ? filtered : (analytics?.todaySessions ?? []);
  const todayDone = todaySessions.filter((s) => s.status === 'completed').length;
  const todayPlannedMin = todaySessions.reduce((n, s) => n + sessionMinutes(s), 0);
  const todayDoneMin = todaySessions.filter((s) => s.status === 'completed').reduce((n, s) => n + sessionMinutes(s), 0);
  const todayPct = todayPlannedMin ? Math.round((todayDoneMin / todayPlannedMin) * 100) : 0;
  const maxSubjectMinutes = bySubject[0]?.minutes || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="STUDY PLANNER"
        title="Study Planner"
        sub="Plan sessions, track what you actually completed."
        actions={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Plan session</OrbitButton>}
      />

      {!sessions.length ? (
        <OrbitCard>
          <OrbitEmptyState
            icon={BookOpenCheck}
            title="No study sessions planned"
            sub="Plan focused sessions per subject. Completed hours feed the weekly summary and goals."
            action={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Plan your first session</OrbitButton>}
          />
        </OrbitCard>
      ) : (
        <>
          {/* ---- Today's plan ---- */}
          <OrbitSection
            icon={CalendarDays}
            tone="purple"
            title="Today's plan"
            sub={todaySessions.length ? `${todayDone} of ${todaySessions.length} sessions done` : 'Nothing scheduled for today'}
            action={
              todayPlannedMin > 0 && (
                <span className="text-[12px] font-bold text-orbit-text-soft">{fmtDuration(todayDoneMin)} / {fmtDuration(todayPlannedMin)}</span>
              )
            }
          >
            {todayPlannedMin > 0 && (
              <div className="mb-3.5">
                <OrbitProgress value={todayPct} tone="#8b5cf6" size="sm" />
                <p className="text-[11.5px] text-orbit-text-mute mt-1.5">{todayPct}% of today's planned study time completed</p>
              </div>
            )}
            {todaySessions.length === 0 ? (
              <OrbitEmptyState icon={BookOpenCheck} title="No sessions planned for today." sub="Use the free time to plan tomorrow's study blocks." compact />
            ) : (
              <SessionList sessions={todaySessions} subjName={subjName} subjColor={subjColor} onCycle={cycle} onEdit={openEditor} onDelete={setConfirmDelete} today={today} />
            )}
          </OrbitSection>

          {/* ---- Stats ---- */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
            <OrbitStat icon={Clock} tone="blue" value={fmtDuration(study?.plannedMinutes ?? 0)} label="Planned" sub="All sessions" />
            <OrbitStat icon={CheckCircle2} tone="green" value={fmtDuration(study?.completedMinutes ?? 0)} label="Completed" sub={`${study?.completionPct ?? 0}% of planned`} />
            <OrbitStat icon={Timer} tone="purple" value={fmtDuration(study?.weeklyMinutes ?? 0)} label="This week" sub={`${fmtDuration(study?.weeklyCompletedMinutes ?? 0)} done`} />
            <OrbitStat icon={CalendarDays} tone="orange" value={String(todaySessions.length)} label="Today" sub="sessions scheduled" />
          </div>

          {/* ---- Subject allocation ---- */}
          {bySubject.length > 0 && (
            <OrbitSection icon={BookOpenCheck} tone="blue" title="Subject allocation" sub="Where your study time is actually going.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
                {bySubject.map((b) => {
                  const subject = subjects.find((s) => s.id === b.subjectId);
                  return (
                    <div key={b.subjectId}>
                      <div className="flex justify-between text-[12.5px] font-bold mb-1.5">
                        <span className="truncate">{subject?.name || 'General'}</span>
                        <span className="text-orbit-text-mute shrink-0 ml-2">{fmtDuration(b.minutes)} <span className="font-semibold">({fmtDuration(b.completedMinutes)} done)</span></span>
                      </div>
                      <OrbitProgress value={(b.minutes / maxSubjectMinutes) * 100} tone={subject?.color || '#94a3b8'} size="sm" />
                    </div>
                  );
                })}
              </div>
            </OrbitSection>
          )}

          {/* ---- Upcoming sessions ---- */}
          <div>
            <TabBar tabs={[{ value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]} active={tab} onChange={setTab} />
            {tab === 'today' ? (
              <OrbitCard>
                {filtered.length === 0 ? (
                  <OrbitEmptyState icon={BookOpenCheck} title="Nothing scheduled today" sub="No study sessions on this date." compact />
                ) : (
                  <SessionList sessions={filtered} subjName={subjName} subjColor={subjColor} onCycle={cycle} onEdit={openEditor} onDelete={setConfirmDelete} today={today} />
                )}
              </OrbitCard>
            ) : (
              <OrbitCard>
                {filtered.length === 0 ? (
                  <OrbitEmptyState icon={BookOpenCheck} title="Nothing here" sub="No sessions in this view." compact />
                ) : (
                  <SessionList sessions={filtered} subjName={subjName} subjColor={subjColor} onCycle={cycle} onEdit={openEditor} onDelete={setConfirmDelete} today={today} />
                )}
              </OrbitCard>
            )}
          </div>
        </>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit session' : 'Plan session'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Subject *" error={errors.subject_id}>
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.subject_id ?? ''} onChange={(e) => setEditing({ ...editing, subject_id: e.target.value })}>
                  <option value="">Select…</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Topic">
                <input className="or-input w-full px-3 py-2 text-sm" value={editing.topic || ''} onChange={(e) => setEditing({ ...editing, topic: e.target.value })} placeholder="Collections revision" />
              </Field>
              <Field label="Date *" error={errors.session_date}>
                <input type="date" className="or-input w-full px-3 py-2 text-sm" value={editing.session_date} onChange={(e) => setEditing({ ...editing, session_date: e.target.value })} />
              </Field>
              <Field label="Status">
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  {SESSION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Start time *" error={errors.start_time}>
                <input type="time" className="or-input w-full px-3 py-2 text-sm" value={editing.start_time} onChange={(e) => setEditing({ ...editing, start_time: e.target.value })} />
              </Field>
              <Field label="End time *" error={errors.end_time}>
                <input type="time" className="or-input w-full px-3 py-2 text-sm" value={editing.end_time} onChange={(e) => setEditing({ ...editing, end_time: e.target.value })} />
              </Field>
            </div>
            <Field label="Goal for this session">
              <input className="or-input w-full px-3 py-2 text-sm" value={editing.goal || ''} onChange={(e) => setEditing({ ...editing, goal: e.target.value })} placeholder="Solve 10 problems" />
            </Field>
            <Field label="Notes">
              <textarea className="or-input w-full px-3 py-2 text-sm" rows={2} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 mt-4">
              <OrbitButton type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</OrbitButton>
              <OrbitButton type="submit">Save session</OrbitButton>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog title="Delete session?" message={`Remove "${confirmDelete.topic || 'this session'}"?`} onConfirm={() => deleteRow('study_sessions', confirmDelete.id)} onClose={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

function SessionList({ sessions, subjName, subjColor, onCycle, onEdit, onDelete, today }) {
  return (
    <div className="divide-y divide-orbit-border">
      {sessions.map((s) => {
        const done = s.status === 'completed';
        return (
          <div key={s.id} className="flex flex-wrap items-center gap-3 py-3 transition-colors duration-200 hover:bg-orbit-bg px-1 -mx-1 rounded-lg">
            <button
              onClick={() => onCycle(s)}
              className="w-6 h-6 rounded-lg border-2 shrink-0 flex items-center justify-center transition-all duration-200 hover:scale-105"
              style={{ borderColor: done ? '#34d399' : s.status === 'in_progress' ? '#f59e0b' : '#334155', background: done ? '#34d399' : s.status === 'in_progress' ? '#312e81' : '#0b1120' }}
              title={`${labelOf(SESSION_STATUSES, s.status)} — click to advance`}
            >
              {done ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /> : <Clock className="w-3.5 h-3.5" style={{ color: s.status === 'in_progress' ? '#f59e0b' : '#94a3b8' }} strokeWidth={2.6} />}
            </button>
            <span className="w-1.5 self-stretch min-h-[30px] rounded-full shrink-0" style={{ background: subjColor(s.subject_id), opacity: done ? 0.35 : 1 }} />
            <div className="flex-1 min-w-[150px]">
              <p className={`text-[13.5px] font-bold ${done ? 'line-through text-orbit-text-mute' : 'text-orbit-text'}`}>{s.topic || 'Study session'}</p>
              <p className="text-[11.5px] text-orbit-text-mute mt-0.5 truncate">{subjName(s.subject_id)}{s.goal ? ` · ${s.goal}` : ''}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <OrbitBadge tone={s.session_date === today ? 'purple' : 'neutral'}>
                {fmtDate(s.session_date, { day: 'numeric', month: 'short' })} · {fmtTime12(s.start_time)}–{fmtTime12(s.end_time)}
              </OrbitBadge>
              <OrbitBadge tone={STATUS_TONE[s.status] || 'neutral'}>{labelOf(SESSION_STATUSES, s.status)}</OrbitBadge>
              <span className="text-[11.5px] font-bold text-orbit-text-mute w-12 text-right">{fmtDuration(sessionMinutes(s))}</span>
              <div className="flex gap-1">
                <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => onEdit(s)} title="Edit"><Pencil className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => onDelete(s)} title="Delete"><Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
