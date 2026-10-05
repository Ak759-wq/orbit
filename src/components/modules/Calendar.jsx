import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Upload, Download, CalendarClock, FileJson, AlertTriangle } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader, Modal, Field, TabBar, ConfirmDialog } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitEmptyState, OrbitBadge, toneHex } from '../orbit/Orbit.jsx';
import { validateEvent, parseCalendarImport } from '../../lib/validate.js';
import { EVENT_TYPES, PRIORITIES, labelOf } from '../../lib/constants.js';
import { todayISO, fmtDate, countdownLabel, monthGrid, monthName, addDaysISO, daysBetween } from '../../lib/datetime.js';
import { parseCSV, downloadCSV } from '../../lib/csv.js';
import { ACADEMIC_CALENDAR_TENTATIVE } from '../../website/seedData.js';
import { isRealDate, DATELESS_EVENT_DATE } from '../../lib/calc.js';

const EMPTY = { title: '', event_type: 'other', start_date: todayISO(), end_date: todayISO(), description: '', subject_id: '', priority: 'normal' };

// Each academic event type gets its own semantic colour so holidays,
// assessments, marks freezing, meetings and exams read differently.
const TYPE_TONE = {
  holiday: 'coral',
  exam: 'purple',
  midsem: 'purple',
  endsem: 'purple',
  internal: 'coral',
  practical: 'lavender',
  semester_start: 'green',
  semester_end: 'green',
  assignment: 'orange',
  project: 'orange',
  college_event: 'blue',
  break: 'mint',
  other: 'neutral',
};

const typeTone = (t) => TYPE_TONE[t] || 'neutral';

