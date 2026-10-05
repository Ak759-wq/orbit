// Post-hero landing sections (continued).

import { ArrowRight, GraduationCap } from 'lucide-react';
import OrbitMark from './OrbitMark.jsx';

// feature-card icon helper (was referenced but never defined)
const icon = (I) => <I strokeWidth={2.2} />;

/* ---------------- 6. Attendance ---------------- */
export function AttendanceSection() {
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = 82;
  return (
    <div className="ob-sec">
      <div className="ob-split">
        <div className="ob-sec-head ob-reveal">
          <span className="ob-kicker">Attendance</span>
          <h2 className="ob-h2">Never get a surprise letter</h2>
          <p className="ob-lead">
            Per-subject and overall attendance, always current. Ask "what if I miss the next
            class?" and Orbit shows the exact impact — plus how many classes you need to hit
            your target.
          </p>
        </div>
        <div className="ob-visual ob-reveal" style={{ ['--rd']: '0.12s' }}>
          <div className="ob-visual-bar"><i /><i /><i /></div>
          <div className="ob-ring-stat">
            <svg width="130" height="130" viewBox="0 0 130 130">
              <defs>
                <linearGradient id="obGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6ee7b7" />
                  <stop offset="60%" stopColor="#67e8f9" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <circle className="ob-ring-track" cx="65" cy="65" r={R} />
              <circle
                className="ob-ring-val"
                cx="65" cy="65" r={R}
                strokeDasharray={`${(pct / 100) * C} ${C}`}
              />
              <text x="65" y="70" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="800" transform="rotate(90 65 65)">{pct}%</text>
            </svg>
            <div>
              <div className="ob-vrow" style={{ marginBottom: 8 }}>
                <div><b>Attend next</b><br /><span>83.3% overall</span></div>
              </div>
              <div className="ob-vrow" style={{ marginBottom: 0 }}>
                <div><b>Miss next</b><br /><span>78.1% overall</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 7. Study Planner ---------------- */
export function PlannerSection() {
  return (
    <div className="ob-sec">
      <div className="ob-split ob-split-rev">
        <div className="ob-sec-head ob-reveal">
          <span className="ob-kicker">Study Planner</span>
          <h2 className="ob-h2">Plan smarter sessions</h2>
          <p className="ob-lead">
            Schedule focused sessions per subject, set a goal for each one, and track planned
            versus completed hours. Your study time flows into the weekly summary.
          </p>
        </div>
        <div className="ob-visual ob-reveal" style={{ ['--rd']: '0.12s' }}>
          <div className="ob-visual-bar"><i /><i /><i /></div>
          {[
            ['Collections revision', '17:00 – 18:30 · completed', 'mint'],
            ['AVL rotations practice', '18:00 – 19:30 · completed', 'p'],
            ['Bayes theorem drills', '20:00 – 21:00 · planned', 'c'],
          ].map(([name, meta, tone]) => (
            <div className="ob-vrow" key={name}>
              <span className={`ob-vdot ${tone === 'mint' ? '' : tone}`} />
              <div><b>{name}</b><br /><span>{meta}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 8. Academic Analytics ---------------- */
export function AnalyticsSection() {
  const bars = [58, 66, 62, 74, 71, 82, 88];
  return (
    <div className="ob-sec">
      <div className="ob-split">
        <div className="ob-sec-head ob-reveal">
          <span className="ob-kicker">Academic Analytics</span>
          <h2 className="ob-h2">Your performance, in focus</h2>
          <p className="ob-lead">
            Subject-wise averages, highest and lowest scores, and honest trend indicators —
            computed only from your recorded marks. Watch 62% become 78%.
          </p>
        </div>
        <div className="ob-visual ob-reveal" style={{ ['--rd']: '0.12s' }}>
          <div className="ob-visual-bar"><i /><i /><i /></div>
          <div className="ob-bars">
            {bars.map((h, i) => (
              <div key={i} style={{ height: `${h}%`, ['--bd']: `${i * 0.08}s` }} />
            ))}
          </div>
          <p style={{ margin: '14px 2px 0', fontSize: 12.5, color: '#6f6a8a', fontWeight: 600 }}>
            Java average trend · first test → latest · +16 pts
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 9. AI Academic Assistant ---------------- */
export function AISection() {
  return (
    <div className="ob-sec">
      <div className="ob-split ob-split-rev">
        <div className="ob-sec-head ob-reveal">
          <span className="ob-kicker">AI Assistant</span>
          <h2 className="ob-h2">Ask your academic universe</h2>
          <p className="ob-lead">
            "What's due this week?" "What's my Java average?" The assistant answers strictly
            from your own data — it shows the numbers it used, and tells you honestly when
            something hasn't been added yet.
          </p>
        </div>
        <div className="ob-visual ob-reveal" style={{ ['--rd']: '0.12s' }}>
          <div className="ob-visual-bar"><i /><i /><i /></div>
          <div className="ob-chat">
            <div className="ob-msg user">What should I focus on this week?</div>
            <div className="ob-msg ai">
              Java Internal Test is in 5 days (avg 70.6% now). DE Worksheet 3 is due today,
              and Maths Problem Set 4 is 2 days overdue. Java attendance is at 72% — below
              your 75% requirement.
            </div>
            <div className="ob-msg user">What classes do I have tomorrow?</div>
            <div className="ob-msg ai">
              Three: Maths II at 9:00 (LH-1), Data Structures at 11:00 (LH-2), and the Java
              lab at 2:00 (Lab-2).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- For Students ---------------- */
export function StudentsSection() {
  return (
    <section className="ob-sec" id="ob-students">
      <div className="ob-sec-head center ob-reveal">
        <span className="ob-kicker">For Students</span>
        <h2 className="ob-h2">Built for how college actually works</h2>
        <p className="ob-lead">
          One account, your data only, private by design. Start with your subjects,
          import your calendar, add your timetable — Orbit grows more useful every week.
        </p>
      </div>
      <div className="ob-grid">
        {[
          ['First semester friendly', 'Add subjects in a minute, explore with demo data, go live whenever you\'re ready.'],
          ['Everything updates everything', 'Attendance syncs once from your Excel sheet — dashboards, alerts, goals and analytics all follow.'],
          ['Your data stays yours', 'Bank-grade row-level security. Nobody else can ever read your records.'],
          ['Works with your flow', 'Import CSV calendars, export everything, search across all of it with ⌘K.'],
        ].map(([t, d], i) => (
          <div key={t} className="ob-feat ob-reveal" style={{ ['--rd']: `${i * 0.07}s` }}>
            <div className="ob-feat-icon">{icon(GraduationCap)}</div>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Final CTA ---------------- */
export function FinalCTA({ onGetStarted }) {
  return (
    <section className="ob-final">
      <div className="ob-final-glow" />
      <div className="ob-sec-head center ob-reveal" style={{ position: 'relative', zIndex: 2 }}>
        <OrbitMark size={44} />
        <h2 className="ob-h2" style={{ marginTop: 22 }}>
          Enter your academic universe
        </h2>
        <p className="ob-lead" style={{ margin: '18px auto 0' }}>
          Free to start. Your college life, in one place.
        </p>
        <div className="ob-cta-row" style={{ justifyContent: 'center' }}>
          <button className="ob-btn ob-btn-white" onClick={onGetStarted}>
            Get started <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */
export function LandingFooter({ onNavigate }) {
  return (
    <footer className="ob-footer">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <OrbitMark size={20} withGlow={false} /> Orbit — your academic universe
      </span>
      <div className="ob-footer-links">
        <button onClick={() => onNavigate('ob-features')}>Features</button>
        <button onClick={() => onNavigate('ob-students')}>For Students</button>
        <button onClick={() => onNavigate('ob-about')}>About</button>
      </div>
      <span>© {new Date().getFullYear()} Orbit</span>
    </footer>
  );
}
