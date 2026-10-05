import { useEffect, useState } from 'react';
import { Mail, Lock, User, KeyRound, ArrowLeft, Loader2 } from 'lucide-react';
import OrbitMark from './landing/OrbitMark.jsx';
import { useApp } from '../state/AppContext.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Google "G" logo (official four-color mark).
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

export default function Auth({ onBackToLanding }) {
  const { signIn, signUp, signInWithGoogle, sendPasswordReset } = useApp();
  const [mode, setMode] = useState('signin'); // signin | signup | reset | reset-sent-signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  // Runtime check so the Google button never dumps the user on a raw
  // "Unsupported provider" JSON page (auto-activates when the admin
  // enables the provider — no redeploy needed).
  const [googleEnabled, setGoogleEnabled] = useState(null); // null = checking

  useEffect(() => {
    let alive = true;
    const url = import.meta.env.VITE_SUPABASE_URL;
    if (!url) { setGoogleEnabled(false); return () => {}; }
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (alive) setGoogleEnabled(Boolean(s?.external?.google)); })
      .catch(() => { if (alive) setGoogleEnabled(false); });
    return () => { alive = false; };
  }, []);

  const validate = () => {
    const e = {};
    if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email address.';
    if (mode !== 'reset') {
      if (password.length < 6) e.password = 'Password must be at least 6 characters.';
    }
    if (mode === 'signup' && !fullName.trim()) e.fullName = 'Your name is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email.trim(), password);
      else if (mode === 'signup') {
        const { needsEmailConfirmation } = await signUp(email.trim(), password, fullName.trim());
        if (needsEmailConfirmation) {
          setResetSent(true);
          setMode('reset-sent-signup');
        }
      } else {
        await sendPasswordReset(email.trim());
        setResetSent(true);
      }
    } catch (err) {
      setServerError(err.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setServerError(null);
    setGoogleBusy(true);
    try {
      // Preflight: /settings reports the toggle, but the OAuth client may
      // still be missing ("missing OAuth client ID"). Detect that here so
      // users never land on a raw JSON error page.
      const url = import.meta.env.VITE_SUPABASE_URL;
      if (url) {
        try {
          const pre = await fetch(
            `${url}/auth/v1/authorize?provider=google&skip_http_redirect=true&redirect_to=${encodeURIComponent(window.location.origin + '/auth/callback')}`,
            { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } },
          );
          if (pre.status === 400) {
            setServerError("Google sign-in isn't fully configured on the server yet — please use email sign-in below.");
            setGoogleBusy(false);
            return;
          }
        } catch { /* probe failure — including the healthy case below: a
          configured provider 302s to accounts.google.com, which browsers
          CORS-block for XHR and reject with TypeError. Swallow it and let the
          real sign-in flow navigate away (verified live). */ }
      }
      await signInWithGoogle();
      // Successful OAuth navigates away to Google; nothing to do here.
    } catch (err) {
      setServerError(
        /provider is not enabled|unsupported provider|missing OAuth client/i.test(err.message || '')
          ? "Google sign-in isn't enabled on the server yet — please use email sign-in below."
          : (err.message || 'Could not start Google sign-in.'),
      );
      setGoogleBusy(false);
    }
  };

  const sentScreen = (mode === 'reset' || mode === 'reset-sent-signup') && resetSent;

  return (
    <div className="ob-page min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* ambient space backdrop */}
      <div className="ob-scene" aria-hidden="true">
        <div className="ob-nebula ob-nebula-a" />
        <div className="ob-nebula ob-nebula-b" />
        <div className="ob-nebula ob-nebula-d" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex mb-3">
            <OrbitMark size={46} />
          </div>
          <h1 className="font-extrabold" style={{ fontSize: 30, letterSpacing: '-0.03em', color: '#fff' }}>
            Welcome to Orbit
          </h1>
          <p style={{ fontSize: 13.5, color: '#9a94b8', fontWeight: 600, marginTop: 6 }}>
            Sign in to your academic universe.
          </p>
        </div>

        <div className="rounded-3xl p-6" style={{ border: '1px solid rgba(196,181,253,0.18)', background: 'rgba(14,10,30,0.66)', backdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
          {sentScreen ? (
            <div className="text-sm" style={{ color: '#9a94b8', lineHeight: 1.7 }}>
              {mode === 'reset-sent-signup' ? (
                <>Account created! This project requires email confirmation — check your inbox and confirm to sign in.</>
              ) : (
                <>If an account exists for <b style={{ color: '#fff' }}>{email}</b>, a password reset link is on its way.</>
              )}
              <div className="mt-4">
                <button onClick={() => { setMode('signin'); setResetSent(false); }} className="ob-btn ob-btn-ghost ob-btn-sm">
                  Back to sign in
                </button>
              </div>
            </div>
          ) : (
            <>
              {serverError && <ServerErr msg={serverError} />}

              <button
                onClick={google}
                disabled={googleBusy || googleEnabled === false}
                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-full font-extrabold text-sm transition-transform active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: '#fff', color: '#141028', boxShadow: '0 8px 26px rgba(139,92,246,0.35)' }}
              >
                {googleBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleMark />}
                {googleBusy ? 'Redirecting to Google…' : 'Continue with Google'}
              </button>
              {googleEnabled === false && (
                <p className="text-center mt-2" style={{ fontSize: 11.5, color: '#9a94b8', fontWeight: 600 }}>
                  Google sign-in isn't enabled yet — use email below. (Admin: see GOOGLE_AUTH_SETUP.md Part 4.)
                </p>
              )}

              <div className="flex items-center gap-3 my-5">
                <span className="flex-1" style={{ height: 1, background: 'rgba(196,181,253,0.18)' }} />
                <span style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6f6a8a', fontWeight: 800 }}>
                  or with email
                </span>
                <span className="flex-1" style={{ height: 1, background: 'rgba(196,181,253,0.18)' }} />
              </div>

              <div className="flex gap-2 mb-4">
                <button onClick={() => setMode('signin')} className={`ob-nav-link ${mode === 'signin' ? 'text-white' : ''}`}
                  style={{ border: mode === 'signin' ? '1px solid rgba(196,181,253,0.4)' : '1px solid transparent', background: mode === 'signin' ? 'rgba(139,92,246,0.18)' : 'transparent' }}>
                  Sign In
                </button>
                <button onClick={() => setMode('signup')} className={`ob-nav-link ${mode === 'signup' ? 'text-white' : ''}`}
                  style={{ border: mode === 'signup' ? '1px solid rgba(196,181,253,0.4)' : '1px solid transparent', background: mode === 'signup' ? 'rgba(139,92,246,0.18)' : 'transparent' }}>
                  Sign Up
                </button>
              </div>

              {mode === 'reset' ? (
                <form onSubmit={submit}>
                  <p className="text-sm mb-4" style={{ color: '#9a94b8' }}>Enter your account email and we will send a reset link.</p>
                  <EmailField email={email} setEmail={setEmail} errors={errors} />
                  <button disabled={busy} className="ob-btn ob-btn-white w-full justify-center mt-2">
                    <Mail className="w-4 h-4" strokeWidth={2.5} /> {busy ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              ) : (
                <form onSubmit={submit}>
                  {mode === 'signup' && (
                    <div className="mb-3">
                      <label className="ob-label">Full name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4" style={{ color: '#6f6a8a' }} strokeWidth={2.5} />
                        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ada Lovelace"
                          className="ob-input w-full pl-9 pr-3 py-2.5 text-sm" />
                      </div>
                      {errors.fullName && <FieldErr msg={errors.fullName} />}
                    </div>
                  )}
                  <EmailField email={email} setEmail={setEmail} errors={errors} />
                  <div className="mb-3">
                    <label className="ob-label">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4" style={{ color: '#6f6a8a' }} strokeWidth={2.5} />
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                        className="ob-input w-full pl-9 pr-3 py-2.5 text-sm" />
                    </div>
                    {errors.password && <FieldErr msg={errors.password} />}
                  </div>
                  <button disabled={busy} className="ob-btn ob-btn-white w-full justify-center mt-1">
                    {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
                  </button>
                </form>
              )}

              <div className="mt-4 text-center">
                {mode === 'signin' && (
                  <button onClick={() => setMode('reset')} className="text-xs font-bold inline-flex items-center gap-1" style={{ color: '#9a94b8' }}>
                    <KeyRound className="w-3 h-3" /> Forgot password?
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="text-center mt-5">
          {onBackToLanding && (
            <button onClick={onBackToLanding} className="text-xs font-bold inline-flex items-center gap-1.5" style={{ color: '#9a94b8' }}>
              <ArrowLeft className="w-3.5 h-3.5" /> Back to orbit
            </button>
          )}
        </div>

        <p className="text-center mt-3" style={{ fontSize: 11, color: '#6f6a8a', fontWeight: 600 }}>
          Each account sees only its own academic data.
        </p>
      </div>
    </div>
  );
}

function FieldErr({ msg }) {
  return <p className="mt-1" style={{ fontSize: 11, fontWeight: 700, color: '#fda4af' }}>{msg}</p>;
}
function ServerErr({ msg }) {
  return <p className="mb-3" style={{ fontSize: 12, fontWeight: 700, color: '#fda4af' }}>{msg}</p>;
}

function EmailField({ email, setEmail, errors }) {
  return (
    <div className="mb-3">
      <label className="ob-label">Email</label>
      <div className="relative">
        <Mail className="absolute left-3 top-2.5 w-4 h-4" style={{ color: '#6f6a8a' }} strokeWidth={2.5} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu"
          className="ob-input w-full pl-9 pr-3 py-2.5 text-sm" />
      </div>
      {errors.email && <FieldErr msg={errors.email} />}
    </div>
  );
}