export default function Calendar() {
  const { data, insertRow, updateRow, deleteRow, today } = useApp();
  const subjects = data?.subjects ?? [];
  const events = data?.events ?? [];
  const [view, setView] = useState('timeline');
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterType, setFilterType] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [monthRef, setMonthRef] = useState(today);
  const [importOpen, setImportOpen] = useState(false);
  const [errors, setErrors] = useState({});

  // Quick Action hand-off from the Dashboard: open the create modal once.
  useEffect(() => {
    if (sessionStorage.getItem('orbit-quick-add') === 'calendar') {
      sessionStorage.removeItem('orbit-quick-add');
      setEditing({ ...EMPTY });
    }
  }, []);

  const subjName = (id) => subjects.find((s) => s.id === id)?.name || null;

  const filtered = useMemo(() =>
    events.filter((e) => (!filterType || e.event_type === filterType) && (!filterSubject || String(e.subject_id) === filterSubject)),
    [events, filterType, filterSubject]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => (a.start_date < b.start_date ? -1 : 1)), [filtered]);
  const upcoming = sorted.filter((e) => e.end_date >= today);
  const past = sorted.filter((e) => e.end_date < today).reverse();

  const grid = useMemo(() => monthGrid(monthRef), [monthRef]);
  const eventsOn = (iso) => sorted.filter((e) => e.start_date <= iso && e.end_date >= iso);

  // Upcoming events grouped by month for the Timeline view.
  const timelineMonths = useMemo(() => {
    const m = new Map();
    for (const e of upcoming) {
      if (!isRealDate(e.start_date)) continue;
      const key = e.start_date.slice(0, 7);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(e);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [upcoming]);

  const undatedCount = upcoming.filter((e) => !isRealDate(e.start_date)).length;

  const save = async (e) => {
    e.preventDefault();
    const rec = { ...editing, subject_id: editing.subject_id ? Number(editing.subject_id) : null };
    const { ok, errors: errs } = validateEvent(rec);
    setErrors(errs);
    if (!ok) return;
    delete rec.id;
    if (editing.id) await updateRow('academic_events', editing.id, rec);
    else await insertRow('academic_events', rec);
    setEditing(null);
    setErrors({});
  };

  return (
    <div>
      <PageHeader
        kicker="ACADEMIC CALENDAR"
        title="Academic Calendar"
        sub="Deadlines, exams and holidays — countdowns and dashboard items flow from here."
        actions={(
          <>
            <OrbitButton variant="outline" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4" strokeWidth={2.2} /> Import</OrbitButton>
            <OrbitButton variant="outline" onClick={() => exportEvents(sorted, subjName)}><Download className="w-4 h-4" strokeWidth={2.2} /> Export</OrbitButton>
            <OrbitButton onClick={() => { setEditing({ ...EMPTY }); setErrors({}); }}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add event</OrbitButton>
          </>
        )}
      />

      {!events.length ? (
        <OrbitCard>
          <OrbitEmptyState
            icon={CalendarClock}
            title="No academic events yet"
            sub="Add semester dates, exams, holidays and deadlines — or import them from CSV/JSON."
            action={<OrbitButton onClick={() => setEditing({ ...EMPTY })}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add your first event</OrbitButton>}
          />
        </OrbitCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <TabBar tabs={[{ value: 'timeline', label: 'Timeline' }, { value: 'month', label: 'Calendar' }]} active={view} onChange={setView} />
            <select className="or-input px-3 py-2 text-xs font-semibold" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className="or-input px-3 py-2 text-xs font-semibold" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <span className="ml-auto text-[12px] text-orbit-text-mute font-semibold">{upcoming.length} upcoming · {past.length} past</span>
          </div>

          {undatedCount > 0 && (
            <div className="or-inset flex items-start gap-2.5 px-4 py-3 mb-4" style={{ background: '#312e81', borderColor: '#4338ca' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f59e0b' }} strokeWidth={2.3} />
              <p className="text-[12.5px] text-orbit-text-soft leading-relaxed">
                <b>{undatedCount} event{undatedCount === 1 ? '' : 's'}</b> {undatedCount === 1 ? 'has' : 'have'} no confirmed date yet
                {undatedCount === 1 ? ' (' + DATELESS_EVENT_DATE + ').' : '.'} They're listed under “Dates to be announced” rather than guessed into the timeline.
              </p>
            </div>
          )}

          {view === 'month' ? (
            <OrbitCard className="mb-6 overflow-hidden">
              <div className="or-card-head">
                <span className="or-icon-chip or-icon-chip-sm or-tone-purple"><CalendarClock className="w-[18px] h-[18px]" strokeWidth={2.2} /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-[15.5px] text-orbit-text leading-tight">{monthName(monthRef)}</h2>
                  <p className="text-[12px] text-orbit-text-mute mt-0.5">Every entry colour-codes its academic type.</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button className="or-iconbtn or-iconbtn-bordered w-8 h-8 rounded-lg" onClick={() => setMonthRef(addDaysISO(monthRef, -28))} aria-label="Previous month">←</button>
                  <button className="or-iconbtn or-iconbtn-bordered w-8 h-8 rounded-lg" onClick={() => setMonthRef(addDaysISO(monthRef, 28))} aria-label="Next month">→</button>
                </div>
              </div>
              <div className="px-4 pb-4">
                <div className="grid grid-cols-7 gap-1 mb-1.5">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-orbit-text-mute py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {grid.flat().map((iso) => {
                    const inMonth = iso.slice(0, 7) === monthRef.slice(0, 7);
                    const dayEvents = eventsOn(iso);
                    const isToday = iso === today;
                    return (
                      <div
                        key={iso}
                        className={`or-month-cell ${isToday ? 'today' : ''} ${inMonth ? '' : 'dim'}`}
                      >
                        <p className={`text-[10.5px] font-bold text-right px-0.5 ${isToday ? 'text-orbit-purple' : inMonth ? 'text-orbit-text-soft' : 'text-orbit-text-mute/50'}`}>
                          {Number(iso.slice(8))}
                        </p>
                        <div className="mt-1 space-y-0.5">
                          {dayEvents.slice(0, 3).map((ev) => (
                            <span key={ev.id} className="or-month-pill" style={{ background: `${toneHex(typeTone(ev.event_type))}1f`, color: toneHex(typeTone(ev.event_type)) }} title={ev.title}>
                              {ev.title}
                            </span>
                          ))}
                          {dayEvents.length > 3 && <p className="text-[9px] font-bold text-orbit-text-mute px-1">+{dayEvents.length - 3} more</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-3.5 mt-3 border-t border-orbit-border">
                  {[...new Set(sorted.map((e) => e.event_type))].slice(0, 8).map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-orbit-text-mute">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: toneHex(typeTone(t)) }} />
                      {labelOf(EVENT_TYPES, t)}
                    </span>
                  ))}
                </div>
              </div>
            </OrbitCard>
          ) : (
            timelineMonths.length === 0 ? (
              <OrbitCard>
                <OrbitEmptyState icon={CalendarClock} title="No dated events match your filters" sub="Try clearing a filter, or add an event with a confirmed date." />
              </OrbitCard>
            ) : (
              <div className="space-y-5">
                {timelineMonths.map(([ym, list]) => (
                  <section key={ym}>
                    <p className="or-kicker mb-2.5">{monthName(`${ym}-01`)}</p>
                    <div className="or-timeline">
                      {list.map((e) => (
                        <EventRow key={e.id} e={e} subjName={subjName(e.subject_id)} today={today} onEdit={() => setEditing({ ...e })} onDelete={() => setConfirmDelete(e)} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )
          )}

          {/* Events whose dates are not yet confirmed — never given invented dates. */}
          {(ACADEMIC_CALENDAR_TENTATIVE.length > 0 || undatedCount > 0) && (
            <section className="mt-8">
              <p className="or-kicker mb-2.5">Dates to be announced</p>
              <div className="space-y-2">
                {ACADEMIC_CALENDAR_TENTATIVE.map((e) => (
                  <OrbitCard key={e.title} className="px-4 py-3 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-orbit-text">{e.title}</p>
                      <p className="text-[11.5px] text-orbit-text-mute mt-0.5">{e.semester} · {e.relative}</p>
                    </div>
                    <OrbitBadge tone="orange">Tentative</OrbitBadge>
                  </OrbitCard>
                ))}
                {upcoming.filter((e) => !isRealDate(e.start_date)).map((e) => (
                  <EventRow key={e.id} e={e} subjName={subjName(e.subject_id)} today={today} undated onEdit={() => setEditing({ ...e })} onDelete={() => setConfirmDelete(e)} />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && view === 'timeline' && (
            <section className="mt-8">
              <p className="or-kicker mb-2.5">Past events</p>
              <div className="or-timeline opacity-70">
                {past.slice(0, 8).map((e) => (
                  <EventRow key={e.id} e={e} subjName={subjName(e.subject_id)} today={today} onEdit={() => setEditing({ ...e })} onDelete={() => setConfirmDelete(e)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit event' : 'Add event'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <Field label="Event name *" error={errors.title}>
              <input className="or-input w-full px-3 py-2 text-sm" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Java Internal Test" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Event type" error={errors.event_type}>
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.event_type} onChange={(e) => setEditing({ ...editing, event_type: e.target.value })}>
                  {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Start date *" error={errors.start_date}>
                <input type="date" className="or-input w-full px-3 py-2 text-sm" value={editing.start_date} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} />
              </Field>
              <Field label="End date *" error={errors.end_date}>
                <input type="date" className="or-input w-full px-3 py-2 text-sm" value={editing.end_date} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Related subject (optional)">
              <select className="or-input w-full px-3 py-2 text-sm" value={editing.subject_id ?? ''} onChange={(e) => setEditing({ ...editing, subject_id: e.target.value })}>
                <option value="">None</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <textarea className="or-input w-full px-3 py-2 text-sm" rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 mt-4">
              <OrbitButton type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</OrbitButton>
              <OrbitButton type="submit">Save event</OrbitButton>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog title="Delete event?" message={`Remove "${confirmDelete.title}"?`} onConfirm={() => deleteRow('academic_events', confirmDelete.id)} onClose={() => setConfirmDelete(null)} />
      )}

      {importOpen && <ImportDialog subjects={subjects} onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function EventRow({ e, subjName, today, undated, onEdit, onDelete }) {
  const tone = typeTone(e.event_type);
  const isPast = !undated && e.end_date < today;
  const live = !undated && e.start_date <= today && e.end_date >= today;
  const left = undated ? null : daysBetween(today, e.start_date);
  return (
    <div className="or-timeline-item">
      <span className={`or-timeline-dot or-tone-${tone}`} />
      <div className={`min-w-0 flex-1 rounded-xl border px-3 py-2.5 transition-all duration-200 ${live ? 'border-orbit-purple/40' : 'border-orbit-border bg-orbit-surface'} ${isPast ? 'opacity-65' : ''}`} style={live ? { boxShadow: '0 6px 20px -10px rgba(109,92,232,.5)' } : undefined}>
        <div className="flex items-start gap-3">
          {!undated && (
            <div className="shrink-0 w-[46px] rounded-xl py-1 text-center" style={{ background: `${toneHex(tone)}1a` }}>
              <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: toneHex(tone) }}>{fmtDate(e.start_date, { month: 'short' })}</p>
              <p className="text-[16px] font-extrabold leading-none" style={{ color: toneHex(tone) }}>{Number(e.start_date.slice(8))}</p>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold text-orbit-text truncate">{e.title}</p>
            <p className="text-[11.5px] text-orbit-text-mute mt-0.5 truncate">
              {labelOf(EVENT_TYPES, e.event_type)}
              {e.start_date !== e.end_date ? ` · ${fmtDate(e.start_date, { day: 'numeric', month: 'short' })} → ${fmtDate(e.end_date, { day: 'numeric', month: 'short' })}` : ''}
              {subjName ? ` · ${subjName}` : ''}
              {e.priority === 'high' ? ' · High priority' : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {undated ? (
              <OrbitBadge tone="orange">Date TBA</OrbitBadge>
            ) : isPast ? (
              <OrbitBadge tone="neutral">Passed</OrbitBadge>
            ) : live ? (
              <OrbitBadge tone="purple"><span className="or-live-dot" /> Happening</OrbitBadge>
            ) : (
              <OrbitBadge tone={left != null && left <= 7 ? 'coral' : tone}>{countdownLabel(e.start_date, today)}</OrbitBadge>
            )}
            <div className="flex gap-1">
              <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={onEdit} title="Edit"><Pencil className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
              <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={onDelete} title="Delete"><Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function exportEvents(events, subjName) {
  downloadCSV('academic-calendar.csv',
    ['Title', 'Type', 'Start Date', 'End Date', 'Priority', 'Subject', 'Description'],
    events.map((e) => [e.title, e.event_type, e.start_date, e.end_date, e.priority, subjName(e.subject_id) || '', e.description || '']));
}

// ---------------- Import ----------------
function ImportDialog({ subjects, onClose }) {
  const { insertMany, flash } = useApp();
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null); // { valid, invalid }
  const [error, setError] = useState(null);

  const handleText = (text, name) => {
    try {
      let rows;
      if (name.endsWith('.json')) {
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) throw new Error('JSON must be an array of event objects.');
        rows = arr.map((o) => ({
          title: o.title ?? o.name, event_type: o.event_type ?? o.type,
          start_date: o.start_date ?? o.date, end_date: o.end_date,
          priority: o.priority, subject: o.subject, description: o.description,
        }));
      } else {
        rows = parseCSV(text);
      }
      setParsed(parseCalendarImport(rows, subjects));
    } catch (e) {
      setError(e.message || 'Could not parse the file.');
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => handleText(String(reader.result || ''), file.name);
    reader.readAsText(file);
  };

  const commit = async () => {
    if (!parsed?.valid?.length) return;
    await insertMany('academic_events', parsed.valid);
    flash(`Imported ${parsed.valid.length} event${parsed.valid.length === 1 ? '' : 's'}.`);
    onClose();
  };

  return (
    <Modal wide title="Import academic calendar" onClose={onClose}>
      <p className="text-[13.5px] text-orbit-text-soft mb-3 leading-relaxed">
        Upload <b>CSV</b> or <b>JSON</b>. Columns: <code className="text-[11px]">title, type, start_date, end_date, priority, subject, description</code>. Dates as YYYY-MM-DD. Rows are validated before anything is saved.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <OrbitButton variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4" strokeWidth={2.2} /> Choose file</OrbitButton>
        <OrbitButton variant="outline" onClick={() => downloadCSV('calendar-template.csv', ['title', 'type', 'start_date', 'end_date', 'priority', 'subject', 'description'], [['Quiz 1', 'internal', '2026-10-02', '2026-10-02', 'high', 'Java Programming', 'Units 1-3']])}>
          <FileJson className="w-4 h-4" strokeWidth={2.2} /> Download template
        </OrbitButton>
        <input ref={fileRef} type="file" accept=".csv,.json,.txt" className="hidden" onChange={onFile} />
      </div>
      {error && <p className="text-[12.5px] font-semibold text-orbit-coral mb-3">{error}</p>}
      {parsed && (
        <div>
          <p className="text-[13.5px] font-bold mb-2 text-orbit-text">{parsed.valid.length} valid · {parsed.invalid.length} invalid</p>
          {parsed.invalid.length > 0 && (
            <div className="or-inset p-3 mb-3 max-h-40 overflow-y-auto">
              {parsed.invalid.map((r) => (
                <p key={r.row} className="text-[12px] text-orbit-coral font-semibold">Row {r.row}: {Object.values(r.errors).join(' ')}</p>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <OrbitButton variant="outline" onClick={() => setParsed(null)}>Pick another file</OrbitButton>
            <OrbitButton disabled={!parsed.valid.length} onClick={commit}>Import {parsed.valid.length} event{parsed.valid.length === 1 ? '' : 's'}</OrbitButton>
          </div>
        </div>
      )}
    </Modal>
  );
}
