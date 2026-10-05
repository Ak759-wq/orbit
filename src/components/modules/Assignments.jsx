import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, Download, Check, ClipboardList, CircleDashed,
  LoaderCircle, Flame, Clock, Search, Sparkles, BookOpen, CalendarCheck,
} from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader, Modal, Field, ConfirmDialog } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitEmptyState, OrbitBadge, OrbitStat, OrbitProgress } from '../orbit/Orbit.jsx';
import { validateAssignment } from '../../lib/validate.js';
import { getDueAssignments, splitDueAssignments } from '../../lib/queries.js';
import { TASK_TYPES, TASK_STATUSES, PRIORITIES, labelOf } from '../../lib/constants.js';
import { todayISO, addDaysISO, fmtDate, countdownLabel } from '../../lib/datetime.js';
import { downloadCSV } from '../../lib/csv.js';

const EMPTY = { title: '', subject_id: '', description: '', task_type: 'assignment', due_date: addDaysISO(todayISO(), 7), priority: 'normal', status: 'not_started', submission_link: '', attachment_url: '' };

const STATUS_TONE = { not_started: 'neutral', in_progress: 'orange', completed: 'green' };

// Filter tabs — labels keep their live counts so the pills and the
// underlying numbers can never drift apart.
const TABS = [
  { value: 'all', label: 'All', key: 'all' },
  { value: 'dueSoon', label: 'Due Soon', key: 'dueSoon' },
  { value: 'overdue', label: 'Overdue', key: 'overdue' },
  { value: 'completed', label: 'Completed', key: 'completed' },
];

