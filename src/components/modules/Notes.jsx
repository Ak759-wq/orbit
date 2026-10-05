import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, StickyNote, ExternalLink, FileText, Video, Dumbbell, BookMarked, FileCode, Search, FolderOpen } from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader, Modal, Field, ConfirmDialog } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitEmptyState, OrbitSection } from '../orbit/Orbit.jsx';
import { validateResource } from '../../lib/validate.js';
import { RESOURCE_TYPES, labelOf } from '../../lib/constants.js';
import { todayISO, fmtDate } from '../../lib/datetime.js';

const EMPTY = { title: '', resource_type: 'note', subject_id: '', url: '', content: '', description: '', date_added: todayISO() };

const TYPE_ICON = { note: StickyNote, link: ExternalLink, document: FileText, video: Video, practice: Dumbbell, reference: BookMarked };
const TYPE_TONE = { note: 'purple', link: 'blue', document: 'coral', video: 'green', practice: 'orange', reference: 'lavender' };

export default function Notes() {
  const { data, insertRow, updateRow, deleteRow } = useApp();
  const subjects = data?.subjects ?? [];
  const resources = data?.resources ?? [];
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterType, setFilterType] = useState('');
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState({});

  const subjName = (id) => subjects.find((s) => s.id === id)?.name || null;
  const subjColor = (id) => subjects.find((s) => s.id === id)?.color || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...resources]
      .filter((r) => (!filterSubject || String(r.subject_id) === filterSubject) && (!filterType || r.resource_type === filterType))
      .filter((r) => !q || [r.title, r.description, r.content, r.url].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .sort((a, b) => (a.date_added < b.date_added ? 1 : -1));
  }, [resources, filterSubject, filterType, query]);

  // Grouped by subject so the library reads like a real shelf structure.
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of filtered) {
      const key = r.subject_id ?? 'none';
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    }
    return [...m.entries()]
      .map(([key, list]) => ({
        key,
        name: key === 'none' ? 'General' : subjName(Number(key)) || 'Unknown subject',
        color: key === 'none' ? '#94a3b8' : subjColor(Number(key)),
        list,
      }))
      .sort((a, b) => b.list.length - a.list.length);
  }, [filtered]);

  const typeCounts = useMemo(() => {
    const m = {};
    for (const r of filtered) m[r.resource_type] = (m[r.resource_type] || 0) + 1;
    return m;
  }, [filtered]);

  const save = async (e) => {
    e.preventDefault();
    const rec = { ...editing, subject_id: editing.subject_id ? Number(editing.subject_id) : null };
    const { ok, errors: errs } = validateResource(rec);
    setErrors(errs);
    if (!ok) return;
    const row = { ...rec };
    delete row.id;
    if (editing.id) await updateRow('resources', editing.id, row);
    else await insertRow('resources', row);
    setEditing(null);
    setErrors({});
  };

  const openEditor = (r) => { setEditing(r ? { ...r } : { ...EMPTY }); setErrors({}); };

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="NOTES & RESOURCES"
        title="Notes & Resources"
        sub="Your academic library — notes, links, documents, videos and practice sets per subject."
        actions={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add resource</OrbitButton>}
      />

      {!resources.length ? (
        <OrbitCard>
          <OrbitEmptyState
            icon={StickyNote}
            title="No notes or resources yet"
            sub="Save lecture notes, important links, videos and practice material — organized by subject."
            action={<OrbitButton onClick={() => openEditor(null)}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add your first resource</OrbitButton>}
          />
        </OrbitCard>
      ) : (
        <>
          {/* ---- Search + filters ---- */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="or-search flex-1 min-w-[220px]">
              <Search className="w-4 h-4 shrink-0" strokeWidth={2.3} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search titles, notes and links…"
                className="bg-transparent outline-none w-full text-[13px] placeholder:text-orbit-text-mute"
              />
            </div>
            <select className="or-input px-3 py-2 text-xs font-semibold" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="or-input px-3 py-2 text-xs font-semibold" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* ---- Type legend with real counts ---- */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {RESOURCE_TYPES.filter((t) => typeCounts[t.value]).map((t) => (
              <button
                key={t.value}
                onClick={() => setFilterType(filterType === t.value ? '' : t.value)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold transition-all duration-200 ${filterType === t.value ? 'bg-orbit-purple text-white' : 'text-orbit-text-mute hover:bg-orbit-bg'}`}
              >
                {t.label}
                <span className={`px-1.5 rounded-md ${filterType === t.value ? 'bg-white/20' : 'bg-orbit-bg'}`}>{typeCounts[t.value]}</span>
              </button>
            ))}
            <span className="ml-auto text-[12px] font-semibold text-orbit-text-mute">{filtered.length} resource{filtered.length === 1 ? '' : 's'}</span>
          </div>

          {/* ---- Library, grouped by subject ---- */}
          {groups.length === 0 ? (
            <OrbitCard>
              <OrbitEmptyState icon={Search} title="No resources match" sub="Try a different search term or clear the filters." compact />
            </OrbitCard>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <OrbitSection
                  key={g.key}
                  icon={FolderOpen}
                  title={g.name}
                  sub={`${g.list.length} item${g.list.length === 1 ? '' : 's'}`}
                  bodyClass="p-3 md:p-4"
                  action={<span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {g.list.map((r) => {
                      const Icon = TYPE_ICON[r.resource_type] || FileCode;
                      return (
                        <article key={r.id} className="or-inset p-3.5 transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_24px_-14px_rgba(28,27,46,.35)]">
                          <div className="flex items-start gap-2.5">
                            <span className={`or-icon-chip or-icon-chip-sm or-tone-${TYPE_TONE[r.resource_type] || 'neutral'} shrink-0`}>
                              <Icon className="w-[18px] h-[18px]" strokeWidth={2.2} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13.5px] font-bold text-orbit-text leading-tight">{r.title}</p>
                              <p className="text-[11px] text-orbit-text-mute mt-1">
                                {labelOf(RESOURCE_TYPES, r.resource_type)} · added {fmtDate(r.date_added, { day: 'numeric', month: 'short' })}
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => openEditor(r)} title="Edit"><Pencil className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                              <button className="or-iconbtn or-iconbtn-bordered w-7 h-7" onClick={() => setConfirmDelete(r)} title="Delete"><Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} /></button>
                            </div>
                          </div>
                          {r.description && <p className="text-[12.5px] text-orbit-text-soft mt-2.5 leading-relaxed">{r.description}</p>}
                          {r.content && <p className="text-[12px] text-orbit-text-soft mt-2.5 p-2.5 rounded-xl bg-orbit-surface whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">{r.content}</p>}
                          {r.url && (
                            <a href={r.url} target="_blank" rel="noreferrer" className="or-link text-[11.5px] mt-2.5 inline-flex items-center gap-1 break-all">
                              Open resource <ExternalLink className="w-3 h-3 shrink-0" strokeWidth={2.4} />
                            </a>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </OrbitSection>
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit resource' : 'Add resource'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <Field label="Title *" error={errors.title}>
              <input className="or-input w-full px-3 py-2 text-sm" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Java collections cheat sheet" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.resource_type} onChange={(e) => setEditing({ ...editing, resource_type: e.target.value })}>
                  {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Subject">
                <select className="or-input w-full px-3 py-2 text-sm" value={editing.subject_id ?? ''} onChange={(e) => setEditing({ ...editing, subject_id: e.target.value })}>
                  <option value="">None</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
            {editing.resource_type !== 'note' && (
              <Field label="URL *" error={errors.url}>
                <input className="or-input w-full px-3 py-2 text-sm" value={editing.url || ''} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://…" />
              </Field>
            )}
            <Field label="Description">
              <input className="or-input w-full px-3 py-2 text-sm" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <Field label="Note content (for notes)">
              <textarea className="or-input w-full px-3 py-2 text-sm" rows={4} value={editing.content || ''} onChange={(e) => setEditing({ ...editing, content: e.target.value })} placeholder="Write or paste your notes…" />
            </Field>
            <div className="flex justify-end gap-2 mt-4">
              <OrbitButton type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</OrbitButton>
              <OrbitButton type="submit">Save resource</OrbitButton>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog title="Delete resource?" message={`Remove "${confirmDelete.title}"?`} onConfirm={() => deleteRow('resources', confirmDelete.id)} onClose={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}
