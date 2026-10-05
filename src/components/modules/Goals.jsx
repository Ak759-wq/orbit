import { useState } from 'react';
import { Plus, Pencil, Trash2, Target, Link2, Hand, Trophy, CheckCircle2, CalendarClock, Minus } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader, Modal, Field, ConfirmDialog } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitEmptyState, OrbitBadge, OrbitProgress, OrbitStat } from '../orbit/Orbit.jsx';
import { validateGoal } from '../../lib/validate.js';
import { GOAL_TYPES, labelOf } from '../../lib/constants.js';
import { todayISO, fmtDate, daysBetween } from '../../lib/datetime.js';

const EMPTY = { name: '', subject_id: '', goal_type: 'manual', target_value: '', current_value: '', start_date: todayISO(), deadline: '', notes: '' };

export default function Goals() {
  const { data, analytics, insertRow, updateRow, deleteRow, today } = useApp();
  const subjects = data?.subjects ?? [];
  const goals = analytics?.goals ?? [];
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [errors, setErrors] = useState({});

  const subjName = (id) => subjects.find((s) => s.id === id)?.name || null;
  const isAuto = (g) => g.goal_type !== 'manual';

  const save = async (e) => {
    e.preventDefault();
    const rec = {
      ...editing,
      subject_id: editing.subject_id ? Number(editing.subject_id) : null,
      target_value: editing.target_value === '' ? '' : Number(editing.target_value),
      current_value: editing.current_value === '' ? 0 : Number(editing.current_value),
    };
    const { ok, errors: errs } = validateGoal(rec);
    setErrors(errs);
    if (!ok) return;
    const row = { ...rec };
    delete row.id;
    delete row.live_current;
    if (editing.id) await updateRow('goals', editing.id, row);
    else await insertRow('goals', row);
    setEditing(null);
    setErrors({});
  };

  const bump = async (g, delta) => {
    const current = Math.max(0, Number(g.live_current ?? g.current_value) + delta);
    await updateRow('goals', g.id, { current_value: current });
  };

  const openEditor = (g) => { setEditing(g ? { ...g } : { ...EMPTY }); setErrors({}); };

  const doneCount = goals.filter((g) => {
    const c = Number(g.live_current ?? g.current_value);
    return g.target_value > 0 && c >= g.target_value;
  }).length;

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="ACADEMIC GOALS"
        title="Goals"
        sub="Track targets. Attendance, average and study-hour goals can update themselves from your data."
        actions={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add goal</OrbitButton>}
      />

      {!goals.length ? (
        <OrbitCard>
          <OrbitEmptyState
            icon={Target}
            title="No goals set yet"
            sub='Try: "Score 85% in Java", "Maintain 85% attendance", or "Complete 50 DSA problems".'
            action={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Set your first goal</OrbitButton>}
          />
        </OrbitCard>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
            <OrbitStat icon={Target} tone="purple" value={goals.length} label="Total goals" sub="Across all subjects" />
            <OrbitStat icon={CheckCircle2} tone="green" value={doneCount} label="Achieved" sub={doneCount ? 'Nice work' : 'Keep going'} />
            <OrbitStat icon={Link2} tone="blue" value={goals.filter(isAuto).length} label="Auto-tracked" sub="Update from your data" />
            <OrbitStat icon={CalendarClock} tone="orange" value={goals.filter((g) => g.deadline && g.deadline >= today).length} label="With deadlines" sub="Upcoming milestones" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {goals.map((g) => {
              const current = Number(g.live_current ?? g.current_value);
              const progress = g.target_value > 0 ? Math.min(Math.round((current / g.target_value) * 1000) / 10, 999) : null;
              const auto = isAuto(g);
              const done = progress != null && progress >= 100;
              const daysLeft = g.deadline ? daysBetween(today, g.deadline) : null;
              const subject = subjects.find((s) => s.id === g.subject_id);

              return (
                <OrbitCard key={g.id} hover className="p-4 md:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-orbit-text leading-tight">{g.name}</p>
                      <p className="text-[11.5px] text-orbit-text-mute mt-1 flex items-center gap-1.5 flex-wrap">
                        {auto ? <Link2 className="w-3 h-3" strokeWidth={2.4} /> : <Hand className="w-3 h-3" strokeWidth={2.4} />}
                        {labelOf(GOAL_TYPES, g.goal_type)}
                        {subjName(g.subject_id) ? ` · ${subjName(g.subject_id)}` : ''}
                        {g.deadline ? ` · by ${fmtDate(g.deadline)}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => openEditor(g)} title="Edit"><Pencil className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                      <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => setConfirmDelete(g)} title="Delete"><Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2 mt-3.5 mb-2">
                    <span className="text-[24px] font-extrabold text-orbit-text leading-none">
                      {Number.isFinite(current) ? Math.round(current * 10) / 10 : 0}
                      <span className="text-[14px] text-orbit-text-mute font-semibold"> / {g.target_value}</span>
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      {done && <OrbitBadge tone="green"><Trophy className="w-3 h-3" strokeWidth={2.6} /> Achieved</OrbitBadge>}
                      {progress != null && (
                        <OrbitBadge tone={done ? 'green' : progress >= 60 ? 'purple' : 'orange'}>{progress}%</OrbitBadge>
                      )}
                    </div>
                  </div>

                  {/* Progress animates to its value on mount/update. */}
                  <OrbitProgress value={progress ?? 0} tone={done ? '#34d399' : (subject?.color || '#8b5cf6')} />

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[11.5px] font-semibold text-orbit-text-mute">
                    {daysLeft != null && (
                      <span className={daysLeft < 0 ? '' : ''} style={{ color: daysLeft < 0 ? '#94a3b8' : daysLeft <= 7 ? '#fb7185' : undefined }}>
                        {daysLeft < 0 ? `Deadline passed ${Math.abs(daysLeft)}d ago` : daysLeft === 0 ? 'Deadline is today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                      </span>
                    )}
                    {g.start_date && <span>Started {fmtDate(g.start_date)}</span>}
                    <span className="ml-auto">{auto ? 'Live from your data' : 'Manual tracking'}</span>
                  </div>

                  {!auto && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-orbit-border">
                      <OrbitButton size="sm" variant="outline" onClick={() => bump(g, -1)}><Minus className="w-3.5 h-3.5" strokeWidth={2.8} /> 1</OrbitButton>
                      <OrbitButton size="sm" variant="outline" onClick={() => bump(g, 1)}>+1</OrbitButton>
                      <OrbitButton size="sm" variant="outline" onClick={() => bump(g, 5)}>+5</OrbitButton>
                    </div>
                  )}
                </OrbitCard>
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit goal' : 'Add goal'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <Field label="Goal name *" error={errors.name}>
              <input className="or-input w-full px-3 py-2 text-sm" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Score 85% in Java" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Goal type">
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.goal_type} onChange={(e) => setEditing({ ...editing, goal_type: e.target.value })}>
                  {GOAL_TYPES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </Field>
              <Field label="Subject (optional)">
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.subject_id ?? ''} onChange={(e) => setEditing({ ...editing, subject_id: e.target.value })}>
                  <option value="">None</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Target value *" error={errors.target_value}>
                <input type="number" step="any" min="1" className="or-input w-full px-3 py-2 text-sm" value={editing.target_value} onChange={(e) => setEditing({ ...editing, target_value: e.target.value })} placeholder="85" />
              </Field>
              <Field label="Current value" error={errors.current_value}>
                <input type="number" step="any" min="0" className="or-input w-full px-3 py-2 text-sm" value={editing.current_value} onChange={(e) => setEditing({ ...editing, current_value: e.target.value })} disabled={editing.goal_type !== 'manual'} title={editing.goal_type !== 'manual' ? 'Auto goals compute this from your data' : ''} />
              </Field>
              <Field label="Start date">
                <input type="date" className="or-input w-full px-3 py-2 text-sm" value={editing.start_date} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} />
              </Field>
              <Field label="Deadline" error={errors.deadline}>
                <input type="date" className="or-input w-full px-3 py-2 text-sm" value={editing.deadline || ''} onChange={(e) => setEditing({ ...editing, deadline: e.target.value })} />
              </Field>
            </div>
            {editing.goal_type !== 'manual' && (
              <p className="text-[12px] text-orbit-text-mute mb-3 leading-relaxed">This goal tracks live data: {labelOf(GOAL_TYPES, editing.goal_type)}. The current value updates automatically.</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <OrbitButton type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</OrbitButton>
              <OrbitButton type="submit">Save goal</OrbitButton>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog title="Delete goal?" message={`Remove "${confirmDelete.name}"?`} onConfirm={() => deleteRow('goals', confirmDelete.id)} onClose={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}
