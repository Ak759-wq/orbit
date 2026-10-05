// ============================================================
// Orbit design system — reusable components for the redesigned
// authenticated app. Soft rounded surfaces, subtle borders, very
// soft shadows, pastel accents, Orbit purple primary.
// Purely presentational: no data fetching, no side effects.
// ============================================================

import { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { monthGrid, monthName, addDaysISO } from '../../lib/datetime.js';

// Semantic tone → hex (for calendar dots, charts, timeline dots).
export const TONE_HEX = {
  purple: '#8b5cf6',
  lavender: '#a78bfa',
  blue: '#38bdf8',
  green: '#34d399',
  mint: '#34d399',
  coral: '#fb7185',
  orange: '#f59e0b',
  yellow: '#f59e0b',
  neutral: '#94a3b8',
};

export function toneHex(tone) {
  return TONE_HEX[tone] || TONE_HEX.neutral;
}

// ---------- Card ----------
export function OrbitCard({ as: Comp = 'div', hover = false, className = '', children, ...rest }) {
  return (
    <Comp className={`or-card ${hover ? 'or-card-hover' : ''} ${className}`} {...rest}>
      {children}
    </Comp>
  );
}

// ---------- Section (card with icon-chip header + optional action) ----------
export function OrbitSection({ icon: Icon, tone = 'purple', title, sub, action, bodyClass = 'p-4 md:p-5', className = '', children }) {
  return (
    <OrbitCard className={`flex flex-col ${className}`}>
      {(Icon || title || action) && (
        <div className="or-card-head">
          {Icon && (
            <span className={`or-icon-chip or-icon-chip-sm or-tone-${tone}`}>
              <Icon className="w-[18px] h-[18px]" strokeWidth={2.2} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-bold text-[15.5px] text-orbit-text leading-tight truncate">{title}</h2>
            {sub && <p className="text-[12px] text-orbit-text-mute mt-0.5 leading-snug">{sub}</p>}
          </div>
          {action && <div className="ml-auto shrink-0">{action}</div>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </OrbitCard>
  );
}

// ---------- Stat card ----------
export function OrbitStat({ icon: Icon, tone = 'purple', value, label, sub, onClick, className = '' }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`or-card or-stat or-stat-${tone} ${onClick ? 'or-card-hover cursor-pointer' : ''} p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 text-left w-full ${className}`}
    >
      {Icon && (
        <span className={`or-icon-chip or-tone-${tone} shadow-[0_0_22px_-6px_var(--or-accent,rgba(139,92,246,.9))]`}>
          <Icon className="w-5 h-5" strokeWidth={2.2} />
        </span>
      )}
      <span className="relative z-10 min-w-0">
        <span className="block text-[30px] md:text-[32px] font-extrabold leading-none text-orbit-text tracking-[-0.02em]">{value}</span>
        <span className="block text-[13px] font-semibold text-orbit-text-soft mt-2 leading-tight">{label}</span>
        {sub && <span className="block text-[12px] text-orbit-text-mute mt-1 leading-snug">{sub}</span>}
      </span>
      {onClick && <ChevronRight className="z-10 w-4 h-4 text-orbit-text-mute shrink-0 absolute top-4 right-4 sm:static sm:ml-auto" />}
    </Comp>
  );
}

// ---------- Badge / chip ----------
export function OrbitBadge({ tone = 'neutral', children, title, className = '' }) {
  return (
    <span className={`or-chip or-chip-${tone} ${className}`} title={title}>{children}</span>
  );
}

// ---------- Button ----------
export function OrbitButton({ variant = 'primary', size, className = '', children, ...rest }) {
  const sizeCls = size === 'sm' ? 'or-btn-sm' : size === 'lg' ? 'or-btn-lg' : '';
  return (
    <button className={`or-btn or-btn-${variant} ${sizeCls} ${className}`} {...rest}>
      {children}
    </button>
  );
}

// ---------- Empty state ----------
export function OrbitEmptyState({ icon: Icon, art, title, sub, action, compact = false }) {
  return (
    <div className={`or-empty ${compact ? '!py-6' : ''}`}>
      {art}
      {!art && Icon && (
        <div className="or-empty-icon">
          <Icon className="w-8 h-8" strokeWidth={1.8} />
        </div>
      )}
      <h3 className="font-bold text-[15px] text-orbit-text">{title}</h3>
      {sub && <p className="text-[13px] text-orbit-text-mute mt-1 max-w-sm leading-relaxed">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------- Timeline ----------
// items: [{ id, icon, tone, title, sub, right, onClick }]
export function OrbitTimeline({ items, className = '' }) {
  return (
    <div className={`or-timeline space-y-3.5 ${className}`}>
      {items.map((it) => (
        <div key={it.id} className="or-timeline-item">
          <span className={`or-timeline-dot or-tone-${it.tone || 'neutral'}`}>
            {it.icon && <it.icon className="w-[18px] h-[18px]" strokeWidth={2.2} />}
          </span>
          <div className="min-w-0 flex-1 flex items-center gap-3 pt-1">
            <div className="min-w-0 flex-1">
              {it.badge}
              <p className={`text-[13.5px] font-semibold text-orbit-text truncate ${it.onClick ? 'cursor-pointer hover:text-orbit-purple' : ''}`} onClick={it.onClick} title={it.title}>
                {it.title}
              </p>
              {it.sub && <p className="text-[12px] text-orbit-text-mute mt-0.5 truncate">{it.sub}</p>}
            </div>
            {it.right && <div className="shrink-0">{it.right}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Progress ----------
export function OrbitProgress({ value, tone = '#8b5cf6', size = '', className = '' }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const sizeCls = size === 'sm' ? 'or-progress-sm' : size === 'lg' ? 'or-progress-lg' : '';
  return (
    <div className={`or-progress ${sizeCls} ${className}`}>
      <div style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

// ---------- Modal ----------
export function OrbitModal({ title, onClose, children, wide = false, footer }) {
  return (
    <div className="or-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`or-modal w-full ${wide ? 'max-w-2xl' : 'max-w-md'} my-4`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-orbit-border">
          <h2 className="font-bold text-[15px] text-orbit-text">{title}</h2>
          <button onClick={onClose} className="or-iconbtn" aria-label="Close">
            <X className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </div>
        <div className="p-5 max-h-[74vh] overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-orbit-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Page header ----------
export function OrbitPageHeader({ kicker, title, sub, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        {kicker && <p className="or-kicker">{kicker}</p>}
        <h1 className="text-[22px] md:text-[26px] font-extrabold tracking-tight text-orbit-text mt-1 leading-tight">{title}</h1>
        {sub && <p className="text-orbit-text-mute text-[13px] mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Skeleton ----------
export function OrbitSkeleton({ className = '' }) {
  return <div className={`or-skeleton ${className}`} aria-hidden="true" />;
}

// ---------- Calendar ----------
// items: [{ id, date: 'YYYY-MM-DD', color: hex, title }]
// Renders a compact month grid; days with items show tiny colored dots;
// selecting a day lists that day's items beneath the grid.
export function OrbitCalendar({ initialMonth, today, items = [], legend, onOpenDay, className = '' }) {
  const [ref, setRef] = useState(initialMonth || today);
  const [selected, setSelected] = useState(null);
  const grid = useMemo(() => monthGrid(ref), [ref]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (!it.date) continue;
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date).push(it);
    }
    return m;
  }, [items]);

  const selectedItems = selected ? (byDay.get(selected) ?? []) : null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="font-bold text-[14.5px] text-orbit-text">{monthName(ref)}</p>
        <div className="flex items-center gap-1">
          <button className="or-iconbtn or-iconbtn-bordered w-8 h-8 rounded-lg" onClick={() => setRef(addDaysISO(ref, -28))} aria-label="Previous month">
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.4} />
          </button>
          <button className="or-iconbtn or-iconbtn-bordered w-8 h-8 rounded-lg" onClick={() => setRef(addDaysISO(ref, 28))} aria-label="Next month">
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.4} />
          </button>
        </div>
      </div>
      <div className="px-3 pb-3">
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
            <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-orbit-text-mute py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {grid.flat().map((iso) => {
            const inMonth = iso.slice(0, 7) === ref.slice(0, 7);
            const dayItems = byDay.get(iso) ?? [];
            const isToday = iso === today;
            const isSel = iso === selected;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso === selected ? null : iso)}
                className={`or-cal-cell ${isToday ? 'today' : ''} ${isSel ? 'sel' : ''} ${!inMonth ? 'dim' : ''}`}
                title={dayItems.map((e) => e.title).join(', ') || undefined}
              >
                <span className="leading-none">{Number(iso.slice(8))}</span>
                {dayItems.length > 0 && (
                  <span className="or-cal-dots">
                    {dayItems.slice(0, 3).map((e, i) => (
                      <span key={`${e.id}-${i}`} className="or-cal-dot" style={{ background: isToday ? '#ffffff' : e.color }} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {legend && legend.length > 0 && (
          <div className="or-cal-legend flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-2.5 pb-1">
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-orbit-text-mute">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        )}
        {selected && (
          <div className="or-inset mt-2 p-3 animate-rise-in">
            <p className="text-[11px] font-bold text-orbit-text-soft mb-1.5">
              {new Date(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)) - 1, Number(selected.slice(8))).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            {selectedItems.length === 0 ? (
              <p className="text-[11.5px] text-orbit-text-mute">Nothing scheduled on this day.</p>
            ) : (
              <div className="space-y-1">
                {selectedItems.map((e) => (
                  <div key={e.id} className="text-[11.5px] font-semibold text-orbit-text flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: e.color }} />
                    <span className="truncate">{e.title}</span>
                    {e.sub && <span className="shrink-0 text-[10px] font-semibold text-orbit-text-mute">· {e.sub}</span>}
                  </div>
                ))}
              </div>
            )}
            {onOpenDay && (
              <button onClick={() => onOpenDay(selected)} className="or-link text-[11px] mt-2 inline-flex items-center gap-1">
                Open full calendar <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Charts (zero-dependency SVG) ----------
export function Sparkline({ values = [], color = '#8b5cf6', width = 240, height = 60, className = '' }) {
  const pts = values.filter((v) => v != null && Number.isFinite(v));
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 6;
  const stepX = (width - pad * 2) / (pts.length - 1);
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lastX = pad + (pts.length - 1) * stepX;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className={className} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={y(pts[pts.length - 1])} r="3.5" fill={color} />
    </svg>
  );
}

// data: [{ label, value, color }]
export function MiniBars({ data = [], height = 150, format = (v) => v, className = '' }) {
  const nums = data.map((d) => d.value).filter((v) => v != null && Number.isFinite(v));
  if (!data.length || !nums.length) return null;
  const max = Math.max(...nums, 1);
  return (
    <div className={`flex items-end gap-2 md:gap-3 ${className}`} style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 h-full justify-end" title={`${d.label}: ${format(d.value)}`}>
          <span className="text-[10.5px] font-bold text-orbit-text-soft">{d.value == null ? '—' : format(d.value)}</span>
          <div
            className="w-full max-w-[34px] rounded-t-lg transition-all"
            style={{
              height: `${Math.max(((d.value ?? 0) / max) * (height - 34), d.value != null ? 3 : 0)}px`,
              background: d.color || '#8b5cf6',
              opacity: d.value == null ? 0.25 : 1,
            }}
          />
          <span className="text-[10px] font-semibold text-orbit-text-mute truncate w-full text-center leading-tight">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({ pct, size = 96, stroke = 10, color = '#34d399', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="or-ring-bg" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(c * p) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="or-ring-fg"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ---------- Legend ----------
export function Legend({ items, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3.5 gap-y-1 ${className}`}>
      {items.map((l) => (
        <span key={l.label} className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-orbit-text-mute">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.color }} />
          {l.label}
        </span>
      ))}
    </div>
  );
}
