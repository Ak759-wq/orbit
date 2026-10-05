import { describe, it, expect } from 'vitest';
import {
  toISODate, parseISO, daysBetween, addDaysISO, dayOfWeek, mondayIndex,
  timeToMinutes, minutesTo12h, countdownLabel, weekStart, monthGrid, isEventToday, fmtDuration,
} from './datetime.js';

describe('ISO basics', () => {
  it('toISODate pads correctly', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toISODate(new Date(2026, 10, 27))).toBe('2026-11-27');
  });
  it('parseISO round-trips', () => {
    expect(parseISO('2026-09-27')).not.toBeNull();
    expect(toISODate(parseISO('2026-09-27'))).toBe('2026-09-27');
  });
  it('parseISO rejects garbage', () => {
    expect(parseISO('not-a-date')).toBeNull();
    expect(parseISO('')).toBeNull();
  });
});

describe('date math (leap years & month lengths)', () => {
  it('addDaysISO crosses month boundaries', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28'); // 2026 not a leap year
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29'); // 2028 is a leap year
    expect(addDaysISO('2028-02-29', 1)).toBe('2028-03-01');
  });
  it('addDaysISO crosses year boundary', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('daysBetween is whole-day correct', () => {
    expect(daysBetween('2026-09-27', '2026-10-02')).toBe(5);
    expect(daysBetween('2026-10-02', '2026-09-27')).toBe(-5);
    expect(daysBetween('2026-09-27', '2026-09-27')).toBe(0);
  });
  it('dayOfWeek and mondayIndex', () => {
    expect(dayOfWeek('2026-09-27')).toBe(0); // Sunday
    expect(mondayIndex('2026-09-27')).toBe(6);
    expect(dayOfWeek('2026-09-28')).toBe(1); // Monday
    expect(mondayIndex('2026-09-28')).toBe(0);
  });
  it('weekStart returns the Monday', () => {
    expect(weekStart('2026-09-27')).toBe('2026-09-21'); // Sun → previous Mon
    expect(weekStart('2026-10-01')).toBe('2026-09-28'); // Thu → same week Mon
  });
});

describe('time helpers', () => {
  it('timeToMinutes parses HH:MM and HH:MM:SS', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('09:30:15')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
    expect(timeToMinutes('bad')).toBeNull();
  });
  it('minutesTo12h formats', () => {
    expect(minutesTo12h(0)).toBe('12:00 AM');
    expect(minutesTo12h(570)).toBe('9:30 AM');
    expect(minutesTo12h(750)).toBe('12:30 PM');
    expect(minutesTo12h(18 * 60)).toBe('6:00 PM');
  });
  it('fmtDuration', () => {
    expect(fmtDuration(90)).toBe('1h 30m');
    expect(fmtDuration(60)).toBe('1h');
    expect(fmtDuration(45)).toBe('45m');
  });
});

describe('countdownLabel', () => {
  it('today / tomorrow / days remaining / days passed', () => {
    expect(countdownLabel('2026-10-01', '2026-10-01')).toBe('Today');
    expect(countdownLabel('2026-10-02', '2026-10-01')).toBe('Tomorrow');
    expect(countdownLabel('2026-10-06', '2026-10-01')).toBe('5 days remaining');
    expect(countdownLabel('2026-09-30', '2026-10-01')).toBe('Yesterday');
    expect(countdownLabel('2026-09-20', '2026-10-01')).toBe('11 days passed');
  });
});

describe('multi-day events', () => {
  it('isEventToday covers spans', () => {
    expect(isEventToday('2026-09-28', '2026-10-02', '2026-09-30')).toBe(true);
    expect(isEventToday('2026-09-28', '2026-09-29', '2026-10-01')).toBe(false);
    expect(isEventToday('2026-09-30', '2026-10-05', '2026-09-30')).toBe(true);
  });
});

describe('monthGrid', () => {
  it('starts on Monday and covers the whole month', () => {
    const weeks = monthGrid('2026-09-15');
    const flat = weeks.flat();
    expect(flat[0].endsWith('-01') || dayOfWeek(flat[0]) === 1).toBe(true);
    expect(flat).toContain('2026-09-01');
    expect(flat).toContain('2026-09-30');
    // all rows are 7 wide
    for (const w of weeks) expect(w).toHaveLength(7);
  });
  it('February leap year grid includes Feb 29', () => {
    const flat = monthGrid('2028-02-10').flat();
    expect(flat).toContain('2028-02-29');
  });
});
