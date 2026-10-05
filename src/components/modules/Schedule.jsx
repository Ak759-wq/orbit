import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Copy, CalendarDays, Clock, MapPin, Coffee } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader, Modal, Field, TabBar, ConfirmDialog } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitEmptyState, OrbitBadge, OrbitSection } from '../orbit/Orbit.jsx';
import { validateClassSlot } from '../../lib/validate.js';
import { DAYS, DAYS_SHORT } from '../../lib/constants.js';
import { fmtTime12, nowMinutes, timeToMinutes } from '../../lib/datetime.js';

const EMPTY = { subject_id: '', day_of_week: 1, start_time: '09:00', end_time: '10:00', room: '', faculty: '', notes: '' };

// Monday-first ordering for the weekly grid.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function Schedule() {
  const { data, insertRow, updateRow, deleteRow } = useApp();
  const subjects = data?.subjects ?? [];
  const schedule = data?.schedule ?? [];
  const [view, setView] = useState('today');
  const [editing, setEditing] = useState(null); // null | {id?} form object
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [errors, setErrors] = useState({});
  const [dupDay, setDupDay] = useState(null);

  const subjName = (id) => subjects.find((s) => s.id === id)?.name || 'Unknown';
  const subjCode = (id) => subjects.find((s) => s.id === id)?.code || '';
  const subjColor = (id) => subjects.find((s) => s.id === id)?.color || '#8b5cf6';
  const todayDow = new Date().getDay();

  const filtered = useMemo(() => {
    return schedule.filter((c) =>
      (!filterSubject || String(c.subject_id) === filterSubject) &&
      (filterDay === '' || c.day_of_week === Number(filterDay)));
  }, [schedule, filterSubject, filterDay]);

  const byDay = useMemo(() => {
    const m = Array.from({ length: 7 }, () => []);
    for (const c of filtered) m[c.day_of_week].push(c);
    for (const list of m) list.sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
    return m;
  }, [filtered]);

  // Distinct time bands across the week. Every class keeps its own row, so
  // 14:00–14:40 and 14:40–15:20 are never merged.
  const bands = useMemo(() => {
    const set = new Map();
    for (const c of filtered) {
      const key = `${c.start_time}-${c.end_time}`;
      set.set(key, { key, start: c.start_time, end: c.end_time, days: new Set() });
    }
    for (const c of filtered) set.get(`${c.start_time}-${c.end_time}`)?.days.add(c.day_of_week);
    return [...set.values()].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  }, [filtered]);

  const weekStats = useMemo(() => {
    let minutes = 0;
    for (const c of filtered) minutes += Math.max(0, timeToMinutes(c.end_time) - timeToMinutes(c.start_time));
    const subjectsUsed = new Set(filtered.map((c) => c.subject_id)).size;
    const daysUsed = new Set(filtered.map((c) => c.day_of_week)).size;
    return { minutes, subjectsUsed, daysUsed };
  }, [filtered]);

  const save = async (e) => {
    e.preventDefault();
    const f = { ...editing, subject_id: editing.subject_id ? Number(editing.subject_id) : '' };
    const { ok, errors: errs } = validateClassSlot(f);
    setErrors(errs);
    if (!ok) return;
    const row = { ...f, subject_id: Number(f.subject_id), day_of_week: Number(f.day_of_week) };
    delete row.id;
    if (editing.id) await updateRow('class_schedule', editing.id, row);
    else await insertRow('class_schedule', row);
    setEditing(null);
    setErrors({});
  };

  const duplicate = async (slot, targetDay) => {
    const { id: _id, created_at: _c, updated_at: _u, user_id: _u2, is_demo: _d, ...rest } = slot;
    await insertRow('class_schedule', { ...rest, day_of_week: targetDay });
  };

  const openEditor = (slot) => { setEditing(slot ? { ...slot } : { ...EMPTY }); setErrors({}); };
  const rowActions = (c) => (
    <div className="flex gap-1 shrink-0">
      <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => openEditor(c)} title="Edit"><Pencil className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
      <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => setDupDay(c)} title="Duplicate"><Copy className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
      <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => setConfirmDelete(c)} title="Delete"><Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
    </div>
  );

  return (
    <div>
      <PageHeader
        kicker="WEEKLY TIMETABLE"
        title="Class Schedule"
        sub="Recurring weekly classes. The dashboard reads today's schedule from here."
        actions={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add class</OrbitButton>}
      />

      {!schedule.length ? (
        <OrbitCard>
          <OrbitEmptyState
            icon={CalendarDays}
            title="No classes scheduled yet"
            sub="Add your weekly timetable so the dashboard can show today's classes and live status."
            action={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add your first class</OrbitButton>}
          />
        </OrbitCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <TabBar tabs={[{ value: 'today', label: "Today" }, { value: 'week', label: 'Full week' }]} active={view} onChange={setView} />
            <select className="or-input px-3 py-2 text-xs font-semibold" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {view === 'week' && (
              <select className="or-input px-3 py-2 text-xs font-semibold" value={filterDay} onChange={(e) => setFilterDay(e.target.value)}>
                <option value="">All days</option>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Classes / week', value: filtered.length, tone: 'purple' },
              { label: 'Teaching hours', value: `${Math.round((weekStats.minutes / 60) * 10) / 10}h`, tone: 'blue' },
              { label: 'Subjects', value: weekStats.subjectsUsed, tone: 'lavender' },
              { label: 'Days on campus', value: weekStats.daysUsed, tone: 'green' },
            ].map((s) => (
              <div key={s.label} className="or-inset px-3.5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute">{s.label}</p>
                <p className="text-[19px] font-extrabold text-orbit-text mt-1 leading-none">{s.value}</p>
              </div>
            ))}
          </div>

          {view === 'today' ? (
            <OrbitSection icon={CalendarDays} tone="purple" title="Today's classes" sub={DAYS[todayDow]}>
              {byDay[todayDow].length === 0 ? (
                <OrbitEmptyState
                  icon={CalendarDays}
                  title="No classes today"
                  sub="Nothing scheduled for today (after filters). Enjoy the break!"
                />
              ) : (
                <div className="or-timeline">
                  {byDay[todayDow].map((c) => (
                    <ClassBlock
                      key={c.id}
                      c={c}
                      name={subjName(c.subject_id)}
                      code={subjCode(c.subject_id)}
                      color={subjColor(c.subject_id)}
                      isToday
                      actions={rowActions(c)}
                    />
                  ))}
                </div>
              )}
            </OrbitSection>
          ) : (
            <OrbitCard className="overflow-hidden">
              <div className="or-card-head">
                <span className="or-icon-chip or-icon-chip-sm or-tone-purple"><Clock className="w-[18px] h-[18px]" strokeWidth={2.2} /></span>
                <div className="min-w-0">
                  <h2 className="font-bold text-[15.5px] text-orbit-text leading-tight">Weekly time-grid</h2>
                  <p className="text-[12px] text-orbit-text-mute mt-0.5">Each row is an exact class block — short blocks stay separate.</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="or-table w-full min-w-[760px]">
                  <thead>
                    <tr>
                      <th className="w-[110px] text-left">Time</th>
                      {WEEK_ORDER.map((dow) => (
                        <th key={dow} className={`text-left ${dow === todayDow ? 'text-orbit-purple' : ''}`}>
                          {DAYS_SHORT[dow]}
                          {dow === todayDow && <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-wide align-middle">today</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bands.map((band) => {
                      return (
                        <tr key={band.key} className="align-top">
                          <td className="whitespace-nowrap py-2.5 pr-3">
                            <p className="text-[12.5px] font-bold text-orbit-text leading-tight">{fmtTime12(band.start)}</p>
                            <p className="text-[11px] text-orbit-text-mute leading-tight">{fmtTime12(band.end)}</p>
                          </td>
                          {WEEK_ORDER.map((dow) => {
                            const cell = filtered.find(
                              (c) => c.day_of_week === dow && c.start_time === band.start && c.end_time === band.end,
                            );
                            if (cell) {
                              const color = subjColor(cell.subject_id);
                              return (
                                <td key={dow} className="py-1.5 pr-1.5">
                                  <button
                                    onClick={() => openEditor(cell)}
                                    className="w-full text-left rounded-xl px-2.5 py-2 transition-all duration-200 hover:-translate-y-px"
                                    style={{ background: `${color}14`, boxShadow: `inset 3px 0 0 ${color}` }}
                                    title={`${subjName(cell.subject_id)} ${fmtTime12(cell.start_time)}–${fmtTime12(cell.end_time)}`}
                                  >
                                    <span className="block text-[12.5px] font-bold leading-tight truncate" style={{ color }}>
                                      {subjName(cell.subject_id)}
                                    </span>
                                    <span className="block text-[10.5px] text-orbit-text-mute leading-tight truncate">
                                      {[subjCode(cell.subject_id), cell.room].filter(Boolean).join(' · ') || fmtTime12(cell.start_time)}
                                    </span>
                                  </button>
                                </td>
                              );
                            }
                            return <td key={dow} className="py-1.5 pr-1.5" />;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-orbit-border flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-orbit-text-mute">
                  <Coffee className="w-3.5 h-3.5" strokeWidth={2.2} /> Lunch 1:00 – 2:00 PM is a break, not a class.
                </span>
                <span className="ml-auto text-[11px] text-orbit-text-mute">Click a block to edit it.</span>
              </div>
            </OrbitCard>
          )}
        </>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit class' : 'Add class'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <Field label="Subject *" error={errors.subject_id}>
              <select className="or-input w-full px-3 py-2 text-sm" value={editing.subject_id ?? ''} onChange={(e) => setEditing({ ...editing, subject_id: e.target.value })}>
                <option value="">Select subject…</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Day *" error={errors.day_of_week}>
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.day_of_week} onChange={(e) => setEditing({ ...editing, day_of_week: e.target.value })}>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </Field>
              <Field label="Room">
                <input className="or-input w-full px-3 py-2 text-sm" value={editing.room || ''} onChange={(e) => setEditing({ ...editing, room: e.target.value })} placeholder="LH-3" />
              </Field>
              <Field label="Start time *" error={errors.start_time}>
                <input type="time" className="or-input w-full px-3 py-2 text-sm" value={editing.start_time} onChange={(e) => setEditing({ ...editing, start_time: e.target.value })} />
              </Field>
              <Field label="End time *" error={errors.end_time}>
                <input type="time" className="or-input w-full px-3 py-2 text-sm" value={editing.end_time} onChange={(e) => setEditing({ ...editing, end_time: e.target.value })} />
              </Field>
            </div>
            <Field label="Faculty">
              <input className="or-input w-full px-3 py-2 text-sm" value={editing.faculty || ''} onChange={(e) => setEditing({ ...editing, faculty: e.target.value })} placeholder="Dr. Rao" />
            </Field>
            <Field label="Notes">
              <textarea className="or-input w-full px-3 py-2 text-sm" rows={2} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Optional…" />
            </Field>
            <div className="flex justify-end gap-2 mt-4">
              <OrbitButton type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</OrbitButton>
              <OrbitButton type="submit">Save class</OrbitButton>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete class?"
          message={`Remove ${subjName(confirmDelete.subject_id)} on ${DAYS[confirmDelete.day_of_week]} ${fmtTime12(confirmDelete.start_time)}? This cannot be undone.`}
          onConfirm={() => deleteRow('class_schedule', confirmDelete.id)}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {dupDay && (
        <Modal title="Duplicate class to…" onClose={() => setDupDay(null)}>
          <p className="text-[13.5px] text-orbit-text-soft mb-3">Copy <b>{subjName(dupDay.subject_id)} {fmtTime12(dupDay.start_time)}</b> to another day:</p>
          <div className="grid grid-cols-2 gap-2">
            {DAYS.map((d, i) => (
              <OrbitButton key={i} variant="outline" disabled={i === dupDay.day_of_week} onClick={async () => { await duplicate(dupDay, i); setDupDay(null); }}>
                {d}
              </OrbitButton>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// One class block in the timeline (Today view) or as a card.
function ClassBlock({ c, name, code, color, isToday, actions }) {
  const now = nowMinutes();
  const start = timeToMinutes(c.start_time);
  const end = timeToMinutes(c.end_time);
  const live = isToday && now >= start && now < end;
  const done = isToday && now >= end;
  return (
    <div className={`or-timeline-item ${live ? 'or-slot-ongoing' : ''}`}>
      <span className="or-timeline-dot" style={{ background: color }} />
      <div className={`min-w-0 flex-1 px-3 py-2.5 rounded-xl border transition-all duration-200 ${live ? 'border-orbit-purple/40' : 'border-orbit-border bg-orbit-surface'} ${done ? 'opacity-70' : ''}`} style={live ? { boxShadow: '0 6px 20px -10px rgba(109,92,232,.5)' } : undefined}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13.5px] font-bold text-orbit-text truncate">{name}</p>
              {live && <OrbitBadge tone="purple"><span className="or-live-dot" /> Ongoing</OrbitBadge>}
            </div>
            <p className="text-[12px] text-orbit-text-mute mt-1 flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 font-semibold text-orbit-text-soft">
                <Clock className="w-3 h-3" strokeWidth={2.4} />{fmtTime12(c.start_time)} – {fmtTime12(c.end_time)}
              </span>
              {code && <><span>·</span><span>{code}</span></>}
              {c.room && <><span>·</span><span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" strokeWidth={2.4} />{c.room}</span></>}
            </p>
          </div>
          {actions}
        </div>
      </div>
    </div>
  );
}
