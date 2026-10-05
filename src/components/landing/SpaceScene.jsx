// Space scene pieces: canvas starfield (performant twinkling),
// the Saturn ring system, orbital paths with riding moons,
// satellites and comets. All CSS/SVG/Canvas — no video assets.

import { useEffect, useRef } from 'react';

/* ---------------- starfield canvas ---------------- */
export function Starfield({ density = 1 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let stars = [];
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const build = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.floor((w * h) / 5200 * density);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() < 0.85 ? Math.random() * 1.1 + 0.3 : Math.random() * 1.6 + 0.9,
        base: Math.random() * 0.5 + 0.25,
        amp: Math.random() * 0.45 + 0.1,
        speed: Math.random() * 0.0012 + 0.0004,
        phase: Math.random() * Math.PI * 2,
        hue: Math.random(),
      }));
    };

    const tint = (hue) => {
      if (hue < 0.72) return '255,255,255';
      if (hue < 0.87) return '196,181,253';
      return '103,232,249';
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const tw = s.base + Math.sin(t * s.speed + s.phase) * s.amp;
        const a = Math.max(0.05, Math.min(1, tw));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tint(s.hue)},${a})`;
        ctx.fill();
        if (s.r > 1.25) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${tint(s.hue)},${a * 0.08})`;
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };

    build();
    raf = requestAnimationFrame(draw);
    const onResize = () => build();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [density]);

  return <canvas ref={ref} className="ob-stars-canvas" aria-hidden="true" />;
}

/* ---------------- Saturn system ----------------
   Drawn in one SVG coordinate space (1400×760):
   rings as layered ellipses, three orbital paths, moons
   positioned via CSS rotation arms. Planet body is DOM
   (richer gradients + rim lighting) behind the front arcs. */
export function SaturnSystem() {
  return (
    <div className="ob-system" aria-hidden="true">
      {/* back half of rings + orbits (behind planet body) */}
      <svg className="ob-rings" width="1400" height="760" viewBox="0 0 1400 760">
        <defs>
          <linearGradient id="obRingA" x1="0" y1="0" x2="1400" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.05" />
            <stop offset="30%" stopColor="#a78bfa" stopOpacity="0.75" />
            <stop offset="55%" stopColor="#c4b5fd" stopOpacity="0.9" />
            <stop offset="78%" stopColor="#8b5cf6" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="obRingB" x1="0" y1="0" x2="1400" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.05" />
            <stop offset="45%" stopColor="#7dd3fc" stopOpacity="0.6" />
            <stop offset="70%" stopColor="#67e8f9" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="obRingC" x1="0" y1="0" x2="1400" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.03" />
            <stop offset="50%" stopColor="#6ee7b7" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.04" />
          </linearGradient>
          <radialGradient id="obMoonGrad" cx="32%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="45%" stopColor="#6d28d9" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </radialGradient>
        </defs>

        <g className="ob-ring-spin">
          {/* back arcs: only the upper (far) half of each ring is drawn here;
              the front half is drawn after the planet body. */}
          <path className="ob-ring-ellipse" d="M 130 470 A 570 150 0 0 1 1270 470" fill="none" stroke="url(#obRingA)" strokeWidth="30" opacity="0.5" />
          <path className="ob-ring-ellipse r2" d="M 190 480 A 510 132 0 0 1 1210 480" fill="none" stroke="url(#obRingB)" strokeWidth="16" opacity="0.55" />
          <path className="ob-ring-ellipse r3" d="M 250 492 A 450 112 0 0 1 1150 492" fill="none" stroke="url(#obRingC)" strokeWidth="8" opacity="0.5" />
          <path className="ob-ring-ellipse r4" d="M 90 462 A 610 164 0 0 1 1310 462" fill="none" stroke="url(#obRingB)" strokeWidth="5" opacity="0.4" />
        </g>

        {/* orbital paths (full ellipses, drawn behind planet) */}
        <ellipse className="ob-orbit-path" cx="700" cy="470" rx="640" ry="205" />
        <ellipse className="ob-orbit-path p2" cx="700" cy="470" rx="520" ry="160" />
        <ellipse className="ob-orbit-path p3" cx="700" cy="470" rx="800" ry="252" />
      </svg>

      {/* planet body sits between back and front ring arcs */}
      <div className="ob-planet-wrap">
        <div className="ob-planet" />
        <div className="ob-planet-rim" />
      </div>

      {/* front arcs of rings (in front of planet body) */}
      <svg className="ob-rings" width="1400" height="760" viewBox="0 0 1400 760">
        <g className="ob-ring-spin">
          <path className="ob-ring-ellipse" d="M 130 470 A 570 150 0 0 0 1270 470" fill="none" stroke="url(#obRingA)" strokeWidth="30" opacity="0.85" />
          <path className="ob-ring-ellipse r2" d="M 190 480 A 510 132 0 0 0 1210 480" fill="none" stroke="url(#obRingB)" strokeWidth="16" opacity="0.9" />
          <path className="ob-ring-ellipse r3" d="M 250 492 A 450 112 0 0 0 1150 492" fill="none" stroke="url(#obRingC)" strokeWidth="8" opacity="0.85" />
          <path className="ob-ring-ellipse r4" d="M 90 462 A 610 164 0 0 0 1310 462" fill="none" stroke="url(#obRingB)" strokeWidth="5" opacity="0.6" />
          {/* ring sheen highlights */}
          <path d="M 240 500 A 470 118 0 0 0 1160 500" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" opacity="0.5" />
        </g>
      </svg>

      {/* moons riding orbital paths: static squash wrapper → rotating arm */}
      <MoonArm rx={520} ry={160} size={54} dur={52} delay={-12} kind="mint" />
      <MoonArm rx={640} ry={205} size={30} dur={74} delay={-40} kind="dark" />
      <MoonArm rx={640} ry={205} size={44} dur={74} delay={-28} kind="plain" />
      <MoonArm rx={800} ry={252} size={22} dur={96} delay={-66} kind="dark" />
      <MoonArm rx={800} ry={252} size={34} dur={96} delay={-10} kind="plain" />
      <MoonArm rx={800} ry={252} size={16} dur={96} delay={-82} kind="dark" />
    </div>
  );
}

