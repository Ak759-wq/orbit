import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Database } from 'lucide-react';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { useApp } from './state/AppContext.jsx';
import Landing from './components/landing/Landing.jsx';
import Auth from './components/Auth.jsx';
import Onboarding from './components/Onboarding.jsx';
import Shell from './components/Shell.jsx';
import AIAssistant from './components/AIAssistant.jsx';
import Dashboard from './components/modules/Dashboard.jsx';
import Schedule from './components/modules/Schedule.jsx';
import Calendar from './components/modules/Calendar.jsx';
import Tests from './components/modules/Tests.jsx';
import Analytics from './components/modules/Analytics.jsx';
import Assignments from './components/modules/Assignments.jsx';
import Attendance from './components/modules/Attendance.jsx';
import Planner from './components/modules/Planner.jsx';
import Goals from './components/modules/Goals.jsx';
import Subjects from './components/modules/Subjects.jsx';
import Notes from './components/modules/Notes.jsx';
import Summary from './components/modules/Summary.jsx';
import Settings from './components/modules/Settings.jsx';
import Events from './components/modules/Events.jsx';

// Route table for the authenticated student application. Every module is
// nested under /app and rendered inside the app Shell via <Outlet />.
export const APP_ROUTES = [
  { path: '', label: 'Dashboard', el: Dashboard },
  { path: 'schedule', label: 'Class Schedule', el: Schedule },
  { path: 'calendar', label: 'Academic Calendar', el: Calendar },
  { path: 'tests', label: 'Tests & Marks', el: Tests },
  { path: 'analytics', label: 'Analytics', el: Analytics },
  { path: 'assignments', label: 'Assignments', el: Assignments },
  { path: 'attendance', label: 'Attendance', el: Attendance },
  { path: 'study', label: 'Study Planner', el: Planner },
  { path: 'goals', label: 'Goals', el: Goals },
  { path: 'events', label: 'Upcoming Events', el: Events },
  { path: 'subjects', label: 'Subjects', el: Subjects },
  { path: 'resources', label: 'Notes & Resources', el: Notes },
  { path: 'summary', label: 'Weekly Summary', el: Summary },
  { path: 'settings', label: 'Settings', el: Settings },
  // Orbit AI is a native module, not an overlay: it renders inside the
  // same Shell <Outlet /> as every other section.
  { path: 'orbit-ai', label: 'Orbit AI', el: AIAssistant },
];

// App module id (Shell sidebar ids) → /app route path.
export const APP_ROUTE_BY_ID = {
  dashboard: '', schedule: 'schedule', calendar: 'calendar', tests: 'tests',
  analytics: 'analytics', assignments: 'assignments', attendance: 'attendance',
  planner: 'study', goals: 'goals', subjects: 'subjects', notes: 'resources',
  summary: 'summary', settings: 'settings', events: 'events',
  orbitai: 'orbit-ai',
};

// Reverse map: /app path segment → module id (for sidebar highlighting).
const SEG_TO_MODULE = Object.fromEntries(
  Object.entries(APP_ROUTE_BY_ID).map(([id, seg]) => [seg, id]),
);

export function appPathForModule(id) {
  const seg = APP_ROUTE_BY_ID[id] ?? '';
  return seg ? `/app/${seg}` : '/app';
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProviderGate />
      <VercelAnalytics />
    </BrowserRouter>
  );
}

// Sits inside the router so routes can navigate; AppProvider (mounted in
// main.jsx) supplies auth + data to everything below.
function AppProviderGate() {
  const { authReady } = useApp();

  // Never render route content while auth state is still resolving —
  // prevents flashing the landing page or app for signed-in users.
  if (!authReady) return <Splash label="Starting Orbit…" />;

  return <AppRoutes />;
}

