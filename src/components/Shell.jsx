import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, CalendarClock, FileText, BarChart3, ClipboardList,
  Percent, BookOpenCheck, Target, Library, StickyNote, Bell, Settings, Search, X,
  Sparkles, LogOut, Menu, Inbox, Trophy, CheckCircle2,
} from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import OrbitMark from './landing/OrbitMark.jsx';

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'schedule', label: 'Class Schedule', icon: CalendarDays },
  { id: 'calendar', label: 'Academic Calendar', icon: CalendarClock },
  { id: 'tests', label: 'Tests & Marks', icon: FileText },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'attendance', label: 'Attendance', icon: Percent },
  { id: 'planner', label: 'Study Planner', icon: BookOpenCheck },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'events', label: 'Upcoming Events', icon: Trophy },
  { id: 'subjects', label: 'Subjects', icon: Library },
  { id: 'notes', label: 'Notes & Resources', icon: StickyNote },
  { id: 'summary', label: 'Weekly Summary', icon: Inbox },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Shell({ active, onNavigate, onAskAI, children }) {
  const { profile, data, analytics, signOut, toast } = useApp();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Sign out destroys the session, clears all cached app state and lands
  // the user back on the public marketing site. Protected routes become
  // inaccessible because the /app gate redirects on missing session.
  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate('/', { replace: true });
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === 'Escape') { setSearchOpen(false); setNotifOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return [];
    const out = [];
    const push = (type, id, title, sub, route) => {
      if (title && title.toLowerCase().includes(q)) out.push({ type, id, title, sub, route });
    };
    for (const s of data.subjects ?? []) push('Subject', s.id, s.name, s.code || '', 'subjects');
    for (const t of data.tests ?? []) push('Test', t.id, t.name, t.test_date, 'tests');
    for (const a of data.assignments ?? []) push('Assignment', a.id, a.title, `due ${a.due_date}`, 'assignments');
    for (const e of data.events ?? []) push('Event', e.id, e.title, e.start_date, 'calendar');
    for (const e of data.hackathons ?? []) push(e.event_type || 'Event', e.id, e.title, e.start_date || '', 'events');
    for (const r of data.resources ?? []) push(r.resource_type === 'note' ? 'Note' : 'Resource', r.id, r.title, r.description || '', 'notes');
    for (const s of data.sessions ?? []) push('Study session', s.id, s.topic || 'Session', s.session_date, 'planner');
    for (const s of data.schedule ?? []) push('Class', s.id, subjectLabel(s.subject_id, data), `${s.start_time}–${s.end_time}`, 'schedule');
    return out.slice(0, 20);
  }, [query, data]);

  const unread = (analytics?.notifications ?? []).length;

  // Orbit AI is a route like any other, so its sidebar button takes the
  // same active treatment as Dashboard and the rest of the nav.
  const askAIActive = active === 'orbitai';

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`or-nav fixed lg:sticky top-0 z-50 h-screen w-[264px] shrink-0 flex flex-col transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="or-nav-brand">
          <span className="or-nav-logo"><OrbitMark size={26} /></span>
          <div className="min-w-0">
            <p className="font-display font-black tracking-tight leading-none text-[17px] text-white">Orbit</p>
            <p className="or-nav-kicker">ACADEMIC OS</p>
          </div>
          {/* `lg:hidden!` — the or-iconbtn display rule would otherwise win the cascade on desktop. */}
          <button className="or-iconbtn ml-auto lg:hidden!" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="or-nav-scroll flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            const isActive = active === n.id;
            return (
              <button
                key={n.id}
                onClick={() => { onNavigate(n.id); setSidebarOpen(false); }}
                className={`or-nav-item ${isActive ? 'is-active' : ''}`}
              >
                <Icon className="w-[17px] h-[17px]" strokeWidth={2.2} />
                <span className="min-w-0 truncate">{n.label}</span>
                {n.id === 'summary' && unread > 0 && (
                  <span className="or-chip or-chip-coral ml-auto" style={{ fontSize: 9, fontWeight: 800 }}>{unread}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="or-nav-foot">
          {/* Orbit AI is a route (/app/orbit-ai) — this navigates, never opens a drawer. */}
          <button onClick={onAskAI} aria-current={askAIActive ? 'page' : undefined} className="or-nav-ai">
            <Sparkles className="w-4 h-4" strokeWidth={2.3} /> Ask Orbit AI
          </button>
          <button onClick={handleSignOut} className="or-nav-signout">
            <LogOut className="w-3.5 h-3.5" strokeWidth={2.2} /> Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-[#050816]/70 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main — everything right of the LOCKED sidebar is the redesign surface */}
      <div className="flex-1 min-w-0 flex flex-col or-app-space">
        <header className="sticky top-0 z-30 bg-orbit-secondary/85 backdrop-blur-md border-b border-orbit-border">
          <div className="flex items-center gap-3 px-4 md:px-6 py-3">
            <button className="or-iconbtn or-iconbtn-bordered lg:hidden!" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              className="or-search flex-1 max-w-md"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="truncate">Search subjects, tests, assignments…</span>
              <kbd className="ml-auto hidden md:inline-flex items-center text-[10.5px] font-bold text-orbit-muted bg-orbit-surface border border-orbit-border rounded-md px-1.5 py-0.5 shadow-orbit-xs">⌘K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button className="or-iconbtn or-iconbtn-bordered" onClick={() => setNotifOpen(true)} aria-label="Notifications">
                <Bell className="w-4 h-4" />
                {unread > 0 && <span className="or-notif-dot">{unread}</span>}
              </button>
              <div className="hidden md:flex items-center gap-2.5 pl-1" title="Your account">
                <span className="or-avatar w-9 h-9 text-[13px]">{(profile?.full_name || 'S').trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 max-w-[160px]">
                  <span className="block text-[12.5px] font-bold text-orbit-text leading-tight truncate">{profile?.full_name || 'Student'}</span>
                  <span className="block text-[10.5px] text-orbit-muted leading-tight truncate">{profile?.program ? `${profile.program}${profile.branch ? ' · ' + profile.branch : ''}` : 'Set up profile'}</span>
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 relative z-10 p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto animate-fade-in">{children}</div>
        </main>
      </div>

      {/* Global search */}
      {searchOpen && (
        <div className="or-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}>
          <div className="or-modal w-full max-w-lg mt-10">
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-orbit-border">
              <Search className="w-4 h-4 text-orbit-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search subjects, tests, assignments, events, notes, sessions…"
                className="flex-1 bg-transparent outline-none text-sm font-semibold text-orbit-text placeholder:text-orbit-muted/70"
              />
              <kbd className="text-[10px] font-bold text-orbit-muted bg-orbit-surface border border-orbit-border rounded-md px-1.5 py-0.5 shadow-orbit-xs">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {query && !searchResults.length && <p className="text-sm text-orbit-text-mute p-3">No results for “{query}”.</p>}
              {!query && <p className="text-sm text-orbit-text-mute p-3">Type to search across your entire academic workspace.</p>}
              {searchResults.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => { onNavigate(r.route); setSearchOpen(false); setQuery(''); }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-orbit-purple-soft/60 transition-colors"
                >
                  <p className="text-sm font-semibold text-orbit-text">{r.title}</p>
                  <p className="text-[11px] text-orbit-text-mute font-semibold uppercase tracking-wide">{r.type} · {r.sub}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notification drawer */}
      {notifOpen && (
        <NotificationDrawer items={analytics?.notifications ?? []} onClose={() => setNotifOpen(false)} onNavigate={(r) => { onNavigate(r); setNotifOpen(false); }} />
      )}

      {/* Toast — the context's flash() messages, now actually visible */}
      {toast && (
        <div className="or-toast" role="status">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#34d399' }} />
          {toast.message}
        </div>
      )}
    </div>
  );
}

function subjectLabel(subjectId, data) {
  return data?.subjects?.find((s) => s.id === subjectId)?.name || 'Class';
}

function NotificationDrawer({ items, onClose, onNavigate }) {
  const [dismissed, setDismissed] = useState([]);
  const visible = items.filter((n) => !dismissed.includes(n.dedupeKey));
  return (
    <div className="fixed top-0 right-0 h-full w-full max-w-sm z-[60] bg-orbit-secondary border-l border-orbit-border flex flex-col shadow-[-16px_0_40px_rgba(15,23,42,0.12)]">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-orbit-border">
        <span className="or-icon-chip or-icon-chip-sm or-tone-purple"><Bell className="w-4 h-4" strokeWidth={2.2} /></span>
        <div className="min-w-0">
          <h2 className="font-bold text-orbit-text leading-tight">Reminders</h2>
          <p className="text-[11px] text-orbit-text-mute">Generated from your real data</p>
        </div>
        <button onClick={onClose} className="ml-auto or-iconbtn" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!visible.length && (
          <div className="or-empty !py-12">
            <div className="or-empty-icon !w-14 !h-14 !rounded-2xl"><Sparkles className="w-6 h-6" strokeWidth={1.8} /></div>
            <h3 className="font-bold text-[14px] text-orbit-text">Nothing needs your attention</h3>
            <p className="text-[12.5px] text-orbit-text-mute mt-1">You're all caught up. 🎉</p>
          </div>
        )}
        {visible.map((n) => (
          <div key={n.dedupeKey} className={`or-card p-3.5 ${n.severity === 'high' ? 'border-l-[3px] border-l-orbit-coral' : ''}`}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-orbit-text leading-snug">{n.title}</p>
                <p className="text-[12px] text-orbit-text-soft mt-0.5 leading-relaxed">{n.detail}</p>
              </div>
              <button
                onClick={() => setDismissed((d) => [...d, n.dedupeKey])}
                className="or-iconbtn !w-7 !h-7 shrink-0"
                title="Dismiss for today"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {n.link && (
              <button onClick={() => onNavigate(n.link)} className="or-pill-link mt-2 !py-1.5 !px-3 !text-[11px]">Open →</button>
            )}
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-orbit-border text-[11px] text-orbit-text-mute font-medium">
        Configure reminder types in Settings.
      </div>
    </div>
  );
}
