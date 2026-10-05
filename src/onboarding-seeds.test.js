// Tests for the BST Section A onboarding seeds: subjects + weekly
// timetable + the S-VYASA 2026–27 academic calendar rows inserted into
// the authenticated user's database. These guard spec-conformance of
// exactly what first-login loads: nothing invented, nothing dropped.
import { describe, it, expect } from 'vitest';
import {
  BST_SUBJECTS, BST_SCHEDULE, LUNCH, SECTION, VENUE, ACADEMIC_YEAR,
  buildCalendarRows, calendarYear, ACADEMIC_CALENDAR_TENTATIVE,
} from './website/seedData.js';

describe('onboarding seed: BST subjects', () => {
  it('contains exactly the 10 spec subjects with verbatim names', () => {
    expect(BST_SUBJECTS).toHaveLength(10);
    const names = BST_SUBJECTS.map((s) => s.name);
    expect(names).toContain('Programming for Problem Solving Using Java');
    expect(names).toContain('AI Foundation - Introduction to Agents');
    expect(names).toContain('Programming for Web Development - I');
    expect(names).toContain('Mathematics - I for Data Science');
    expect(names).toContain('Programming/DSA Contest');
    expect(names).toContain('Entrepreneurship and Business Communication');
    expect(names).toContain('Environmental Science');
    expect(names).toContain('Foundations of Yoga');
    expect(names).toContain('Mentorship / Doubt Session');
    expect(names).toContain('Club Activities');
  });

  it('never invents faculty and carries sane defaults', () => {
    for (const s of BST_SUBJECTS) {
      expect(s.faculty).toBe('');
      expect(s.credits).toBeGreaterThanOrEqual(0);
      expect(s.target_percentage).toBe(85);
      expect(s.attendance_required_pct).toBe(75);
    }
  });

  it('carries the primary course codes from the spec', () => {
    const byName = Object.fromEntries(BST_SUBJECTS.map((s) => [s.name, s.code]));
    expect(byName['Programming for Problem Solving Using Java']).toBe('BTBC121');
    expect(byName['Programming for Web Development - I']).toBe('BTBC123');
    expect(byName['Mathematics - I for Data Science']).toBe('BTBC112');
    expect(byName['Entrepreneurship and Business Communication']).toBe('BTBC111');
    expect(byName['Environmental Science']).toBe('BTCH112');
    expect(byName['Foundations of Yoga']).toBe('YOGA102');
  });
});

describe('onboarding seed: BST weekly timetable', () => {
  it('has exactly 22 slots across Monday–Friday in Section A (no Saturday)', () => {
    expect(BST_SCHEDULE).toHaveLength(22);
    const days = new Set(BST_SCHEDULE.map((c) => c.day));
    expect([...days].sort()).toEqual([1, 2, 3, 4, 5]);
    for (const c of BST_SCHEDULE) expect(c.section).toBe(SECTION);
  });

  it('stores 24-hour times for the database (time columns)', () => {
    const java = BST_SCHEDULE.find((c) => c.day === 1 && c.code === 'BTBC121');
    expect(java.start_time).toBe('09:00');
    expect(java.end_time).toBe('10:50');
    const lab = BST_SCHEDULE.find((c) => c.day === 1 && c.code === 'BTBC122');
    expect(lab.start_time).toBe('14:00');
    expect(lab.end_time).toBe('15:20');
  });

  it('splits the Thursday/Friday 2:00–3:20 period into two real 40-minute classes', () => {
    const thu = BST_SCHEDULE.filter((c) => c.day === 4);
    expect(thu.map((c) => [c.start_time, c.end_time, c.subject])).toEqual([
      ['09:00', '10:50', 'Mathematics - I for Data Science'],
      ['11:00', '13:00', 'Programming/DSA Contest'],
      ['14:00', '14:40', 'Environmental Science'],
      ['14:40', '15:20', 'Foundations of Yoga'],
      ['15:30', '17:00', 'Club Activities'],
    ]);
    const fri = BST_SCHEDULE.filter((c) => c.day === 5);
    expect(fri.map((c) => [c.start_time, c.end_time, c.subject])).toEqual([
      ['09:00', '10:50', 'Foundations of Yoga'],
      ['11:00', '13:00', 'Mentorship / Doubt Session'],
      ['14:00', '14:40', 'Mentorship / Doubt Session'],
      ['14:40', '15:20', 'Environmental Science'],
      ['15:30', '17:00', 'Club Activities'],
    ]);
  });

  it('keeps every timetable subject name mapped to a spec subject (aliases resolve)', () => {
    const subjectNames = new Set(BST_SUBJECTS.map((s) => s.name));
    for (const c of BST_SCHEDULE) expect(subjectNames.has(c.subject)).toBe(true);
  });

  it('uses the real venue for every slot', () => {
    for (const c of BST_SCHEDULE) expect(c.room).toBe(VENUE);
  });

  it('keeps lunch as a separate break, never a class', () => {
    expect(LUNCH).toEqual({ start_time: '13:00', end_time: '14:00', title: 'Lunch Break', kind: 'Break' });
    const lunchAsClass = BST_SCHEDULE.filter((c) => c.start_time === '13:00' || /lunch/i.test(c.subject));
    expect(lunchAsClass).toHaveLength(0);
  });

  it('references the Section A academic year', () => {
    expect(ACADEMIC_YEAR).toBe('2026-27');
  });
});