// Exported for tests, which supply their own MemoryRouter + AppContext.
export function AppRoutes() {
  return (
    <Routes>
      {/* ---------- public ---------- */}
      <Route path="/" element={<LandingRoute />} />
      <Route path="/signin" element={<SignInRoute />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />

      {/* ---------- protected student application ---------- */}
      <Route path="/app" element={<ProtectedApp />}>
        {APP_ROUTES.map(({ path, el: El }) => (
          <Route key={path || 'index'} index={path === ''} path={path || undefined} element={<El />} />
        ))}
        <Route path="assistant" element={<Navigate to="/app/orbit-ai" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ---- / : public marketing landing; buttons lead into the auth flow ----
function LandingRoute() {
  const { session } = useApp();
  const navigate = useNavigate();
  return (
    <Landing
      onGetStarted={() => navigate(session ? '/app' : '/signin')}
      onSignIn={() => navigate(session ? '/app' : '/signin')}
    />
  );
}

// ---- /signin : public auth page; signed-in users go straight to the app ----
function SignInRoute() {
  const { session, supabaseEnabled } = useApp();
  if (session) return <Navigate to="/app" replace />;
  if (!supabaseEnabled) return <SetupScreen />;
  return <Auth />;
}

// ---- /auth/callback : OAuth (Google) redirect landing ----
function AuthCallback() {
  const { session, profile } = useApp();
  const [err, setErr] = useState(null);

  useEffect(() => {
    // supabase-js consumes the PKCE code from the URL automatically.
    // If the provider redirected back with an error, surface it.
    const params = new URLSearchParams(window.location.search);
    const e = params.get('error_description') || params.get('error');
    if (e) setErr(e);
  }, []);

  if (err) {
    return (
      <div className="ob-page min-h-screen flex items-center justify-center p-4">
        <div className="rounded-3xl p-6 max-w-sm text-center" style={{ border: '1px solid rgba(196,181,253,0.2)', background: 'rgba(14,10,30,0.7)' }}>
          <AlertTriangle className="w-6 h-6 mx-auto mb-3" style={{ color: '#fda4af' }} />
          <h1 className="text-lg font-extrabold mb-1" style={{ color: '#fff' }}>Sign-in failed</h1>
          <p className="text-sm mb-4" style={{ color: '#94a3b8' }}>{decodeURIComponent(err)}</p>
          <a href="/signin" className="ob-btn ob-btn-white ob-btn-sm inline-flex">Try again</a>
        </div>
      </div>
    );
  }

  // Waiting for the session / profile row (auto-created by a DB trigger).
  if (!session) return <Splash label="Completing sign-in…" />;
  if (!profile) return <Splash label="Preparing your universe…" />;
  return <Navigate to={profile.onboarded ? '/app' : '/onboarding'} replace />;
}

// ---- /onboarding : first-login wizard; guarded on both sides ----
function OnboardingRoute() {
  const { session, profile, loading, error } = useApp();
  if (!session) return <Navigate to="/signin" replace />;
  if (error) return <SetupScreen errorTitle="Could not load your data" errorMessage={error} />;
  if (loading) return <Splash label="Loading your academic universe…" />;
  if (profile && profile.onboarded) return <Navigate to="/app" replace />;
  return <Onboarding />;
}

// ---- /app/* : the protected student application ----
function ProtectedApp() {
  const { session, profile, data, loading, error } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  // Not signed in → authentication page. Session lost mid-use → same.
  if (!session) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;

  // Onboarding is mandatory before the app; completed → straight to /app.
  if (profile && !profile.onboarded) return <Navigate to="/onboarding" replace />;

  if (error) {
    return <SetupScreen errorTitle="Could not load your data" errorMessage={error} />;
  }

  // Waiting for session restore / data load (never flash the shell).
  if (loading || !data || !profile) {
    return <Splash label={loading ? 'Loading your academic universe…' : 'Preparing profile…'} />;
  }

  // Safety net: an onboarded account whose real academic data is missing
  // (created before server-side seeding existed) seeds it automatically,
  // once, then reloads the workspace. New accounts are seeded in
  // onboarding; this path covers everyone else.
  const emptyRealData = (data.subjects?.length ?? 0) === 0
    && (data.schedule?.length ?? 0) === 0
    && (data.events?.length ?? 0) === 0
    && (data.tests?.length ?? 0) === 0
    && (data.assignments?.length ?? 0) === 0
    && (data.attendance?.length ?? 0) === 0;
  if (emptyRealData) {
    return <AutoSeedRealData />;
  }

  const seg = location.pathname.replace(/^\/app\/?/, '').split('/')[0];
  const activeId = SEG_TO_MODULE[seg] ?? 'dashboard';
  const navigateTo = (id) => {
    navigate(appPathForModule(id));
    window.scrollTo({ top: 0 });
  };

  return (
    <Shell active={activeId} onNavigate={navigateTo} onAskAI={() => navigate(appPathForModule('orbitai'))}>
      <Outlet />
    </Shell>
  );
}

// Seeds the real BST academic data (subjects + timetable + official
// 2026–27 calendar) for the signed-in user, then reloads the app.
function AutoSeedRealData() {
  const { seedAllReal } = useApp();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    seedAllReal()
      .then(() => { if (alive) window.location.reload(); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [seedAllReal]);
  if (failed) {
    return (
      <SetupScreen
        errorTitle="Could not load your BST academic data"
        errorMessage="Automatic seeding failed. Sign out and sign back in to retry, or add your subjects manually."
      />
    );
  }
  return <Splash label="Loading your BST subjects, timetable and calendar…" />;
}



// ---------------------------------------------------------------- shared UI

export function Splash({ label }) {
  // Skeleton loaders shaped like the real workspace, so the first paint
  // already communicates the layout instead of showing a blank screen.
  return (
    <div className="min-h-screen bg-orbit-bg px-5 py-8 md:px-10" aria-busy="true" aria-live="polite">
      <div className="max-w-[1400px] mx-auto space-y-5">
        <div className="flex items-center gap-4">
          <div className="or-skeleton h-10 w-10 !rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="or-skeleton h-4 w-48" />
            <div className="or-skeleton h-3 w-32" />
          </div>
        </div>

        <div className="or-skeleton h-40 md:h-44 !rounded-[24px]" />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="or-skeleton h-[104px] !rounded-[18px]" />)}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="or-skeleton h-64 !rounded-[18px] lg:col-span-2" />
          <div className="or-skeleton h-64 !rounded-[18px]" />
        </div>

        <p className="text-center pt-2" style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>
          {label}
        </p>
      </div>
    </div>
  );
}

export function SetupScreen({ errorTitle, errorMessage }) {
  const { session, signOut } = useApp();
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#010103', color: '#f4f2ff', fontFamily: "'Manrope','Inter',sans-serif" }}>
      <div className="max-w-lg p-7 rounded-3xl"
        style={{ border: '1px solid rgba(196,181,253,0.2)', background: 'rgba(16,12,34,0.7)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="p-2 rounded-xl" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(196,181,253,0.3)' }}>
            <Database className="w-5 h-5" style={{ color: '#c4b5fd' }} strokeWidth={2.5} />
          </span>
          <h1 className="text-xl font-extrabold" style={{ color: '#fff' }}>{errorTitle || 'Connect Orbit to Supabase'}</h1>
        </div>
        {errorMessage && (
          <p className="text-sm font-bold mb-3 flex items-start gap-1.5" style={{ color: '#fda4af' }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {errorMessage}
          </p>
        )}
        <ol className="text-sm space-y-2 list-decimal pl-5" style={{ color: '#94a3b8' }}>
          <li>Create a project at <b style={{ color: '#fff' }}>supabase.com</b> (free tier works).</li>
          <li>Open the <b style={{ color: '#fff' }}>SQL Editor</b> and run <code className="font-mono text-xs bg-white/10 px-1 rounded">scholar-os/supabase/schema.sql</code>.</li>
          <li>Set <b style={{ color: '#fff' }}>VITE_SUPABASE_URL</b> and <b style={{ color: '#fff' }}>VITE_SUPABASE_ANON_KEY</b> — step-by-step in <code className="font-mono text-xs bg-white/10 px-1 rounded">GOOGLE_AUTH_SETUP.md</code>.</li>
          <li>Redeploy (or restart the dev server).</li>
        </ol>
        <p className="text-xs mt-4" style={{ color: '#6f6a8a' }}>
          Optional: deploy <code className="font-mono">supabase/functions/academic-ai</code> and set <code className="font-mono">GEMINI_API_KEY</code> to enable the AI assistant. See README.md.
        </p>
        {session && (
          <button onClick={signOut} className="mt-4 px-4 py-2.5 text-sm font-bold rounded-full"
            style={{ border: '1px solid rgba(196,181,253,0.3)', color: '#fff', background: 'transparent' }}>
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
