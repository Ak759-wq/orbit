// Shared UI primitives used across all modules.
// Restyled to the Orbit design system (premium academic OS).
// The public API of every export is unchanged — modules keep compiling
// while they are migrated to the Orbit components one by one.

import { Trash2 } from 'lucide-react';
import { OrbitButton, OrbitEmptyState, OrbitModal, OrbitPageHeader, OrbitProgress, OrbitStat } from './orbit/Orbit.jsx';

// Legacy brutal-* tone classes (used by not-yet-migrated callers) map to
// Orbit pastel tones so nothing regresses visually mid-migration.
const LEGACY_TONE = {
  'bg-brutal-purple': 'purple',
  'bg-brutal-blue': 'blue',
  'bg-brutal-red': 'coral',
  'bg-brutal-green': 'green',
  'bg-brutal-lime': 'green',
  'bg-brutal-orange': 'orange',
  'bg-brutal-yellow': 'yellow',
};

function normalizeTone(tone = 'purple') {
  return LEGACY_TONE[tone] || tone;
}

export function PageHeader({ kicker, title, sub, actions }) {
  return <OrbitPageHeader kicker={kicker} title={title} sub={sub} actions={actions} />;
}

export function EmptyState({ icon: Icon, title, sub, action }) {
  return <OrbitEmptyState icon={Icon} title={title} sub={sub} action={action} />;
}

export function StatCard({ label, value, sub, tone = 'purple', onClick }) {
  return (
    <OrbitStat
      icon={null}
      tone={normalizeTone(tone)}
      value={value}
      label={label}
      sub={sub}
      onClick={onClick}
    />
  );
}

// Dark-enough backgrounds get white text (contrast-safe auto color).
function readableText(hex) {
  if (typeof hex !== 'string' || !/^#([0-9a-f]{6})$/i.test(hex)) return '#0b1120';
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum < 150 ? '#ffffff' : '#0b1120';
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <OrbitModal title={title} onClose={onClose} wide={wide}>
      {children}
    </OrbitModal>
  );
}

export function Field({ label, error, children }) {
  return (
    <div className="mb-3">
      <label className="or-label">{label}</label>
      {children}
      {error && <p className="text-[11px] font-semibold text-orbit-coral mt-1">{error}</p>}
    </div>
  );
}

export function Badge({ bg, children, title }) {
  return (
    <span className="or-chip" style={{ background: bg, color: readableText(bg) }} title={title}>{children}</span>
  );
}

export function ProgressBar({ value, tone = '#8b5cf6' }) {
  return <OrbitProgress value={value} tone={tone} />;
}

export function Pct({ value, suffix = '%' }) {
  if (value == null || Number.isNaN(value)) return <span>—</span>;
  return <span>{value}{suffix}</span>;
}

export function ConfirmDialog({ title, message, onConfirm, onClose, confirmLabel = 'Delete' }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-[13.5px] text-orbit-text-soft mb-4 leading-relaxed">{message}</p>
      <div className="flex gap-2 justify-end">
        <OrbitButton variant="outline" onClick={onClose}>Cancel</OrbitButton>
        <OrbitButton variant="danger-solid" onClick={() => { onConfirm(); onClose(); }}>
          <Trash2 className="w-4 h-4" strokeWidth={2.2} /> {confirmLabel}
        </OrbitButton>
      </div>
    </Modal>
  );
}

// Segmented control for view switches (today/week, tabs, etc.)
export function TabBar({ tabs, active, onChange }) {
  return (
    <div className="or-seg mb-4">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={active === t.value ? 'on' : ''}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
