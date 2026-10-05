import { useMemo, useState } from 'react';
import {
  Plus, Search, Trophy, CalendarDays, ExternalLink, LayoutList,
  Bookmark, BookmarkCheck, Sparkles, Pencil, Trash2, Loader2, MapPin,
} from 'lucide-react';
import { useApp } from '../../state/AppContext.jsx';
import { PageHeader, Modal, Field, ConfirmDialog, TabBar } from '../ui.jsx';
import { OrbitButton, OrbitCard, OrbitEmptyState, OrbitBadge, OrbitCalendar, toneHex } from '../orbit/Orbit.jsx';
import { EVENT_DB_TYPES, MODES, eventStatus, deadlineLabel, TRACK_STATUSES, nextTrackStatus } from '../../lib/events.js';
import { fmtDate, countdownLabel, todayISO } from '../../lib/datetime.js';
import { getUpcomingUserEvents } from '../../lib/queries.js';

const EMPTY = {
  title: '', event_type: 'Hackathon', organizer: '', description: '',
  start_date: '', end_date: '', reg_deadline: '', location: '', mode: 'Online',
  reg_url: '', eligibility: '', prize: '', tags: '', user_notes: '',
};

// Map the real eventStatus() labels onto Orbit tones for chips and dots.
const STATUS_TO_TONE = {
  'Registration Open': 'green',
  'Registration Closing Soon': 'orange',
  'Registration Closed': 'neutral',
  'Event Started': 'purple',
  'Upcoming': 'blue',
  'Completed': 'neutral',
};

