// Orbit logo mark — small Saturn planet with ring.

export default function OrbitMark({ size = 26, withGlow = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {withGlow && (
        <defs>
          <radialGradient id="obMarkGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="obMarkRing" x1="0" y1="0" x2="32" y2="32">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#67e8f9" />
          </linearGradient>
          <radialGradient id="obMarkBall" cx="35%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#4c1d95" />
          </radialGradient>
        </defs>
      )}
      <circle cx="16" cy="16" r="15" fill="url(#obMarkGlow)" />
      <circle cx="16" cy="16" r="7.2" fill="url(#obMarkBall)" />
      <ellipse
        cx="16" cy="16" rx="13.5" ry="4.6"
        stroke="url(#obMarkRing)" strokeWidth="1.9"
        transform="rotate(-18 16 16)"
        opacity="0.95"
      />
    </svg>
  );
}
