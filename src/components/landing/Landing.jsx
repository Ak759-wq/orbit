// Orbit landing page: locked cinematic hero + marketing content only.
// The interactive academic workspace lives in the protected /app routes.
// Navigation: Get started → auth (or straight to /app when signed in),
// Sign in → auth, nav links → smooth-scroll to their sections.

import { useEffect, useState } from 'react';
import { CalendarDays, BarChart3, FileText, Target, PieChart, BookOpenCheck, ArrowRight, Menu, X } from 'lucide-react';
import OrbitMark from './OrbitMark.jsx';
import { Starfield, SaturnSystem, Satellite, Comet } from './SpaceScene.jsx';
import { StudentsSection, FinalCTA, LandingFooter } from './LandingSections2.jsx';
import '../../styles/landing.css';
import '../../styles/website.css';

const NAV_LINKS = [
  { label: 'Home', target: 'ob-top' },
  { label: 'Features', target: 'ws-universe' },
  { label: 'For Students', target: 'ob-students' },
  { label: 'About', target: 'ob-about' },
];

const CARDS = [
  { id: 'c1', icon: CalendarDays, title: 'Class Schedule', sub: "Know what's next", pos: 'ob-c1', fd: '0s', route: 'schedule' },
  { id: 'c2', icon: BarChart3, title: 'Track Progress', sub: 'Perform better', pos: 'ob-c2', fd: '-2.5s', route: 'analytics' },
  { id: 'c3', icon: FileText, title: 'Assignments', sub: 'Never miss a deadline', pos: 'ob-c3', fd: '-5s', route: 'assignments' },
  { id: 'c4', icon: Target, title: 'Set Goals', sub: 'Stay consistent', pos: 'ob-c4', fd: '-7.5s', route: 'goals' },
  { id: 'c5', icon: PieChart, title: 'Tests & Marks', sub: 'See your growth', pos: 'ob-c5', fd: '-3.6s', route: 'tests' },
  { id: 'c6', icon: BookOpenCheck, title: 'Study Planner', sub: 'Plan smarter', pos: 'ob-c6', fd: '-6.1s', route: 'planner' },
];

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function Landing({ onGetStarted, onSignIn }) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Scroll-reveal for hero sections (.ob-reveal) and the marketing
  // sections below (.ws-reveal). A MutationObserver re-scans when new
  // reveal elements mount.
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.14 });

    const scan = () => document
      .querySelectorAll('.ob-reveal:not(.in), .ws-reveal:not(.in)')
      .forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); io.disconnect(); };
  }, []);

  const go = (fn) => () => { setMenuOpen(false); fn(); };

  return (
    <div className="ob-page" id="ob-top">
      {/* ---------- navigation ---------- */}
      <nav className="ob-nav">
        <button className="ob-nav-link ob-brand" onClick={() => scrollToId('ob-top')} style={{ display: 'flex', alignItems: 'center', gap: 9, paddingLeft: 0 }}>
          <OrbitMark size={27} />
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>Orbit</span>
        </button>

        <div className="ob-nav-center">
          {NAV_LINKS.map((l) => (
            <button key={l.label} className="ob-nav-link" onClick={() => scrollToId(l.target)}>
              {l.label}
            </button>
          ))}
        </div>

        <div className="ob-nav-right">
          <button className="ob-btn ob-btn-ghost ob-btn-sm" onClick={go(onSignIn)}>Sign in</button>
          <button className="ob-btn ob-btn-white ob-btn-sm" onClick={go(onGetStarted)}>Get started</button>
          <button className="ob-burger" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
            {menuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </nav>

      {/* mobile menu */}
      {menuOpen && (
        <div style={{ position: 'fixed', inset: '58px 14px auto', zIndex: 59, borderRadius: 18, border: '1px solid rgba(196,181,253,0.2)', background: 'rgba(10,8,22,0.94)', backdropFilter: 'blur(14px)', padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_LINKS.map((l) => (
            <button key={l.label} className="ob-nav-link" style={{ textAlign: 'left' }} onClick={() => { setMenuOpen(false); scrollToId(l.target); }}>
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* ---------- hero (LOCKED composition — do not modify) ---------- */}
      <header className="ob-hero">
        <div className="ob-scene">
          <Starfield />
          <div className="ob-nebula ob-nebula-a" />
          <div className="ob-nebula ob-nebula-b" />
          <div className="ob-nebula ob-nebula-c" />
          <div className="ob-nebula ob-nebula-d" />
          <div className="ob-planet-glow" />
          <Comet variant="k1" />
          <Comet variant="k2" />
          <SaturnSystem />
          <Satellite variant="a" />
          <Satellite variant="b" />
        </div>

        <div className="ob-hero-inner">
          <button className="ob-pill" onClick={go(onGetStarted)}>
            <span className="ob-pill-tag">New</span>
            Your Academic Universe
            <span className="ob-pill-arrow">→</span>
          </button>

          <h1 className="ob-h1">
            Your college life,
            <span className="ob-h1-gradient">in one place</span>
          </h1>

          <p className="ob-sub">
            Manage your schedule, track your progress, and stay ahead
            with a personal academic operating system.
          </p>

          <div className="ob-cta-row">
            <button className="ob-btn ob-btn-white" onClick={go(onGetStarted)}>
              Get started <ArrowRight size={17} />
            </button>
            <button className="ob-btn ob-btn-ghost" onClick={() => scrollToId('ws-universe')}>
              See features
            </button>
          </div>
        </div>

        {/* floating feature cards — desktop: positioned around planet; mobile: grid */}
        <div className="ob-hero-cards-desktop">
          {CARDS.map((c) => (
            <HeroCard key={c.id} card={c} />
          ))}
        </div>
        <div className="ob-hero-cards-mobile">
          {CARDS.map((c) => (
            <HeroCard key={c.id} card={c} mobile />
          ))}
        </div>
      </header>

      {/* ---------- marketing content (public; no student data) ---------- */}
      <main className="ws-wrap">
        <div id="ws-universe">
          <StudentsSection />
        </div>
        <AboutSection />
        <FinalCTA onGetStarted={go(onGetStarted)} />
      </main>

      <LandingFooter onNavigate={scrollToId} />
    </div>
  );
}

/* ---------------- About Orbit (nav target: ob-about) ---------------- */
// Exported so the static preview generator renders the identical section.
export function AboutSection() {
  return (
    <section className="ws-sec" id="ob-about">
      <div className="ws-head-center ws-reveal">
        <span className="ws-kicker" style={{ justifyContent: 'center' }}>About Orbit</span>
        <h2 className="ws-h2">A personal academic operating system.</h2>
        <p className="ws-lead">
          Orbit is built on one idea: your academic life is a connected system, not a pile of
          apps. Your Excel attendance sheet syncs in and your goals update. Add a test and
          your analytics move. Plan a session and your free periods get used.
        </p>
      </div>
      <div className="ob-grid ob-grid-2 ws-reveal" style={{ ['--rd']: '0.1s' }}>
        {[
          ['Connected by design', 'Subjects, schedule, tests, attendance, assignments, sessions and goals share one data model — every module reflects the others instantly.'],
          ['Honest by default', 'Every number comes from your own records — attendance straight from your Excel sheet, never typed in by hand. No seeded fake scores, no invented averages — if there is no data yet, Orbit says so.'],
          ['Private and yours', 'Your records live in your account. Nothing is shared, nothing is sold, and everything exports whenever you want it.'],
        ].map(([t, d]) => (
          <div key={t} className="ob-feat">
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HeroCard({ card, mobile }) {
  const Icon = card.icon;
  return (
    <div
      className={`ob-card ob-float ob-hero-card ${mobile ? '' : card.pos}`}
      style={mobile ? { ['--fd']: card.fd } : undefined}
    >
      <span className="ob-card-icon"><Icon strokeWidth={2.2} /></span>
      <span>
        <span className="ob-card-title" style={{ display: 'block' }}>{card.title}</span>
        <span className="ob-card-sub" style={{ display: 'block' }}>{card.sub}</span>
      </span>
    </div>
  );
}