export default function Assignments() {
  const { data, analytics, insertRow, updateRow, deleteRow, today } = useApp();
  const subjects = data?.subjects ?? [];
  const assignments = data?.assignments ?? [];
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [tab, setTab] = useState('all');
  const [filterSubject, setFilterSubject] = useState('');
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState({});

  // Quick Action hand-off from the Dashboard: open the create modal once.
  useEffect(() => {
    if (sessionStorage.getItem('orbit-quick-add') === 'assignments') {
      sessionStorage.removeItem('orbit-quick-add');
      setEditing({ ...EMPTY });
    }
  }, []);

  const subjName = (id) => subjects.find((s) => s.id === id)?.name || '—';
  const subjColor = (id) => subjects.find((s) => s.id === id)?.color || '#8b5cf6';
  const weekEnd = addDaysISO(today, 6);
  const isOpen = (a) => a.status !== 'completed';

  // Shared query — the Dashboard's "Assignments Due" card counts exactly
  // these rows, so the page and the card can never disagree.
  const dueAll = useMemo(() => getDueAssignments(assignments, today), [assignments, today]);
  const dueCounts = useMemo(() => splitDueAssignments(dueAll, today), [dueAll, today]);

  const counts = useMemo(() => ({
    all: assignments.length,
    dueSoon: assignments.filter((a) => isOpen(a) && a.due_date >= today && a.due_date <= weekEnd).length,
    overdue: dueCounts.overdue.length,
    completed: assignments.filter((a) => a.status === 'completed').length,
    // Every outstanding assignment — the number the Dashboard card shows.
    due: dueAll.length,
  }), [assignments, today, weekEnd, dueCounts, dueAll]);

  // The soonest outstanding task (overdue first) — the hero's "next up".
  const nextUp = dueAll[0] ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...assignments];
    if (filterSubject) list = list.filter((a) => String(a.subject_id) === filterSubject);
    if (tab === 'dueSoon') list = list.filter((a) => isOpen(a) && a.due_date >= today && a.due_date <= weekEnd);
    if (tab === 'overdue') list = list.filter((a) => isOpen(a) && a.due_date < today);
    if (tab === 'completed') list = list.filter((a) => a.status === 'completed');
    if (q) {
      list = list.filter((a) => [
        a.title,
        a.description,
        subjName(a.subject_id),
        labelOf(TASK_TYPES, a.task_type),
      ].filter(Boolean).join(' ').toLowerCase().includes(q));
    }
    // Overdue first, then soonest due, then everything else by date.
    return list.sort((a, b) => {
      const ao = isOpen(a) && a.due_date < today ? 0 : 1;
      const bo = isOpen(b) && b.due_date < today ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return a.due_date < b.due_date ? -1 : 1;
    });
  }, [assignments, tab, filterSubject, search, today, weekEnd]);

  const save = async (e) => {
    e.preventDefault();
    const rec = { ...editing, subject_id: editing.subject_id ? Number(editing.subject_id) : '' };
    const { ok, errors: errs } = validateAssignment(rec);
    setErrors(errs);
    if (!ok) return;
    const row = { ...rec };
    delete row.id;
    if (editing.id) await updateRow('assignments', editing.id, row);
    else await insertRow('assignments', row);
    setEditing(null);
    setErrors({});
  };

  const cycleStatus = async (a) => {
    const next = a.status === 'not_started' ? 'in_progress' : a.status === 'in_progress' ? 'completed' : 'not_started';
    await updateRow('assignments', a.id, { status: next });
  };

  const stats = analytics?.assignStats;
  const completion = assignments.length ? Math.round((counts.completed / assignments.length) * 100) : 0;

  const openEditor = (a) => { setEditing(a ? { ...a } : { ...EMPTY }); setErrors({}); };

  const emptyCopy = () => {
    if (search.trim()) return `No tasks match “${search.trim()}”.`;
    if (filterSubject) return 'No tasks for this subject yet.';
    if (tab === 'overdue') return "You're not behind on anything. Nice.";
    if (tab === 'completed') return 'No completed tasks yet.';
    return 'No tasks match this filter.';
  };

  return (
    <div>
      <PageHeader
        kicker="ASSIGNMENTS & TASKS"
        title="Assignments"
        sub={stats ? `${stats.pending} pending · ${stats.overdue} overdue · ${stats.completionPct ?? 0}% complete` : 'Academic task management'}
        actions={(
          <>
            <OrbitButton variant="outline" onClick={() => downloadCSV('assignments.csv',
              ['Title', 'Subject', 'Type', 'Due', 'Priority', 'Status', 'Link'],
              assignments.map((a) => [a.title, subjName(a.subject_id), a.task_type, a.due_date, a.priority, a.status, a.submission_link || '']))}>
              <Download className="w-4 h-4" strokeWidth={2.2} /> Export
            </OrbitButton>
            <OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add task</OrbitButton>
          </>
        )}
      />

      {/* ============ HERO STRIP ============ */}
      <section className="or-hero or-hero-strip mb-5">
        <AssignmentsScene />
        <span className="or-star or-star--twinkle w-1.5 h-1.5" style={{ left: '52%', top: '18%' }} aria-hidden="true" />
        <span className="or-star or-star--twinkle w-1 h-1" style={{ left: '62%', top: '72%', animationDelay: '1.4s' }} aria-hidden="true" />
        <div className="relative z-10 p-6 md:p-7 max-w-2xl">
          <p className="or-kicker">Academic task management</p>
          <h2 className="text-[21px] md:text-[25px] font-extrabold tracking-[-0.02em] text-orbit-text mt-2 leading-tight">
            Every deadline, in one orbit.
          </h2>
          <p className="text-[13px] font-medium text-orbit-text-soft mt-2 max-w-lg leading-relaxed">
            {nextUp
              ? <>Next up — <span className="text-orbit-text font-semibold">{nextUp.title}</span><span className="text-orbit-text-mute"> · {subjName(nextUp.subject_id)} · {countdownLabel(nextUp.due_date, today).toLowerCase()}</span></>
              : 'Nothing outstanding right now. Add a task to start planning your week.'}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="or-chip or-chip-purple"><ClipboardList className="w-3 h-3" strokeWidth={2.4} /> {counts.all} tracked</span>
            <span className="or-chip or-chip-orange"><Clock className="w-3 h-3" strokeWidth={2.4} /> {counts.dueSoon} due this week</span>
            {counts.overdue > 0
              ? <span className="or-chip or-chip-coral"><Flame className="w-3 h-3" strokeWidth={2.4} /> {counts.overdue} overdue</span>
              : <span className="or-chip or-chip-green"><Check className="w-3 h-3" strokeWidth={2.4} /> On track</span>}
          </div>
        </div>
      </section>

      {!assignments.length ? (
        <OrbitCard>
          <OrbitEmptyState
            icon={ClipboardList}
            title="No assignments added"
            sub="Add assignments, homework, labs and projects. Dashboard counts and reminders update automatically."
            action={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add your first task</OrbitButton>}
          />
        </OrbitCard>
      ) : (
        <div className="space-y-5">
          {/* ============ STAT CARDS ============ */}
          <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Same shared query the Dashboard's "Assignments Due" card uses,
                so the two numbers are visibly identical. */}
            <OrbitStat icon={ClipboardList} tone="purple" value={counts.all} label="All tasks" sub="Everything tracked" />
            <OrbitStat
              icon={Clock}
              tone="orange"
              value={counts.due}
              label="Assignments Due"
              sub={counts.due === 0 ? 'All caught up! 🎉' : 'Still outstanding'}
            />
            <OrbitStat icon={Flame} tone="coral" value={counts.overdue} label="Overdue" sub={counts.overdue ? 'Needs attention' : 'All on track'} />
            <OrbitStat icon={Check} tone="green" value={counts.completed} label="Completed" sub={`${completion}% of all tasks`} />
          </section>

          {/* ============ COMPLETION + MOTIVATION ============ */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <OrbitCard className="lg:col-span-2 p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="or-kicker">Completion</p>
                  <p className="text-[34px] md:text-[40px] font-extrabold text-orbit-text leading-none mt-2 tracking-[-0.03em]">
                    {completion}<span className="text-[20px] text-orbit-text-mute">%</span>
                  </p>
                </div>
                <span className="or-icon-chip or-icon-chip-lg or-tone-purple shadow-[0_0_30px_-8px_rgba(139,92,246,0.95)]">
                  <CalendarCheck className="w-6 h-6" strokeWidth={2} />
                </span>
              </div>
              <OrbitProgress value={completion} tone="#8b5cf6" size="lg" className="!mt-4" />
              <div className="grid grid-cols-3 gap-3 mt-5">
                {[
                  { label: 'Completed', value: counts.completed, hex: '#34d399' },
                  { label: 'Due soon', value: counts.dueSoon, hex: '#f59e0b' },
                  { label: 'Overdue', value: counts.overdue, hex: '#fb7185' },
                ].map((m) => (
                  <div key={m.label} className="or-inset px-3 py-2.5">
                    <p className="text-[17px] font-extrabold leading-none" style={{ color: m.hex }}>{m.value}</p>
                    <p className="text-[11px] font-semibold text-orbit-text-mute mt-1.5 truncate">{m.label}</p>
                  </div>
                ))}
              </div>
            </OrbitCard>

            <OrbitCard className="or-motivation p-5 md:p-6 flex flex-col justify-center">
              <span className="or-icon-chip or-icon-chip-sm or-tone-purple w-fit shadow-[0_0_24px_-8px_rgba(139,92,246,0.95)]">
                <Sparkles className="w-4 h-4" strokeWidth={2.1} />
              </span>
              <p className="text-[19px] font-extrabold text-orbit-text mt-4 leading-tight">Keep going!</p>
              <p className="text-[13px] text-orbit-text-soft mt-2 leading-relaxed">
                Complete assignments to track your progress.
              </p>
              <p className="text-[11.5px] font-semibold text-orbit-bright-purple mt-4">
                {counts.completed} of {counts.all} tasks complete
              </p>
            </OrbitCard>
          </section>

          {/* ============ FILTERS + SEARCH ============ */}
          <section className="flex flex-col xl:flex-row xl:items-center gap-3.5">
            <div className="or-pills">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`or-pill ${tab === t.value ? 'is-active' : ''}`}
                >
                  {`${t.label} `}
                  <span className="or-pill-n">({counts[t.key]})</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 xl:ml-auto">
              <select
                aria-label="Filter by subject"
                className="or-input !w-auto sm:!w-[190px] px-3 py-2 text-xs font-semibold"
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
              >
                <option value="">All subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="relative sm:w-[240px]">
                <Search className="w-4 h-4 text-orbit-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  aria-label="Search assignments"
                  className="or-input !pl-9 !py-2 text-xs font-semibold"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search assignments…"
                />
              </div>
            </div>
          </section>

          {/* ============ TASK ROWS ============ */}
          <section className="space-y-3">
            {filtered.length === 0 ? (
              <OrbitCard>
                <OrbitEmptyState icon={ClipboardList} title="Nothing here" sub={emptyCopy()} compact />
              </OrbitCard>
            ) : (
              filtered.map((a) => {
                const overdue = isOpen(a) && a.due_date < today;
                const done = a.status === 'completed';
                return (
                  <div key={a.id} className="or-task" style={{ '--or-task-accent': subjColor(a.subject_id) }}>
                    <button
                      onClick={() => cycleStatus(a)}
                      className="w-7 h-7 rounded-lg border shrink-0 flex items-center justify-center transition-all duration-200 hover:scale-105"
                      style={{
                        borderColor: done ? '#34d399' : a.status === 'in_progress' ? '#f59e0b' : 'rgba(139,92,246,0.35)',
                        background: done ? '#34d399' : a.status === 'in_progress' ? 'rgba(245,158,11,0.18)' : '#0b1120',
                        boxShadow: done ? '0 0 16px -4px rgba(52,211,153,0.9)' : a.status === 'in_progress' ? '0 0 16px -6px rgba(245,158,11,0.9)' : 'none',
                      }}
                      title={`Status: ${labelOf(TASK_STATUSES, a.status)} — click to advance`}
                    >
                      {done ? <Check className="w-4 h-4 text-white" strokeWidth={3} />
                        : a.status === 'in_progress' ? <LoaderCircle className="w-4 h-4" style={{ color: '#f59e0b' }} strokeWidth={2.8} />
                        : <CircleDashed className="w-4 h-4 text-orbit-text-mute" strokeWidth={2.6} />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className={`text-[14px] font-bold truncate ${done ? 'line-through text-orbit-text-mute' : 'text-orbit-text'}`} title={a.title}>
                        {a.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11.5px] font-medium text-orbit-text-mute">
                        <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                          <BookOpen className="w-3 h-3 shrink-0" strokeWidth={2.2} />
                          <span className="truncate">{subjName(a.subject_id)}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0">{labelOf(TASK_TYPES, a.task_type)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0">Due {fmtDate(a.due_date)}</span>
                        {a.priority === 'high' && (
                          <span className="or-chip or-chip-coral !text-[10px] !py-0.5">High priority</span>
                        )}
                        {a.submission_link && (
                          <a href={a.submission_link} target="_blank" rel="noreferrer" className="or-link">submission</a>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 w-full sm:w-auto">
                      <OrbitBadge tone={STATUS_TONE[a.status] || 'neutral'}>{labelOf(TASK_STATUSES, a.status)}</OrbitBadge>
                      {overdue ? (
                        <OrbitBadge tone="coral"><Flame className="w-3 h-3" strokeWidth={2.4} /> Overdue</OrbitBadge>
                      ) : !done ? (
                        <OrbitBadge tone={a.due_date === today ? 'orange' : 'neutral'}>{countdownLabel(a.due_date, today)}</OrbitBadge>
                      ) : null}
                      <div className="flex gap-1.5">
                        <button className="or-iconbtn or-iconbtn-bordered w-8 h-8" onClick={() => openEditor(a)} title="Edit" aria-label={`Edit ${a.title}`}><Pencil className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                        <button className="or-iconbtn or-iconbtn-bordered w-8 h-8" onClick={() => setConfirmDelete(a)} title="Delete" aria-label={`Delete ${a.title}`}><Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit task' : 'Add task'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <Field label="Task name *" error={errors.title}>
              <input className="or-input w-full px-3 py-2 text-sm" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Java Assignment 3" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Subject *" error={errors.subject_id}>
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.subject_id ?? ''} onChange={(e) => setEditing({ ...editing, subject_id: e.target.value })}>
                  <option value="">Select…</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Task type">
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.task_type} onChange={(e) => setEditing({ ...editing, task_type: e.target.value })}>
                  {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Due date *" error={errors.due_date}>
                <input type="date" className="or-input w-full px-3 py-2 text-sm" value={editing.due_date} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} />
              </Field>
              <Field label="Priority">
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Submission link" error={errors.submission_link}>
                <input className="or-input w-full px-3 py-2 text-sm" value={editing.submission_link || ''} onChange={(e) => setEditing({ ...editing, submission_link: e.target.value })} placeholder="https://…" />
              </Field>
            </div>
            <Field label="Description">
              <textarea className="or-input w-full px-3 py-2 text-sm" rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <Field label="Attachment URL (optional)" error={errors.attachment_url}>
              <input className="or-input w-full px-3 py-2 text-sm" value={editing.attachment_url || ''} onChange={(e) => setEditing({ ...editing, attachment_url: e.target.value })} placeholder="https://…" />
            </Field>
            <div className="flex justify-end gap-2 mt-4">
              <OrbitButton type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</OrbitButton>
              <OrbitButton type="submit">Save task</OrbitButton>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog title="Delete task?" message={`Remove "${confirmDelete.title}"?`} onConfirm={() => deleteRow('assignments', confirmDelete.id)} onClose={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

// Subtle futuristic scene for the page strip: a floating clipboard of
// tasks, slow orbital rings, a star field and the Orbit robot watching
// over it. Purely decorative and never overlaps the copy.
function AssignmentsScene() {
  return (
    <svg className="or-hero-scene" viewBox="0 0 520 190" fill="none" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="orAsgNebula" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.32" />
          <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="orAsgPaper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e2a52" />
          <stop offset="100%" stopColor="#0d1430" />
        </linearGradient>
        <linearGradient id="orAsgLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      <ellipse cx="360" cy="70" rx="200" ry="120" fill="url(#orAsgNebula)" />
      <ellipse cx="500" cy="150" rx="120" ry="70" fill="url(#orAsgNebula)" opacity="0.6" />

      {/* star field */}
      <g fill="#f8fafc">
        <circle cx="150" cy="34" r="1.3" opacity="0.7" />
        <circle cx="238" cy="22" r="1" opacity="0.5" />
        <circle cx="300" cy="58" r="1.1" opacity="0.45" />
        <circle cx="96" cy="104" r="1" opacity="0.45" />
        <circle cx="470" cy="30" r="1.2" opacity="0.5" />
        <circle cx="430" cy="150" r="0.9" opacity="0.4" />
      </g>
      <g fill="#a78bfa">
        <circle cx="196" cy="64" r="1.3" opacity="0.7" />
        <circle cx="352" cy="140" r="1.1" opacity="0.6" />
        <circle cx="500" cy="96" r="1" opacity="0.5" />
      </g>

      {/* orbital rings */}
      <g className="or-ring-spin">
        <ellipse cx="372" cy="96" rx="118" ry="40" stroke="rgba(167,139,250,0.36)" strokeWidth="1.2" transform="rotate(-14 372 96)" />
        <circle cx="256" cy="126" r="3.4" fill="#c4b5fd" />
      </g>
      <g className="or-ring-spin-rev">
        <ellipse cx="372" cy="96" rx="86" ry="28" stroke="rgba(56,189,248,0.30)" strokeWidth="1" transform="rotate(20 372 96)" />
        <circle cx="446" cy="78" r="2.6" fill="#7dd3fc" />
      </g>

      {/* floating clipboard / assignment sheet */}
      <g transform="translate(322 44)">
        <rect x="-4" y="-4" width="104" height="132" rx="18" fill="#8b5cf6" opacity="0.16" />
        <rect x="0" y="0" width="96" height="124" rx="15" fill="url(#orAsgPaper)" stroke="rgba(167,139,250,0.42)" strokeWidth="1.2" />
        {/* clip */}
        <rect x="30" y="-8" width="36" height="16" rx="8" fill="#1e1b4b" stroke="rgba(196,181,253,0.55)" strokeWidth="1.1" />
        <circle cx="48" cy="0" r="3.4" fill="#a78bfa" />
        {/* header line + task lines */}
        <rect x="14" y="24" width="52" height="6" rx="3" fill="url(#orAsgLine)" />
        <g fill="#cbd5e1">
          <rect x="14" y="44" width="6" height="6" rx="2" opacity="0.7" />
          <rect x="26" y="44" width="52" height="5" rx="2.5" opacity="0.45" />
          <rect x="14" y="62" width="6" height="6" rx="2" opacity="0.7" />
          <rect x="26" y="62" width="40" height="5" rx="2.5" opacity="0.4" />
          <rect x="14" y="80" width="6" height="6" rx="2" opacity="0.7" />
          <rect x="26" y="80" width="46" height="5" rx="2.5" opacity="0.35" />
        </g>
        {/* checkmarks on the first two rows */}
        <path d="M15.4 47 l1.6 1.8 l3.2 -3.6" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M15.4 65 l1.6 1.8 l3.2 -3.6" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* due chip */}
        <rect x="14" y="96" width="46" height="14" rx="7" fill="rgba(245,158,11,0.18)" stroke="rgba(245,158,11,0.45)" strokeWidth="1" />
        <rect x="21" y="101" width="30" height="4" rx="2" fill="#f59e0b" opacity="0.75" />
      </g>

      {/* the Orbit robot */}
      <g transform="translate(276 132)">
        <ellipse cx="0" cy="24" rx="16" ry="4.6" fill="#8b5cf6" opacity="0.22" />
        <circle cx="0" cy="13" r="10.5" fill="#0b1024" stroke="#8b5cf6" strokeWidth="1.2" />
        <circle cx="-3.8" cy="11" r="2.1" fill="#f8fafc" />
        <circle cx="3.8" cy="11" r="2.1" fill="#f8fafc" />
        <path d="M-3.2 16.2 q3.2 2.4 6.4 0" stroke="#a78bfa" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        <line x1="0" y1="-1.5" x2="0" y2="-7" stroke="#a78bfa" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="0" cy="-9" r="1.9" fill="#c4b5fd" />
        <path d="M-10.5 13 a10.5 10.5 0 0 1 21 0" stroke="rgba(167,139,250,0.4)" strokeWidth="1" fill="none" />
      </g>
    </svg>
  );
}
