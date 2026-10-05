// @vitest-environment jsdom
// Routing + auth-gate integration tests. These mount the real route tree
// (AppRoutes) with a mocked AppContext so no network is touched, and verify
// the public/protected architecture:
//   - / renders the marketing landing (hero intact)
//   - /app/* is inaccessible without a session (redirect to /signin)
//   - a session but incomplete onboarding is sent to /onboarding
//   - signed-in users are bounced from /signin straight to /app
//   - the sign-in page shows the Google-first "Welcome to Orbit" screen
// jsdom is required because redirects (<Navigate>) run as effects, which
// only fire with a real DOM.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no IntersectionObserver; Landing's reveal observer needs it.
class IOStub {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
  unobserve() {}
  disconnect() {}
}
window.IntersectionObserver = IOStub;

// jsdom has no canvas backend, so the locked hero's SpaceScene starfield
// gets a null 2D context. Stub it with a chainable no-op proxy — the hero
// component itself is never modified for tests.
const noopFn = () => proxyCtx;
const proxyCtx = new Proxy({}, {
  get: (_t, prop) => (prop === 'canvas' ? null : noopFn),
  set: () => true,
});
window.HTMLCanvasElement.prototype.getContext = () => proxyCtx;

// Orbit AI persists the chosen model per user; jsdom runs here without a
// storage backend, so provide an in-memory one.
const memStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
  clear: () => memStore.clear(),
};

// jsdom implements no layout, so scrollIntoView is missing. The Orbit AI
// conversation uses it to follow new messages.
Element.prototype.scrollIntoView = function () {};

// Route tree without its own BrowserRouter (tests provide MemoryRouter).
const { AppRoutes } = await import('./App.jsx');
const { MemoryRouter } = await import('react-router-dom');
const { AppContext } = await import('./state/AppContext.jsx');

// Deterministic context: everything off by default; tests flip fields.
function mockContext(overrides = {}) {
  return {
    supabaseEnabled: true,
    session: null,
    profile: null,
    data: null,
    settings: null,
    loading: false,
    error: null,
    toast: null,
    flash: vi.fn(),
    analytics: null,
    subjectName: vi.fn(() => null),
    subjectMap: new Map(),
    authReady: true,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signInWithGoogle: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    sendPasswordReset: vi.fn(),
    saveProfile: vi.fn(),
    saveSettings: vi.fn(),
    insertRow: vi.fn(),
    updateRow: vi.fn(),
    deleteRow: vi.fn(),
    insertMany: vi.fn(),
    seedDemo: vi.fn(),
    clearDemo: vi.fn(),
    seedAllReal: vi.fn(async () => {}),
    today: '2026-09-28',
    ...overrides,
  };
}

const EMPTY_DATA = {
  subjects: [], schedule: [], events: [], tests: [], assignments: [],
  attendance: [], sessions: [], goals: [], resources: [],
  hackathons: [], bookmarks: [], dismissals: [],
};

// A signed-in account always carries the real BST seed (subjects,
// timetable, calendar) — the app auto-seeds empty accounts.
const POPULATED_DATA = {
  ...EMPTY_DATA,
  subjects: [{ id: 1, name: 'Programming for Problem Solving Using Java', code: 'BTBC121', color: '#a78bfa' }],
  schedule: [{ id: 1, subject_id: 1, day_of_week: 1, start_time: '09:00', end_time: '10:50', room: 'Ground Floor, Classroom 5' }],
  events: [{ id: 1, title: 'Freezing of Marks CIA - 1', event_type: 'assignment', start_date: '2026-09-28', end_date: '2026-09-28', priority: 'normal' }],
};

function signedInCtx(overrides = {}) {
  return mockContext({
    session: { user: { id: 'u1' }, access_token: 'tok' },
    profile: { id: 'u1', onboarded: true, full_name: 'Ada' },
    data: POPULATED_DATA,
    ...overrides,
  });
}