export default function Events() {
  const { data, insertRow, updateRow, deleteRow, flash, session, today } = useApp();
  const events = data?.hackathons ?? [];
  const bookmarks = data?.bookmarks ?? [];
  const [tab, setTab] = useState('all');
  const [view, setView] = useState('list');
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [detail, setDetail] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);

  const bookmarkByEvent = useMemo(() => {
    const m = new Map();
    for (const b of bookmarks) m.set(b.event_id, b);
    return m;
  }, [bookmarks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...events]
      .filter((e) => (tab === 'saved' ? bookmarkByEvent.has(e.id) : true))
      .filter((e) => (!filterType || e.event_type === filterType))
      .filter((e) => (!filterMode || e.mode === filterMode))
      .filter((e) => (!q
        || (e.title || '').toLowerCase().includes(q)
        || (e.organizer || '').toLowerCase().includes(q)
        || (e.description || '').toLowerCase().includes(q)
        || (e.tags || []).some((t) => t.toLowerCase().includes(q))
        || (e.skills || []).some((t) => t.toLowerCase().includes(q))))
      .sort((a, b) => (a.start_date || '9999') < (b.start_date || '9999') ? -1 : 1);
  }, [events, tab, query, filterType, filterMode, bookmarkByEvent]);

  // Calendar dots come from real dates only — undated events are excluded.
  const calItems = useMemo(() => filtered
    .filter((e) => e.start_date)
    .map((e) => ({ id: e.id, date: e.start_date, title: e.title, color: toneHex(STATUS_TO_TONE[eventStatus(e)] || 'neutral') })),
    [filtered]);

  const saveEvent = async (rec, id) => {
    const row = normalizeEvent(rec);
    if (id) await updateRow('events', id, row);
    else await insertRow('events', row);
  };

  const toggleSave = async (e) => {
    const existing = bookmarkByEvent.get(e.id);
    if (existing) {
      await deleteRow('event_bookmarks', existing.id);
      flash('Removed from My Events.');
    } else {
      await insertRow('event_bookmarks', { event_id: e.id, track_status: 'Interested' });
      flash('Saved to My Events.');
    }
  };

  const cycleTrack = async (e) => {
    const existing = bookmarkByEvent.get(e.id);
    if (!existing) return;
    await updateRow('event_bookmarks', existing.id, { track_status: nextTrackStatus(existing.track_status) });
  };

  // This module owns user-created events only (the official Academic
  // Calendar lives on its own page), but it uses the SAME qualifying
  // rule as the Dashboard's merged Upcoming Events card: not ended yet,
  // real dates only, undated sentinels excluded.
  const upcomingCount = useMemo(() => getUpcomingUserEvents(filtered, today).length, [filtered, today]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="HACKATHONS & UPCOMING EVENTS"
        title="Upcoming Events"
        sub="Hackathons, coding contests, workshops, conferences and campus events — deadlines calculated live."
        actions={(
          <>
            <OrbitButton variant="outline" onClick={() => setAiOpen(true)}>
              <Sparkles className="w-4 h-4" strokeWidth={2.2} /> Import Event with AI
            </OrbitButton>
            <OrbitButton onClick={() => setEditing({ ...EMPTY })}>
              <Plus className="w-4 h-4" strokeWidth={2.4} /> Add Event
            </OrbitButton>
          </>
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <TabBar
          active={tab}
          onChange={setTab}
          tabs={[{ value: 'all', label: `All (${events.length})` }, { value: 'saved', label: `My Events (${bookmarkByEvent.size})` }]}
        />
        <TabBar
          active={view}
          onChange={setView}
          tabs={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]}
        />
        <div className="or-search w-52">
          <Search className="w-3.5 h-3.5 shrink-0" strokeWidth={2.3} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events…"
            className="bg-transparent outline-none w-full text-[12.5px] placeholder:text-orbit-text-mute"
          />
        </div>
        <select className="or-input px-3 py-2 text-xs font-semibold" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {EVENT_DB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="or-input px-3 py-2 text-xs font-semibold" value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
          <option value="">All modes</option>
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="ml-auto text-[12px] font-semibold text-orbit-text-mute">{filtered.length} event{filtered.length === 1 ? '' : 's'} · {upcomingCount} upcoming</span>
      </div>

      {!events.length ? (
        <OrbitCard>
          <OrbitEmptyState
            icon={Trophy}
            title="No events yet"
            sub="Add hackathons and events manually, or paste any event page URL and let AI extract the details for your review."
            action={(
              <div className="flex gap-2 justify-center">
                <OrbitButton onClick={() => setEditing({ ...EMPTY })}><Plus className="w-4 h-4" strokeWidth={2.4} /> Add Event</OrbitButton>
                <OrbitButton variant="outline" onClick={() => setAiOpen(true)}><Sparkles className="w-4 h-4" strokeWidth={2.2} /> Import with AI</OrbitButton>
              </div>
            )}
          />
        </OrbitCard>
      ) : !filtered.length ? (
        <OrbitCard><OrbitEmptyState icon={Search} title="No events match" sub="Try clearing the search or filters." compact /></OrbitCard>
      ) : view === 'calendar' ? (
        <OrbitCard className="overflow-hidden">
          <div className="or-card-head">
            <span className="or-icon-chip or-icon-chip-sm or-tone-purple"><CalendarDays className="w-[18px] h-[18px]" strokeWidth={2.2} /></span>
            <div className="min-w-0">
              <h2 className="font-bold text-[15.5px] text-orbit-text leading-tight">Event calendar</h2>
              <p className="text-[12px] text-orbit-text-mute mt-0.5">{calItems.length} event{calItems.length === 1 ? '' : 's'} with a confirmed date.</p>
            </div>
          </div>
          <OrbitCalendar
            initialMonth={today}
            today={today}
            items={calItems}
            legend={[
              { label: 'Registration open', color: toneHex('green') },
              { label: 'Closing soon', color: toneHex('orange') },
              { label: 'Started', color: toneHex('purple') },
              { label: 'Closed / completed', color: toneHex('neutral') },
            ]}
          />
          <div className="px-4 py-3 border-t border-orbit-border">
            <p className="text-[11px] text-orbit-text-mute">
              {events.length - calItems.length} event{events.length - calItems.length === 1 ? '' : 's'} without a confirmed date — switch to List view to see them.
            </p>
          </div>
        </OrbitCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {filtered.map((e) => (
            <EventCard
              key={e.id}
              e={e}
              bookmark={bookmarkByEvent.get(e.id)}
              onOpen={() => setDetail(e)}
              onToggleSave={() => toggleSave(e)}
              onCycleTrack={() => cycleTrack(e)}
            />
          ))}
        </div>
      )}

      {editing && (
        <EventForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (rec) => { await saveEvent(rec, editing.id); setEditing(null); }}
        />
      )}

      {detail && (
        <EventDetail
          e={detail}
          bookmark={bookmarkByEvent.get(detail.id)}
          onToggleSave={() => toggleSave(detail)}
          onCycleTrack={() => cycleTrack(detail)}
          onEdit={() => { setEditing({ ...detail, tags: (detail.tags || []).join(', ') }); setDetail(null); }}
          onNotes={async (notes) => { await updateRow('events', detail.id, { user_notes: notes }); setDetail({ ...detail, user_notes: notes }); }}
          onDelete={() => { setConfirmDelete(detail); setDetail(null); }}
          onClose={() => setDetail(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog title="Delete event?" message={`Remove "${confirmDelete.title}"?`} onConfirm={() => deleteRow('events', confirmDelete.id)} onClose={() => setConfirmDelete(null)} />
      )}

      {aiOpen && <AiImportDialog onClose={() => setAiOpen(false)} onSave={saveEvent} session={session} />}
    </div>
  );
}

// ------------------------------------------------------------------
function EventCard({ e, bookmark, onOpen, onToggleSave, onCycleTrack }) {
  const status = eventStatus(e);
  const dl = deadlineLabel(e);
  return (
    <OrbitCard hover className="p-4 flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpen}>
          <p className="text-[14px] font-bold text-orbit-text leading-tight hover:text-orbit-purple transition-colors duration-200">{e.title}</p>
          <p className="text-[11.5px] text-orbit-text-mute mt-1 flex items-center gap-1.5">
            <MapPin className="w-3 h-3 shrink-0" strokeWidth={2.4} />
            {e.organizer || 'Organizer not specified'} · {e.mode}{e.location ? ` · ${e.location}` : ''}
          </p>
        </div>
        <button
          onClick={onToggleSave}
          className="or-iconbtn or-iconbtn-bordered w-8 h-8 shrink-0"
          style={bookmark ? { background: '#4c1d95', borderColor: '#6d28d9' } : undefined}
          title={bookmark ? `Saved — ${bookmark.track_status}. Click to remove.` : 'Save to My Events'}
        >
          {bookmark ? <BookmarkCheck className="w-4 h-4" style={{ color: '#b8860b' }} strokeWidth={2.3} /> : <Bookmark className="w-4 h-4" strokeWidth={2.3} />}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <OrbitBadge tone={STATUS_TO_TONE[status] || 'neutral'}>{status}</OrbitBadge>
        <OrbitBadge tone="neutral">{e.event_type}</OrbitBadge>
        {dl && (
          <OrbitBadge tone={dl.startsWith('Registration closes') && !dl.includes('closed') ? 'coral' : 'neutral'}>{dl}</OrbitBadge>
        )}
        {e.ai_extracted && <OrbitBadge tone="purple">AI imported</OrbitBadge>}
      </div>

      {e.start_date && (
        <p className="text-[12px] font-semibold text-orbit-text-soft flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" strokeWidth={2.3} />
          {fmtDate(e.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}
          {e.end_date && e.end_date !== e.start_date ? ` → ${fmtDate(e.end_date, { day: 'numeric', month: 'short' })}` : ''}
          <span className="text-orbit-text-mute">· {countdownLabel(e.start_date)}</span>
        </p>
      )}

      {e.description && <p className="text-[12.5px] text-orbit-text-soft leading-relaxed line-clamp-2">{e.description}</p>}

      <div className="flex items-center gap-2 mt-auto pt-1">
        {bookmark && (
          <button onClick={onCycleTrack} title="Click to change tracking status">
            <OrbitBadge tone="yellow">{bookmark.track_status} ↻</OrbitBadge>
          </button>
        )}
        {e.reg_url && (
          <a href={e.reg_url} target="_blank" rel="noreferrer">
            <OrbitBadge tone="green">Register <ExternalLink className="w-3 h-3" strokeWidth={2.5} /></OrbitBadge>
          </a>
        )}
        <button onClick={onOpen} className="or-link text-[11.5px] ml-auto inline-flex items-center gap-1">
          Details <LayoutList className="w-3 h-3" strokeWidth={2.5} />
        </button>
      </div>
    </OrbitCard>
  );
}

// ------------------------------------------------------------------
function EventDetail({ e, bookmark, onToggleSave, onCycleTrack, onEdit, onNotes, onDelete, onClose }) {
  const [notes, setNotes] = useState(e.user_notes || '');
  const status = eventStatus(e);
  const dl = deadlineLabel(e);
  return (
    <Modal wide title={e.title} onClose={onClose}>
      <div className="flex flex-wrap gap-1.5 mb-4">
        <OrbitBadge tone={STATUS_TO_TONE[status] || 'neutral'}>{status}</OrbitBadge>
        <OrbitBadge tone="neutral">{e.event_type}</OrbitBadge>
        <OrbitBadge tone="neutral">{e.mode}</OrbitBadge>
        {dl && <OrbitBadge tone="neutral">{dl}</OrbitBadge>}
        {e.ai_extracted && <OrbitBadge tone="purple">Imported using AI</OrbitBadge>}
      </div>
      <dl className="space-y-2">
        <Row k="Organizer" v={e.organizer || 'Not specified'} />
        <Row k="Date" v={e.start_date ? `${fmtDate(e.start_date)}${e.end_date && e.end_date !== e.start_date ? ` → ${fmtDate(e.end_date)}` : ''}${e.start_date ? ` · ${countdownLabel(e.start_date)}` : ''}` : 'Not specified'} />
        <Row k="Registration deadline" v={e.reg_deadline ? `${fmtDate(e.reg_deadline)}${dl ? ` · ${dl}` : ''}` : 'Not specified'} />
        <Row k="Location" v={e.location || (e.mode === 'Online' ? 'Online' : 'Not specified')} />
        <Row k="Eligibility" v={e.eligibility || 'Not specified'} />
        <Row k="Prize" v={e.prize || 'Not specified'} />
        <Row k="Description" v={e.description || 'Not specified'} />
        {(e.skills || []).length > 0 && <Row k="Skills / topics" v={e.skills.join(', ')} />}
        {(e.tags || []).length > 0 && <Row k="Tags" v={e.tags.join(', ')} />}
        <Row k="Registration link" v={e.reg_url ? <a href={e.reg_url} target="_blank" rel="noreferrer" className="or-link break-all">{e.reg_url}</a> : 'Not specified'} />
        <Row k="Source" v={e.source_url ? <a href={e.source_url} target="_blank" rel="noreferrer" className="or-link break-all">{e.source_url}</a> : 'Added manually'} />
        <Row k="Last verified" v={e.last_verified ? fmtDate(e.last_verified) : '—'} />
      </dl>

      {bookmark && (
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="or-kicker">My tracking</span>
          <button onClick={onCycleTrack}><OrbitBadge tone="yellow">{bookmark.track_status} ↻</OrbitBadge></button>
          <span className="text-[11px] text-orbit-text-mute">{TRACK_STATUSES.join(' → ')}</span>
        </div>
      )}

      <div className="mt-4">
        <Field label="My notes">
          <textarea className="or-input w-full px-3 py-2 text-sm" rows={2} value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Team members, ideas, links…" />
        </Field>
      </div>

      <div className="flex flex-wrap justify-end gap-2 mt-2">
        <OrbitButton variant="danger-solid" onClick={onDelete}><Trash2 className="w-4 h-4" strokeWidth={2.2} /> Delete</OrbitButton>
        <OrbitButton variant="outline" onClick={() => onNotes(notes)}>Save notes</OrbitButton>
        <OrbitButton variant="outline" onClick={onToggleSave}>{bookmark ? 'Remove from My Events' : 'Save Event'}</OrbitButton>
        <OrbitButton onClick={onEdit}><Pencil className="w-4 h-4" strokeWidth={2.2} /> Edit</OrbitButton>
      </div>
    </Modal>
  );
}

function Row({ k, v }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 items-start">
      <dt className="or-kicker pt-0.5">{k}</dt>
      <dd className="font-semibold text-orbit-text text-[13px] break-words">{v}</dd>
    </div>
  );
}

// ------------------------------------------------------------------
function EventForm({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (ev) => {
    ev.preventDefault();
    const errs = {};
    if (!f.title.trim()) errs.title = 'Event name is required.';
    if (f.reg_url && !/^https?:\/\//i.test(f.reg_url)) errs.reg_url = 'Must start with http:// or https://.';
    if (f.end_date && f.start_date && f.end_date < f.start_date) errs.end_date = 'End date cannot be before start date.';
    if (f.reg_deadline && !/^\d{4}-\d{2}-\d{2}$/.test(f.reg_deadline)) errs.reg_deadline = 'Use a valid date.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSave(f, f.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal wide title={f.id ? 'Edit event' : 'Add event'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Event name *" error={errors.title}>
          <input className="or-input w-full px-3 py-2 text-sm" value={f.title} onChange={set('title')} placeholder="AI Hackathon 2026" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Organizer">
            <input className="or-input w-full px-3 py-2 text-sm" value={f.organizer} onChange={set('organizer')} placeholder="Smart India Hackathon" />
          </Field>
          <Field label="Event type">
            <select className="or-input w-full px-3 py-2 text-sm" value={f.event_type} onChange={set('event_type')}>
              {EVENT_DB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Start date" error={errors.start_date}>
            <input type="date" className="or-input w-full px-3 py-2 text-sm" value={f.start_date || ''} onChange={set('start_date')} />
          </Field>
          <Field label="End date" error={errors.end_date}>
            <input type="date" className="or-input w-full px-3 py-2 text-sm" value={f.end_date || ''} onChange={set('end_date')} />
          </Field>
          <Field label="Registration deadline" error={errors.reg_deadline}>
            <input type="date" className="or-input w-full px-3 py-2 text-sm" value={f.reg_deadline || ''} onChange={set('reg_deadline')} />
          </Field>
          <Field label="Mode">
            <select className="or-input w-full px-3 py-2 text-sm" value={f.mode} onChange={set('mode')}>
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <input className="or-input w-full px-3 py-2 text-sm" value={f.location} onChange={set('location')} placeholder="Bengaluru / Online" />
          </Field>
          <Field label="Registration URL" error={errors.reg_url}>
            <input className="or-input w-full px-3 py-2 text-sm" value={f.reg_url} onChange={set('reg_url')} placeholder="https://…" />
          </Field>
          <Field label="Eligibility">
            <input className="or-input w-full px-3 py-2 text-sm" value={f.eligibility} onChange={set('eligibility')} placeholder="Undergraduate students" />
          </Field>
          <Field label="Prize">
            <input className="or-input w-full px-3 py-2 text-sm" value={f.prize} onChange={set('prize')} placeholder="₹1,00,000 + incubation" />
          </Field>
        </div>
        <Field label="Tags (comma separated)">
          <input className="or-input w-full px-3 py-2 text-sm" value={f.tags} onChange={set('tags')} placeholder="ai, hackathon, team" />
        </Field>
        <Field label="Description">
          <textarea className="or-input w-full px-3 py-2 text-sm" rows={3} value={f.description} onChange={set('description')} />
        </Field>
        {f.id != null && (
          <Field label="My notes">
            <textarea className="or-input w-full px-3 py-2 text-sm" rows={2} value={f.user_notes || ''} onChange={set('user_notes')} />
          </Field>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <OrbitButton type="button" variant="outline" onClick={onClose}>Cancel</OrbitButton>
          <OrbitButton type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save event'}</OrbitButton>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------
// AI import: paste a URL → backend fetches + extracts → user reviews →
// editable form → save only on confirmation. Never auto-saves.
function AiImportDialog({ onClose, onSave, session }) {
  const [url, setUrl] = useState('');
  const [stage, setStage] = useState('input'); // input | loading | review
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);

  const start = async (ev) => {
    ev.preventDefault();
    setError(null);
    const u = url.trim();
    if (!/^https?:\/\/.+\..+/.test(u)) { setError('Enter a valid URL starting with http:// or https://.'); return; }
    setStage('loading');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: u }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? 'AI import is not deployed yet (deploy the "event-import" edge function + set GEMINI_API_KEY). You can still add events manually.'
            : json.error || `Extraction failed (${res.status}).`,
        );
      }
      if (json.setupRequired) throw new Error(json.error);
      setExtracted({ ...json.data, source_url: u });
      setStage('review');
    } catch (e2) {
      setError(e2.message || 'Could not extract event details.');
      setStage('input');
    }
  };

  return (
    <Modal wide title="Import Event with AI" onClose={onClose}>
      {stage === 'input' && (
        <form onSubmit={start}>
          <p className="text-[13.5px] text-orbit-text-soft mb-3 leading-relaxed">
            Paste a public event page URL (hackathon, contest, workshop…). The page is fetched server-side and AI extracts the details. You review and confirm before anything is saved — nothing is added automatically.
          </p>
          <Field label="Event page URL *">
            <input className="or-input w-full px-3 py-2 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hackathon" autoFocus />
          </Field>
          {error && <p className="text-[12.5px] font-semibold text-orbit-coral mb-3">{error}</p>}
          <div className="flex justify-end gap-2">
            <OrbitButton type="button" variant="outline" onClick={onClose}>Cancel</OrbitButton>
            <OrbitButton type="submit"><Sparkles className="w-4 h-4" strokeWidth={2.2} /> Extract with AI</OrbitButton>
          </div>
        </form>
      )}

      {stage === 'loading' && (
        <div className="py-10 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin" style={{ color: '#8b5cf6' }} strokeWidth={2.2} />
          <p className="mt-3 text-[13.5px] font-bold text-orbit-text">Fetching the page and extracting event details…</p>
          <p className="text-[12px] text-orbit-text-mute mt-1">This usually takes 10–20 seconds.</p>
        </div>
      )}

      {stage === 'review' && extracted && (
        <div>
          <p className="or-inset p-3 text-[13px] font-bold text-orbit-text-soft mb-3 flex items-start gap-2">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#8b5cf6' }} strokeWidth={2.2} />
            AI extracted this information from the page. Review, edit anything that is wrong, then confirm to save.
          </p>
          <EventForm
            initial={{ ...EMPTY, ...extracted, tags: (extracted.tags || []).join(', ') }}
            onClose={onClose}
            onSave={async (rec) => {
              const row = {
                ...rec,
                skills: extracted.skills || [],
                ai_extracted: true,
                source_url: extracted.source_url || rec.source_url || '',
                last_verified: todayISO(),
              };
              await onSave(row, null);
              onClose();
            }}
          />
        </div>
      )}
    </Modal>
  );
}

// DB row shape from form state.
function normalizeEvent(rec) {
  const tags = typeof rec.tags === 'string'
    ? rec.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : (rec.tags || []);
  return {
    title: rec.title?.trim() || 'Untitled event',
    event_type: rec.event_type || 'Other',
    organizer: rec.organizer || '',
    description: rec.description || '',
    start_date: rec.start_date || null,
    end_date: rec.end_date || null,
    reg_deadline: rec.reg_deadline || null,
    location: rec.location || '',
    mode: rec.mode || 'Online',
    reg_url: rec.reg_url || '',
    eligibility: rec.eligibility || '',
    prize: rec.prize || '',
    tags,
    user_notes: rec.user_notes || '',
    source_url: rec.source_url || '',
    ai_extracted: Boolean(rec.ai_extracted),
    last_verified: rec.last_verified || null,
  };
}