describe('onboarding seed: academic calendar 2026–27', () => {
  it('builds one row per dated calendar entry with resolved ISO dates', () => {
    const rows = buildCalendarRows(new Date('2026-09-28T12:00:00'));
    expect(rows).toHaveLength(45);
  });

  it('uses verbatim event titles from the official calendar', () => {
    const rows = buildCalendarRows(new Date('2026-09-28T12:00:00'));
    const titles = rows.map((r) => r.title);
    expect(titles).toContain('Commencement of Odd Semester (BST)');
    expect(titles).toContain('Freezing of Marks CIA - 1');
    expect(titles).toContain('Government Holiday - Gandhi Jayanthi');
    expect(titles).toContain('Internal Assessment - 1');
    expect(titles).toContain('Semester End Practical Exams');
    expect(titles).toContain('Commencement of Semester End Examination - Jan 2027 (Tentative)');
  });

  it('resolves odd-semester dates into 2026 and the new year into 2027', () => {
    const rows = buildCalendarRows(new Date('2026-09-28T12:00:00'));
    const sem = rows.find((r) => r.title === 'Commencement of Odd Semester (BST)');
    expect(sem.start_date).toBe('2026-08-03');
    const cia1 = rows.find((r) => r.title === 'Freezing of Marks CIA - 1');
    expect(cia1.start_date).toBe('2026-09-28');
    const even = rows.find((r) => r.title === 'Commencement of Even Semester');
    expect(even.start_date).toBe('2027-02-19');
    const republic = rows.find((r) => r.title === 'Government Holiday - Republic Day');
    expect(republic.start_date).toBe('2027-01-26');
  });

  it('keeps multi-day ranges and pushes next-August entries forward', () => {
    const rows = buildCalendarRows(new Date('2026-09-28T12:00:00'));
    const exams = rows.find((r) => r.title === 'Semester End Practical Exams');
    expect(exams.start_date).toBe('2027-01-11');
    expect(exams.end_date).toBe('2027-01-14');
    const nextAY = rows.find((r) => r.title.includes('Academic Year 2027–28'));
    expect(nextAY.start_date).toBe('2027-08-02');
  });

  it('marks the official calendar tentative dates in the title and description', () => {
    const rows = buildCalendarRows(new Date('2026-09-28T12:00:00'));
    const see = rows.find((r) => r.title.startsWith('Commencement of Semester End Examination - Jan 2027'));
    expect(see.title).toContain('(Tentative)');
    expect(see.description).toContain('tentative');
    expect(see.description).toContain('Source: Official Academic Calendar 2026-27');
    const seeJuly = rows.find((r) => r.title.startsWith('Commencement of Semester End Examination - July 2027'));
    expect(seeJuly.title).toContain('(Tentative)');
  });

  it('never invents dates for week-relative events — they stay dateless', () => {
    for (const e of ACADEMIC_CALENDAR_TENTATIVE) {
      expect(e.start_date).toBeUndefined();
      expect(e.relative).toBeTruthy();
      expect(e.tentative).toBe(true);
    }
    const relatives = ACADEMIC_CALENDAR_TENTATIVE.map((e) => e.relative);
    expect(relatives).toContain('10 days from the last day of examination');
    expect(relatives).toContain('3rd week of May 2027');
    expect(relatives).toContain('1st week of August 2027');
  });

  it('never produces invalid date order', () => {
    const rows = buildCalendarRows();
    for (const r of rows) expect(r.end_date >= r.start_date).toBe(true);
  });

  it('resolves the academic-year anchor from the current date', () => {
    expect(calendarYear(new Date('2026-09-01'))).toBe(2026);
    expect(calendarYear(new Date('2026-03-01'))).toBe(2025);
  });
});