// Mount + flush effects so <Navigate> redirects complete.
async function renderPath(path, ctx) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(MemoryRouter, { initialEntries: [path] },
        createElement(AppContext.Provider, { value: ctx },
          createElement(AppRoutes, null),
        ),
      ),
    );
  });
  const html = container.innerHTML;
  root.unmount();
  container.remove();
  return html;
}

describe('public vs protected architecture', () => {
  it('renders the marketing landing (locked hero) at /', async () => {
    const html = await renderPath('/', mockContext());
    expect(html).toContain('Your college life,');
    expect(html).toContain('in one place');
    expect(html).toContain('ob-hero'); // locked hero composition
    // Marketing-only: no interactive workspace sections.
    expect(html).not.toContain('ws-today');
    expect(html).not.toContain('Today Command Center');
    // Marketing sections that remain:
    expect(html).toContain('For Students');
    expect(html).toContain('ob-about');
  });

  it('sends unauthenticated /app visits to sign-in', async () => {
    const html = await renderPath('/app', mockContext());
    expect(html).toContain('Welcome to Orbit');
    expect(html).not.toContain('ACADEMIC OS');
  });

  it('protects deep app routes like /app/tests and /app/calendar', async () => {
    for (const p of ['/app/tests', '/app/calendar', '/app/attendance']) {
      const html = await renderPath(p, mockContext());
      expect(html, `${p} must redirect to sign-in`).toContain('Welcome to Orbit');
    }
  });

  it('sends signed-in-but-not-onboarded users from /app to onboarding', async () => {
    const html = await renderPath('/app', signedInCtx({ profile: { id: 'u1', onboarded: false, full_name: 'Ada' } }));
    expect(html).not.toContain('ACADEMIC OS');
    expect(html).toContain('Tell us about you'); // onboarding step 1
  });

  it('lets fully onboarded users into /app (Shell renders)', async () => {
    const html = await renderPath('/app', signedInCtx());
    expect(html).toContain('Orbit');
    expect(html).toContain('Sign out');
  });

  it('bounces already-signed-in users from /signin to /app', async () => {
    const html = await renderPath('/signin', signedInCtx());
    expect(html).not.toContain('Welcome to Orbit');
    expect(html).toContain('Sign out'); // landed inside the app shell
  });

  it('redirects unknown routes back to the landing page', async () => {
    const html = await renderPath('/definitely-not-a-route', mockContext());
    expect(html).toContain('Your college life,');
  });

  it('auto-seeds real BST data when an onboarded account has none', async () => {
    const seedAllReal = vi.fn(async () => {});
    const html = await renderPath('/app', signedInCtx({
      data: EMPTY_DATA, // onboarded but completely empty → gate fires
      seedAllReal,
    }));
    expect(html).toContain('Loading your BST subjects, timetable and calendar');
    expect(seedAllReal).toHaveBeenCalledTimes(1);
  });

  it('does not auto-seed when the account already has data', async () => {
    const seedAllReal = vi.fn(async () => {});
    await renderPath('/app', signedInCtx({ seedAllReal }));
    expect(seedAllReal).not.toHaveBeenCalled();
  });
});

