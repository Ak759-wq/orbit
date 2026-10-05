// Date & time helpers. Everything derives "today" from the local clock
// and works with plain 'YYYY-MM-DD' strings to avoid timezone drift.
// Leap years, month lengths and multi-day spans rely on Date rollover.

export const DAY_MS = 86400000;

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

// 'YYYY-MM-DD' → Date at local midnight. Safe: no TZ shifting.
export function parseISO(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Whole days from ISO "from" to ISO "to" (negative = past).
export function daysBetween(fromISO, toISO) {
  const a = parseISO(fromISO);
  const b = parseISO(toISO);
  if (!a || !b) return null;
  return Math.round((b - a) / DAY_MS);
}

export function addDaysISO(iso, n) {
  const d = parseISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function dayOfWeek(iso) {
  const d = parseISO(iso);
  return d ? d.getDay() : null;
}

// Monday=0 … Sunday=6 index for grid layouts
export function mondayIndex(iso) {
  const dow = dayOfWeek(iso);
  return dow === null ? null : (dow + 6) % 7;
}

// 'HH:MM' or 'HH:MM:SS' → minutes since midnight (null if invalid)
export function timeToMinutes(t) {
  if (!t || typeof t !== 'string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

export function minutesToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtTime12(t) {
  const mins = timeToMinutes(t);
  if (mins == null) return t || '';
  return minutesTo12h(mins);
}

export function minutesTo12h(mins) {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const mer = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${mer}`;
}

export function fmtDuration(mins) {
  if (mins == null || Number.isNaN(mins)) return '';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Human countdown: "Today", "Tomorrow", "5 days remaining", "3 days passed"
export function countdownLabel(dateISO, todayIso = todayISO()) {
  const n = daysBetween(todayIso, dateISO);
  if (n == null) return '';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1) return `${n} days remaining`;
  if (n === -1) return 'Yesterday';
  return `${Math.abs(n)} days passed`;
}

// Start of the ISO week (Monday) containing the given ISO date
export function weekStart(iso = todayISO()) {
  const mi = mondayIndex(iso);
  return mi === null ? null : addDaysISO(iso, -mi);
}

export function inRange(iso, startISO, endISO) {
  if (!iso || !startISO || !endISO) return false;
  return iso >= startISO && iso <= endISO;
}

// Is the event [start,end] "live" today?
export function isEventToday(startISO, endISO, todayIso = todayISO()) {
  return startISO <= todayIso && endISO >= todayIso;
}

export function isSameMonth(iso, refISO = todayISO()) {
  return iso?.slice(0, 7) === refISO?.slice(0, 7);
}

// All ISO dates in the month grid (Mon-start) covering `refISO`
export function monthGrid(refISO = todayISO()) {
  const d = parseISO(refISO);
  if (!d) return [];
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - ((first.getDay() + 6) % 7));
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const cell = new Date(gridStart);
      cell.setDate(gridStart.getDate() + w * 7 + i);
      row.push(toISODate(cell));
      if (w >= 4) {
        const nextMonth = new Date(cell.getFullYear(), cell.getMonth() + 1, 1);
        if (cell >= nextMonth) { row.pop(); break; }
      }
    }
    if (row.length) weeks.push(row);
    const lastPushed = row.length ? row[row.length - 1] : null;
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    if (lastPushed && lastPushed >= toISODate(monthEnd)) break;
  }
  return weeks;
}

export function monthName(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parseISO(iso);
  if (!d) return iso || '';
  return d.toLocaleDateString(undefined, opts);
}

export function fmtWeekday(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}
