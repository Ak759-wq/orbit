import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, AlertTriangle, Sparkles, ChevronDown, Check, Plus, BookOpen, CalendarClock, Percent, ClipboardList } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { OrbitButton, OrbitBadge } from './orbit/Orbit.jsx';

const SUGGESTIONS = [
  'What classes do I have tomorrow?',
  'Explain recursion in Java.',
  'What is my Java average?',
  'My Java test is coming up. What should I study?',
  'What is ChatGPT?',
  'How is my attendance? Can I improve it?',
  'Give me 5 hackathon ideas using AI.',
  'What assignments are due?',
];

const DEFAULT_MODEL = 'openrouter/free'; // router pseudo-model: auto-selects a free model
const FALLBACK_MESSAGE = 'Selected model unavailable. Switched to OpenRouter Free.';

// Full-page authenticated module at /app/orbit-ai. It renders inside the
// same Shell <Outlet /> as every other Orbit section — no drawer, no
// overlay. The AI backend below is unchanged.
export default function AIAssistant() {
  const { session, supabaseEnabled, profile, data, analytics } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // ---- model selection (OpenRouter free models) ----
  const [models, setModels] = useState([]); // [{ id, name, provider }] — first entry is the default router
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [modelMenu, setModelMenu] = useState(false);
  const [aiStatus, setAiStatus] = useState('connecting'); // connecting | ok | unconfigured | down
  const [notice, setNotice] = useState('');
  const modelKey = `orbit-ai-model:${session?.user?.id ?? 'anon'}`;

  // Load the live free-model list from the backend (never from OpenRouter
  // directly) and restore the user's persisted choice.
  useEffect(() => {
    if (!supabaseEnabled) return;
    let alive = true;
    const saved = localStorage.getItem(modelKey);
    if (saved) setModel(saved);
    (async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/academic-ai`;
        const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        // Health contract: { online, provider, freeModelsAvailable, models }
        if (!res.ok || json.online === false) {
          setAiStatus(/not configured/i.test(json.error ?? '') ? 'unconfigured' : 'down');
          return;
        }
        setModels(json.models ?? []);
        // Persisted model vanished from the free list → snap back to default.
        if (saved && saved !== DEFAULT_MODEL && !(json.models ?? []).some((m) => m.id === saved)) {
          setModel(DEFAULT_MODEL);
          localStorage.removeItem(modelKey);
        }
        setAiStatus('ok');
      } catch {
        if (alive) setAiStatus('down');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseEnabled, session?.user?.id]);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, notice]);

  // Real numbers only — this is exactly what the backend can see.
  const context = useMemo(() => [
    { icon: BookOpen, label: 'Subjects', value: (data?.subjects ?? []).length },
    { icon: CalendarClock, label: 'Classes today', value: (analytics?.todaySlots ?? []).length },
    { icon: Sparkles, label: 'Upcoming tests', value: (analytics?.upcomingTests ?? []).length },
    { icon: ClipboardList, label: 'Open tasks', value: (analytics?.assignStats?.pending ?? 0) },
    { icon: Percent, label: 'Attendance', value: analytics?.overallAtt?.pct != null ? `${analytics.overallAtt.pct}%` : '—' },
  ], [data, analytics]);

  const chooseModel = (m) => {
    setModel(m.id);
    setModelMenu(false);
    setNotice('');
    if (m.id === DEFAULT_MODEL) localStorage.removeItem(modelKey);
    else localStorage.setItem(modelKey, m.id);
  };

  const ask = async (text) => {
    const question = text.trim();
    if (!question || busy) return;
    // Keep a short history window so follow-up questions work.
    const history = messages.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }));
    let timezone = 'local';
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'; } catch { /* keep default */ }
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    setBusy(true);
    setNotice('');
    try {
      if (!supabaseEnabled || !session?.access_token) {
        throw new Error('You need to be signed in with Supabase configured to use the assistant.');
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/academic-ai`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: question, model, history, timezone }),
      });
      const json = await res.json().catch(() => ({}));
      // Consistent envelope: { success, message | error, code, model? }
      if (!res.ok || json.success === false) {
        throw new Error(
          res.status === 404
            ? 'Orbit AI is not deployed yet (deploy the "academic-ai" edge function and set the OPENROUTER_API_KEY secret).'
            : json.error || 'Orbit AI is temporarily unavailable. Please try again in a moment.',
        );
      }
      // The selected model died mid-flight → the backend already answered
      // through OpenRouter Free; reflect that in the selector.
      if (json.modelFallback) {
        setModel(DEFAULT_MODEL);
        localStorage.removeItem(modelKey);
        setNotice(json.modelFallbackMessage || FALLBACK_MESSAGE);
      }
      setMessages((m) => [...m, { role: 'ai', text: json.message || '(empty response)' }]);
    } catch (e) {
      // Network-level failure (fetch TypeError) → say the server is
      // unreachable instead of surfacing the raw browser message.
      const unreachable = e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(e?.message || '');
      setMessages((m) => [...m, { role: 'ai', error: true, text: unreachable ? 'Orbit AI server could not be reached. Please try again.' : (e.message || 'Orbit AI is temporarily unavailable. Please try again in a moment.') }]);
    } finally {
      setBusy(false);
    }
  };

  const newConversation = () => {
    setMessages([]);
    setNotice('');
  };const selectedName = models.find((m) => m.id === model)?.name ?? 'OpenRouter Free';
  const statusLabel = aiStatus === 'ok' ? 'Online'
    : aiStatus === 'unconfigured' ? 'Not configured'
      : aiStatus === 'connecting' ? 'Connecting' : 'Offline';
  const statusColor = aiStatus === 'ok' ? '#34d399' : '#fb7185';
  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  // A suggestion loads the composer instead of firing a request, so the
  // question can be edited before it costs an API call.
  const useSuggestion = (s) => {
    setInput(s);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-5 lg:h-[calc(100dvh-125px)]">
      {/* ---------- Page header ---------- */}
      <div className="flex flex-wrap items-start gap-4">
        <span className="or-icon-chip or-icon-chip-lg or-tone-purple shrink-0 shadow-[0_0_24px_-4px_rgba(139,92,246,.65)]">
          <Sparkles className="w-6 h-6" strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="or-kicker">Your academic copilot</p>
          <h1 className="text-[26px] font-extrabold text-orbit-text tracking-tight leading-tight mt-1">Orbit AI</h1>
          <p className="text-[13px] text-orbit-text-soft mt-1">Your academic copilot, grounded in your Orbit data.</p>
        </div>

        {/* Model selector + status */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
          {messages.length > 0 && (
            <OrbitButton type="button" onClick={newConversation} className="!px-3 !py-2">
              <Plus className="w-4 h-4" strokeWidth={2.4} /> New
            </OrbitButton>
          )}
          <div className="relative flex-1 sm:flex-none sm:w-[220px]">
            <button
              type="button"
              onClick={() => setModelMenu((o) => !o)}
              disabled={aiStatus !== 'ok'}
              aria-haspopup="listbox"
              aria-expanded={modelMenu}
              className="or-input w-full px-3 py-2 text-[12.5px] flex items-center justify-between gap-2 disabled:opacity-60"
            >
              <span className="truncate font-bold">{selectedName}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
            </button>
            {modelMenu && (
              <div
                role="listbox"
                className="absolute left-0 right-0 mt-1 z-30 bg-orbit-card-2 rounded-xl border border-orbit-border shadow-[0_12px_32px_-16px_rgba(2,6,23,.85)] max-h-72 overflow-y-auto"
              >
                {models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={model === m.id}
                    onClick={() => chooseModel(m)}
                    className="w-full text-left px-3 py-2 hover:bg-orbit-surface transition-colors border-b border-orbit-border last:border-b-0"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold text-orbit-text truncate">
                        {model === m.id && <Check className="inline w-3 h-3 mr-1 -mt-0.5" strokeWidth={3} />}
                        {m.name}
                      </span>
                      <OrbitBadge tone="green">Free</OrbitBadge>
                    </span>
                    <span className="block text-[10.5px] text-orbit-text-mute mt-0.5">{m.provider}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-bold shrink-0" style={{ color: statusColor }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
            {statusLabel}
          </span>
        </div>
      </div>

      {aiStatus === 'unconfigured' && (
        <p className="px-4 py-2.5 rounded-xl bg-[#312e81] text-[12px] font-semibold text-orbit-text-soft border border-[#4338ca]">
          OpenRouter is not configured. Add OPENROUTER_API_KEY to the server environment.
        </p>
      )}
      {notice && (
        <p className="px-4 py-2.5 rounded-xl bg-[#312e81] text-[12px] font-semibold text-orbit-text-soft border border-[#4338ca]">{notice}</p>
      )}

      {/* ---------- Conversation + context rail ---------- */}
      <div className="grid gap-5 lg:flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* LEFT: conversation */}
        <section className="or-card flex flex-col h-[68dvh] min-h-[420px] lg:h-auto lg:min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-5 space-y-3">
            {messages.length === 0 && !busy && (
              <div className="space-y-3">
                <div>
                  <p className="text-[22px] font-extrabold text-orbit-text tracking-tight">Hi {firstName} 👋</p>
                  <p className="text-[13.5px] text-orbit-text-soft mt-1.5 leading-relaxed max-w-[62ch]">
                    Ask me anything about your subjects, schedule, tests, attendance, assignments, sessions and goals.
                  </p>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => useSuggestion(s)}
                      className="text-left px-3.5 py-2.5 rounded-xl bg-orbit-surface border border-orbit-border text-[12.5px] font-semibold text-orbit-text hover:border-orbit-purple/50 hover:bg-orbit-purple/[.07] transition-all duration-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => m.role === 'user' ? (
              <div key={i} className="ml-8 md:ml-16 px-4 py-2.5 rounded-2xl rounded-br-md bg-orbit-purple text-white text-[13px] font-semibold leading-relaxed animate-rise-in whitespace-pre-wrap">
                {m.text}
              </div>
            ) : (
              <div key={i} className={`mr-4 md:mr-12 rounded-2xl rounded-bl-md p-4 border animate-rise-in ${m.error ? 'bg-[#312e81] border-[#4338ca]' : 'bg-orbit-surface border-orbit-border'}`}>
                {m.error && (
                  <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#fb7185' }}>
                    <AlertTriangle className="w-3 h-3" strokeWidth={2.5} /> Error
                  </p>
                )}
                <p className="text-[13px] text-orbit-text-soft leading-relaxed whitespace-pre-wrap">{m.text}</p>
              </div>
            ))}

            {busy && (
              <div className="mr-4 md:mr-12 rounded-2xl rounded-bl-md bg-orbit-surface border border-orbit-border p-4 space-y-2">
                <p className="text-[10.5px] font-bold text-orbit-purple uppercase tracking-wide">Orbit AI is thinking…</p>
                <div className="or-skeleton h-3 w-3/4" />
                <div className="or-skeleton h-3 w-1/2" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer — pinned to the bottom of the conversation */}
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="border-t border-orbit-border bg-orbit-surface p-3 md:p-4 flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything, or about your academic data…"
              aria-label="Ask Orbit AI"
              className="or-input flex-1 px-3.5 py-2.5 text-[13px]"
            />
            <OrbitButton type="submit" disabled={busy || !input.trim()} className="!px-3 shadow-[0_0_20px_-4px_rgba(139,92,246,.75)]" title="Send">
              <Send className="w-4 h-4" strokeWidth={2.4} />
            </OrbitButton>
          </form>
        </section>

        {/* RIGHT: live context rail */}
        <aside className="or-card or-card-hover p-4 self-start">
          <p className="or-kicker">Your Orbit Context</p>
          <div className="mt-3 space-y-2">
            {context.map((c) => (
              <div key={c.label} className="or-inset or-inset-hover flex items-center gap-3 px-3 py-2.5">
                <span className="or-icon-chip or-icon-chip-sm or-tone-purple shrink-0">
                  <c.icon className="w-4 h-4" strokeWidth={2.3} />
                </span>
                <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-orbit-text-mute leading-tight">{c.label}</span>
                <b className="ml-auto text-[15px] font-extrabold text-orbit-text tabular-nums">{c.value}</b>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-orbit-text-mute mt-3.5 leading-relaxed">
            Orbit AI reads your subjects, weekly schedule, upcoming tests, assignments, attendance and study sessions to answer.
            It never edits your data — every change still goes through you.
          </p>
        </aside>
      </div>
    </div>
  );
}