describe('sign-in page', () => {
  it('shows the Google-first Welcome to Orbit screen', async () => {
    const html = await renderPath('/signin', mockContext());
    expect(html).toContain('Welcome to Orbit');
    expect(html).toContain('Sign in to your academic universe.');
    expect(html).toContain('Continue with Google');
    // Email sign-in remains as the secondary option.
    expect(html).toContain('or with email');
  });

  it('shows a setup screen instead of auth when Supabase is not configured', async () => {
    const html = await renderPath('/signin', mockContext({ supabaseEnabled: false }));
    expect(html).toContain('Connect Orbit to Supabase');
    expect(html).not.toContain('Continue with Google');
  });

  it('starts Google OAuth through the context action when Google is enabled', async () => {
    // Auth.jsx probes /auth/v1/settings; pretend Google is enabled.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://stub.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'stub-key');
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ external: { google: true } }) });
    const ctx = mockContext();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MemoryRouter, { initialEntries: ['/signin'] },
          createElement(AppContext.Provider, { value: ctx },
            createElement(AppRoutes, null),
          ),
        ),
      );
    });
    await act(async () => {}); // flush the provider probe
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Continue with Google'));
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
    await act(async () => { btn.click(); });
    expect(ctx.signInWithGoogle).toHaveBeenCalledTimes(1);
    root.unmount();
    container.remove();
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it('disables the Google button with a hint when the provider is not enabled', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://stub.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'stub-key');
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ external: { google: false } }) });
    const ctx = mockContext();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MemoryRouter, { initialEntries: ['/signin'] },
          createElement(AppContext.Provider, { value: ctx },
            createElement(AppRoutes, null),
          ),
        ),
      );
    });
    await act(async () => {}); // flush the provider probe
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Continue with Google'));
    expect(btn.disabled).toBe(true);
    expect(container.textContent).toContain("Google sign-in isn't enabled yet");
    expect(ctx.signInWithGoogle).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });
});

describe('routing tables', () => {
  it('maps every required /app path', async () => {
    const { APP_ROUTES } = await import('./App.jsx');
    const paths = APP_ROUTES.map((r) => r.path);
    for (const p of ['', 'schedule', 'calendar', 'tests', 'assignments', 'attendance', 'study', 'goals', 'analytics', 'resources', 'settings']) {
      expect(paths, `missing /app/${p} route`).toContain(p);
    }
  });

  it('maps Shell module ids to route segments (planner → study, notes → resources)', async () => {
    const { APP_ROUTE_BY_ID } = await import('./App.jsx');
    expect(APP_ROUTE_BY_ID.planner).toBe('study');
    expect(APP_ROUTE_BY_ID.notes).toBe('resources');
    expect(APP_ROUTE_BY_ID.dashboard).toBe('');
  });
});

// Orbit AI used to be a fixed right-hand drawer. It is now a real module
// at /app/orbit-ai. These tests pin that architecture so the overlay
// cannot silently come back.
describe('Orbit AI is a full-page module, not a drawer', () => {
  it('serves /app/orbit-ai inside the app Shell for signed-in users', async () => {
    const html = await renderPath('/app/orbit-ai', signedInCtx());
    expect(html).toContain('ACADEMIC OS');      // sidebar still rendered
    expect(html).toContain('Orbit AI');          // the page itself
    expect(html).toContain('Your Orbit Context'); // context rail
  });

  it('never renders Orbit AI as a fixed overlay panel', async () => {
    const html = await renderPath('/app/orbit-ai', signedInCtx());
    // The old drawer's own geometry and affordances must be gone.
    expect(html).not.toContain('animate-slide-in-right');       // drawer slide-in
    expect(html).not.toContain('shadow-[-12px_0_40px');        // drawer drop shadow
    expect(html).not.toContain('fixed top-0 right-0 h-full');  // drawer container
    expect(html).not.toContain('aria-label="Close assistant"'); // drawer close X
  });

  it('marks Ask Orbit AI as the active sidebar item on that route', async () => {
    const html = await renderPath('/app/orbit-ai', signedInCtx());
    expect(html).toContain('Ask Orbit AI');
    expect(html).toContain('aria-current="page"');
  });

  it('does not mark Ask Orbit AI active on other routes', async () => {
    const html = await renderPath('/app', signedInCtx());
    expect(html).toContain('Ask Orbit AI');
    expect(html).not.toContain('aria-current="page"');
  });

  it('redirects the legacy /app/assistant drawer URL to /app/orbit-ai', async () => {
    const html = await renderPath('/app/assistant', signedInCtx());
    expect(html).toContain('Your Orbit Context');
  });

  it('keeps the legacy drawer URL out of the module table', async () => {
    const { APP_ROUTES } = await import('./App.jsx');
    const paths = APP_ROUTES.map((r) => r.path);
    expect(paths).toContain('orbit-ai');
    expect(paths).not.toContain('assistant');
  });
});