// One moon per orbit. A non-rotating wrapper applies the ellipse's
// vertical squash; inside it, the arm rotates a full circle while the
// moon sits translated rx px outward — tracing the drawn ellipse.
function MoonArm({ rx, ry, size, dur, delay, kind }) {
  const squash = ry / rx;
  return (
    <div className="ob-moon-arm">
      <div style={{ transform: `scaleY(${squash})` }}>
        <div
          className="ob-moon-arm-rot"
          style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
        >
          <div
            className={`ob-moon ${kind}`}
            style={{
              width: size,
              height: size,
              // counter-squash so the moon itself stays circular
              transform: `translateX(${rx}px) scaleY(${1 / squash})`,
              marginLeft: -size / 2,
              marginTop: -size / 2,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------------- satellite ---------------- */
export function Satellite({ variant = 'a' }) {
  return (
    <div className={`ob-sat ob-sat-${variant}`} aria-hidden="true">
      <svg width="54" height="54" viewBox="0 0 54 54" fill="none">
        <defs>
          <linearGradient id={`obSatG${variant}`} x1="0" y1="0" x2="54" y2="54">
            <stop offset="0%" stopColor="#e9e5ff" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <g transform="rotate(24 27 27)">
          <rect x="10" y="21" width="10" height="14" rx="2" fill={`url(#obSatG${variant})`} opacity="0.9" />
          <rect x="34" y="21" width="10" height="14" rx="2" fill={`url(#obSatG${variant})`} opacity="0.9" />
          <rect x="21" y="20" width="12" height="16" rx="3" fill="#2a2150" stroke="rgba(196,181,253,0.7)" strokeWidth="1.2" />
          <line x1="20" y1="28" x2="10" y2="28" stroke="rgba(196,181,253,0.6)" strokeWidth="1.4" />
          <line x1="34" y1="28" x2="44" y2="28" stroke="rgba(196,181,253,0.6)" strokeWidth="1.4" />
          <circle cx="27" cy="14" r="2.4" fill="#67e8f9" />
          <line x1="27" y1="16.5" x2="27" y2="20" stroke="rgba(103,232,249,0.7)" strokeWidth="1.2" />
        </g>
      </svg>
    </div>
  );
}

/* ---------------- comet ---------------- */
export function Comet({ variant = 'k1' }) {
  return <div className={`ob-comet ${variant}`} aria-hidden="true" />;
}
