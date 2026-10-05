import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Library, X, Percent, FileText, ClipboardList, BookMarked, CalendarClock, GraduationCap } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader, Modal, Field, ConfirmDialog } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitEmptyState, OrbitBadge, OrbitProgress } from '../orbit/Orbit.jsx';
import { validateSubject } from '../../lib/validate.js';
import { SUBJECT_COLORS } from '../../lib/constants.js';
import { fmtDate, countdownLabel } from '../../lib/datetime.js';
import { testPercentage, upcomingTestsList } from '../../lib/calc.js';

const EMPTY = { name: '', code: '', faculty: '', credits: 4, semester: '', description: '', target_percentage: 85, attendance_required_pct: 75, color: SUBJECT_COLORS[0] };

export default function Subjects() {
  const { data, analytics, insertRow, updateRow, deleteRow, today } = useApp();
  const subjects = data?.subjects ?? [];
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [openSubject, setOpenSubject] = useState(null);
  const [errors, setErrors] = useState({});

  const save = async (e) => {
    e.preventDefault();
    const rec = { ...editing, credits: Number(editing.credits), target_percentage: Number(editing.target_percentage), attendance_required_pct: Number(editing.attendance_required_pct) };
    const { ok, errors: errs } = validateSubject(rec);
    setErrors(errs);
    if (!ok) return;
    const row = { ...rec };
    delete row.id;
    if (editing.id) await updateRow('subjects', editing.id, row);
    else await insertRow('subjects', row);
    setEditing(null);
    setErrors({});
  };

  const usageCount = (id) => ({
    tests: (data.tests ?? []).filter((t) => t.subject_id === id).length,
    attendance: (data.attendance ?? []).filter((r) => r.subject_id === id).length,
    assignments: (data.assignments ?? []).filter((a) => a.subject_id === id).length,
    resources: (data.resources ?? []).filter((r) => r.subject_id === id).length,
  });

  const openEditor = (s) => { setEditing(s ? { ...s } : { ...EMPTY }); setErrors({}); };

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="SUBJECT DATABASE"
        title="Subjects"
        sub="The single source every module references — add them here once, use them everywhere."
        actions={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add subject</OrbitButton>}
      />

      {!subjects.length ? (
        <OrbitCard>
          <OrbitEmptyState
            icon={Library}
            title="No subjects yet"
            sub="Subjects power the schedule, tests, attendance, assignments, planner and analytics."
            action={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add your first subject</OrbitButton>}
          />
        </OrbitCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {subjects.map((s) => {
            const u = usageCount(s.id);
            const att = analytics?.subjectAttendance?.find((x) => x.subjectId === s.id);
            const stats = analytics?.subjectStats?.find((x) => x.subject.id === s.id);
            const low = att?.total > 0 && att?.pct != null && att.pct < (s.attendance_required_pct ?? 75);
            const nextTest = upcomingTestsList((data.tests ?? []).filter((t) => t.subject_id === s.id), today)[0] ?? null;
            const openTasks = (data.assignments ?? []).filter((a) => a.subject_id === s.id && a.status !== 'completed').length;

            return (
              <OrbitCard key={s.id} hover className="p-4 md:p-5 flex flex-col">
                <div className="flex items-start gap-2.5">
                  <span className="w-3 h-3 rounded-full shrink-0 mt-1.5" style={{ background: s.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-orbit-text leading-tight">{s.name}</p>
                    <p className="text-[11.5px] text-orbit-text-mute mt-1">
                      {[s.code || 'No code', s.faculty || 'No faculty', `${s.credits} credits`].join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => openEditor(s)} title="Edit"><Pencil className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                    <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => setConfirmDelete(s)} title="Delete"><Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                  </div>
                </div>

                {s.description && <p className="text-[12.5px] text-orbit-text-soft mt-2.5 leading-relaxed line-clamp-2">{s.description}</p>}

                {/* Attendance — real value or an honest dash */}
                <div className="mt-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-orbit-text-mute flex items-center gap-1">
                      <Percent className="w-3 h-3" strokeWidth={2.6} /> Attendance
                    </span>
                    <span className="text-[12px] font-extrabold" style={{ color: low ? '#fb7185' : '#34d399' }}>
                      {att?.pct != null ? `${att.pct}%` : '—'}
                    </span>
                  </div>
                  <OrbitProgress value={att?.pct ?? 0} tone={low ? '#fb7185' : '#34d399'} size="sm" />
                  <p className="text-[11px] text-orbit-text-mute mt-1">
                    {att?.total ? `${att.present}/${att.total} · needs ${s.attendance_required_pct}%` : `Required ${s.attendance_required_pct}%`}
                  </p>
                </div>

                {/* Next up — only real upcoming data */}
                <div className="mt-3.5 grid grid-cols-2 gap-2">
                  <div className="or-inset px-2.5 py-2">
                    <p className="text-[9.5px] font-bold uppercase tracking-wide text-orbit-text-mute">Next test</p>
                    {nextTest ? (
                      <>
                        <p className="text-[12px] font-bold text-orbit-text truncate mt-0.5">{nextTest.name}</p>
                        <p className="text-[10.5px] text-orbit-text-mute">{countdownLabel(nextTest.test_date, today)}</p>
                      </>
                    ) : (
                      <p className="text-[12px] font-semibold text-orbit-text-mute mt-0.5">None scheduled</p>
                    )}
                  </div>
                  <div className="or-inset px-2.5 py-2">
                    <p className="text-[9.5px] font-bold uppercase tracking-wide text-orbit-text-mute">Open tasks</p>
                    <p className="text-[16px] font-extrabold text-orbit-text leading-none mt-1">{openTasks}</p>
                    <p className="text-[10.5px] text-orbit-text-mute mt-1">{u.resources} resource{u.resources === 1 ? '' : 's'}</p>
                  </div>
                </div>

                <div className="mt-3.5 pt-3 border-t border-orbit-border flex items-center gap-3 text-[11px] font-semibold text-orbit-text-mute">
                  <span>{u.tests} test{u.tests === 1 ? '' : 's'}</span>
                  <span>·</span>
                  <span>Avg {stats?.avgPct != null ? `${stats.avgPct}%` : '—'}</span>
                  <OrbitButton size="sm" variant="outline" className="ml-auto" onClick={() => setOpenSubject(s.id)}>Open workspace</OrbitButton>
                </div>
              </OrbitCard>
            );
          })}
        </div>
      )}

      {openSubject && (
        <SubjectWorkspace
          subjectId={openSubject}
          onClose={() => setOpenSubject(null)}
          onEdit={(s) => { setOpenSubject(null); openEditor(s); }}
        />
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit subject' : 'Add subject'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <Field label="Subject name *" error={errors.name}>
              <input className="or-input w-full px-3 py-2 text-sm" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Java Programming" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Subject code">
                <input className="or-input w-full px-3 py-2 text-sm" value={editing.code || ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="CS201" />
              </Field>
              <Field label="Faculty">
                <input className="or-input w-full px-3 py-2 text-sm" value={editing.faculty || ''} onChange={(e) => setEditing({ ...editing, faculty: e.target.value })} placeholder="Dr. Rao" />
              </Field>
              <Field label="Credits" error={errors.credits}>
                <input type="number" min="0" className="or-input w-full px-3 py-2 text-sm" value={editing.credits} onChange={(e) => setEditing({ ...editing, credits: e.target.value })} />
              </Field>
              <Field label="Semester">
                <input className="or-input w-full px-3 py-2 text-sm" value={editing.semester || ''} onChange={(e) => setEditing({ ...editing, semester: e.target.value })} placeholder="Semester 3" />
              </Field>
              <Field label="Target percentage *" error={errors.target_percentage}>
                <input type="number" min="0" max="100" className="or-input w-full px-3 py-2 text-sm" value={editing.target_percentage} onChange={(e) => setEditing({ ...editing, target_percentage: e.target.value })} />
              </Field>
              <Field label="Attendance requirement % *" error={errors.attendance_required_pct}>
                <input type="number" min="0" max="100" className="or-input w-full px-3 py-2 text-sm" value={editing.attendance_required_pct} onChange={(e) => setEditing({ ...editing, attendance_required_pct: e.target.value })} />
              </Field>
            </div>
            <Field label="Color">
              <div className="flex gap-2 flex-wrap">
                {SUBJECT_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setEditing({ ...editing, color: c })}
                    className={`w-7 h-7 rounded-lg transition-all duration-200 ${editing.color === c ? 'ring-2 ring-offset-2 ring-orbit-purple scale-110' : 'hover:scale-105'}`}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </Field>
            <Field label="Description">
              <textarea className="or-input w-full px-3 py-2 text-sm" rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 mt-4">
              <OrbitButton type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</OrbitButton>
              <OrbitButton type="submit">Save subject</OrbitButton>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete subject?"
          message={`Deleting "${confirmDelete.name}" also removes its schedule slots, tests, attendance, assignments and study sessions (database cascade). Consider editing instead.`}
          onConfirm={() => deleteRow('subjects', confirmDelete.id)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ---------------- Subject academic workspace ----------------
function SubjectWorkspace({ subjectId, onClose, onEdit }) {
  const { data, analytics, today } = useApp();
  const subject = (data?.subjects ?? []).find((s) => s.id === subjectId);
  const att = analytics?.subjectAttendance?.find((x) => x.subjectId === subjectId);
  const stats = analytics?.subjectStats?.find((x) => x.subject.id === subjectId);

  const tests = useMemo(
    () => (data?.tests ?? []).filter((t) => t.subject_id === subjectId).sort((a, b) => (a.test_date < b.test_date ? 1 : -1)),
    [data?.tests, subjectId],
  );
  const assignments = useMemo(
    () => (data?.assignments ?? []).filter((a) => a.subject_id === subjectId).sort((a, b) => (a.due_date < b.due_date ? -1 : 1)),
    [data?.assignments, subjectId],
  );
  const resources = useMemo(
    () => (data?.resources ?? []).filter((r) => r.subject_id === subjectId),
    [data?.resources, subjectId],
  );
  const classes = useMemo(
    () => (data?.schedule ?? []).filter((c) => c.subject_id === subjectId).sort((a, b) => a.day_of_week - b.day_of_week || (a.start_time < b.start_time ? -1 : 1)),
    [data?.schedule, subjectId],
  );
  const upcoming = upcomingTestsList(tests, today);
  const graded = tests.filter((t) => t.marks_obtained != null);

  if (!subject) return null;

  return (
    <div className="or-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="or-modal w-full max-w-3xl my-4">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-orbit-border">
          <span className="w-3 h-10 rounded-full shrink-0" style={{ background: subject.color }} />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-[16px] text-orbit-text leading-tight">{subject.name}</h2>
            <p className="text-[12px] text-orbit-text-mute mt-1">{[subject.code, subject.faculty, `${subject.credits} credits`, subject.semester].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <OrbitButton size="sm" variant="outline" onClick={() => onEdit(subject)}><Pencil className="w-3.5 h-3.5" strokeWidth={2.3} /> Edit</OrbitButton>
            <button className="or-iconbtn" onClick={onClose} aria-label="Close"><X className="w-4 h-4" strokeWidth={2.2} /></button>
          </div>
        </div>

        <div className="p-5 max-h-[74vh] overflow-y-auto space-y-5">
          {/* Stat strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Attendance', value: att?.pct != null ? `${att.pct}%` : '—', sub: att?.total ? `${att.present}/${att.total}` : 'No records', tone: att?.pct != null && att.pct < (subject.attendance_required_pct ?? 75) ? '#fb7185' : '#34d399' },
              { label: 'Average', value: stats?.avgPct != null ? `${stats.avgPct}%` : '—', sub: `Target ${subject.target_percentage}%`, tone: '#8b5cf6' },
              { label: 'Tests', value: String(tests.length), sub: `${graded.length} graded`, tone: '#38bdf8' },
              { label: 'Resources', value: String(resources.length), sub: `${assignments.filter((a) => a.status !== 'completed').length} open tasks`, tone: '#f59e0b' },
            ].map((s) => (
              <div key={s.label} className="or-inset px-3 py-2.5">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-orbit-text-mute">{s.label}</p>
                <p className="text-[19px] font-extrabold leading-none mt-1" style={{ color: s.tone }}>{s.value}</p>
                <p className="text-[10.5px] text-orbit-text-mute mt-1">{s.sub}</p>
              </div>
            ))}
          </div>

          {subject.description && <p className="text-[13px] text-orbit-text-soft leading-relaxed">{subject.description}</p>}

          {/* Class schedule */}
          <WsSection icon={CalendarClock} title="Weekly classes" count={classes.length}>
            {classes.length === 0 ? (
              <p className="text-[12.5px] text-orbit-text-mute">No classes scheduled for this subject.</p>
            ) : (
              <div className="space-y-1.5">
                {classes.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 text-[12.5px]">
                    <span className="font-bold text-orbit-text w-[74px] shrink-0">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][c.day_of_week]}</span>
                    <span className="text-orbit-text-mute">{c.start_time}–{c.end_time}</span>
                    {c.room && <span className="text-orbit-text-mute">· {c.room}</span>}
                    {c.faculty && <span className="text-orbit-text-mute">· {c.faculty}</span>}
                  </div>
                ))}
              </div>
            )}
          </WsSection>

          {/* Tests */}
          <WsSection icon={GraduationCap} title="Tests" count={tests.length}>
            {tests.length === 0 ? (
              <p className="text-[12.5px] text-orbit-text-mute">No tests recorded for this subject yet.</p>
            ) : (
              <div className="space-y-1.5">
                {upcoming.length > 0 && (
                  <div className="mb-2">
                    {upcoming.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-[12.5px] py-1">
                        <OrbitBadge tone="coral">{countdownLabel(t.test_date, today)}</OrbitBadge>
                        <span className="font-semibold text-orbit-text truncate">{t.name}</span>
                        <span className="text-orbit-text-mute shrink-0">{fmtDate(t.test_date)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {graded.slice(0, 6).map((t) => {
                  const pct = testPercentage(t);
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-[12.5px] py-1">
                      <span className="font-semibold text-orbit-text truncate flex-1">{t.name}</span>
                      <span className="text-orbit-text-mute shrink-0">{t.marks_obtained}/{t.max_marks}</span>
                      <span className="font-bold shrink-0 w-11 text-right" style={{ color: pct >= 80 ? '#34d399' : pct >= 60 ? '#f59e0b' : '#fb7185' }}>{pct ?? '—'}{pct != null ? '%' : ''}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </WsSection>

          {/* Assignments */}
          <WsSection icon={ClipboardList} title="Assignments" count={assignments.length}>
            {assignments.length === 0 ? (
              <p className="text-[12.5px] text-orbit-text-mute">No assignments for this subject.</p>
            ) : (
              <div className="space-y-1.5">
                {assignments.slice(0, 8).map((a) => {
                  const overdue = a.status !== 'completed' && a.due_date < today;
                  return (
                    <div key={a.id} className="flex items-center gap-2 text-[12.5px] py-1">
                      <OrbitBadge tone={a.status === 'completed' ? 'green' : overdue ? 'coral' : 'neutral'}>
                        {a.status === 'completed' ? 'Done' : overdue ? 'Overdue' : countdownLabel(a.due_date, today)}
                      </OrbitBadge>
                      <span className={`font-semibold truncate flex-1 ${a.status === 'completed' ? 'line-through text-orbit-text-mute' : 'text-orbit-text'}`}>{a.title}</span>
                      <span className="text-orbit-text-mute shrink-0">{fmtDate(a.due_date)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </WsSection>

          {/* Resources */}
          <WsSection icon={BookMarked} title="Notes & resources" count={resources.length}>
            {resources.length === 0 ? (
              <p className="text-[12.5px] text-orbit-text-mute">No saved resources for this subject.</p>
            ) : (
              <div className="space-y-1.5">
                {resources.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-[12.5px] py-1">
                    <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: subject.color }} strokeWidth={2.3} />
                    <span className="font-semibold text-orbit-text truncate flex-1">{r.title}</span>
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="or-link text-[11.5px] shrink-0">Open</a>}
                  </div>
                ))}
              </div>
            )}
          </WsSection>
        </div>
      </div>
    </div>
  );
}

function WsSection({ icon: Icon, title, count, children }) {
  return (
    <section className="pt-4 border-t border-orbit-border first:border-0 first:pt-0">
      <p className="or-kicker mb-2.5 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" strokeWidth={2.4} /> {title}
        {count > 0 && <span className="text-orbit-text-mute">· {count}</span>}
      </p>
      {children}
    </section>
  );
}
