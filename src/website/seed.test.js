// Spec-conformance tests: the seeded schedule, subjects and academic
// calendar must match the official BST Section A timetable and the
// S-VYASA Academic Calendar 2026–27 EXACTLY — verbatim names, real
// 40-minute Thursday/Friday afternoon classes, no invented dates, no
// dropped tentative labels. If someone edits the seed, these fail.
import { describe, it, expect } from 'vitest';
import {
  BST_SCHEDULE, BST_SUBJECTS, ACADEMIC_CALENDAR, ACADEMIC_CALENDAR_TENTATIVE,
  buildCalendarRows, calendarYear, VENUE, SECTION, LUNCH,
} from './seedData.js';
import * as db from './localdb.js';

// '09:00' helper for readable expectations
const t = (h, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

const byDay = (d) => BST_SCHEDULE.filter((c) => c.day === d);

describe('BST timetable seed — exact conformance', () => {
  it('covers Monday to Friday only (no invented Saturday classes)', () => {
    const days = new Set(BST_SCHEDULE.map((c) => c.day));
    expect([...days].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('carries section A and the real classroom on every entry', () => {
    for (const c of BST_SCHEDULE) {
      expect(c.section).toBe('A');
      expect(c.room).toBe('Ground Floor, Classroom 5');
    }
    expect(VENUE).toBe('Ground Floor, Classroom 5');
    expect(SECTION).toBe('A');
  });

  it('has no faculty names (not present in the source timetable)', () => {
    for (const c of BST_SCHEDULE) expect(c.faculty || '').toBe('');
    for (const s of BST_SUBJECTS) expect(s.faculty || '').toBe('');
  });

  it('Monday matches the timetable exactly', () => {
    expect(byDay(1).map((c) => [c.start_time, c.end_time, c.subject, c.code, c.kind])).toEqual([
      [t(9), t(10, 50), 'Programming for Problem Solving Using Java', 'BTBC121', 'Lecture'],
      [t(11), t(13), 'AI Foundation - Introduction to Agents', '', 'Lecture'],
      [t(14), t(15, 20), 'Programming for Problem Solving Using Java', 'BTBC122', 'Laboratory'],
      [t(15, 30), t(17), 'Programming for Web Development - I', 'BTBC123', 'Lecture/Laboratory'],
    ]);
  });

  it('Tuesday matches the timetable exactly', () => {
    expect(byDay(2).map((c) => [c.start_time, c.end_time, c.subject, c.code, c.kind])).toEqual([
      [t(9), t(10, 50), 'Mathematics - I for Data Science', 'BTBC112', 'Lecture/Tutorial'],
      [t(11), t(13), 'Programming/DSA Contest', '', 'Contest'],
      [t(14), t(15, 20), 'Entrepreneurship and Business Communication', 'BTBC111', 'Lecture'],
      [t(15, 30), t(17), 'Entrepreneurship and Business Communication', 'BTBC111', 'Practical'],
    ]);
  });

  it('Wednesday mirrors Monday', () => {
    expect(byDay(3).map((c) => [c.start_time, c.end_time, c.subject, c.code, c.kind])).toEqual(
      byDay(1).map((c) => [c.start_time, c.end_time, c.subject, c.code, c.kind]),
    );
  });

  it('Thursday splits 2:00–3:20 into two real 40-minute classes', () => {
    expect(byDay(4).map((c) => [c.start_time, c.end_time, c.subject, c.code, c.kind])).toEqual([
      [t(9), t(10, 50), 'Mathematics - I for Data Science', 'BTBC112', 'Lecture/Tutorial'],
      [t(11), t(13), 'Programming/DSA Contest', '', 'Contest'],
      [t(14), t(14, 40), 'Environmental Science', 'BTCH112', 'Lecture'],
      [t(14, 40), t(15, 20), 'Foundations of Yoga', 'YOGA102', 'Lecture'],
      [t(15, 30), t(17), 'Club Activities', '', 'Club Activities / Doubt Session'],
    ]);
  });

  it('Friday splits 2:00–3:20 into two real 40-minute classes', () => {
    expect(byDay(5).map((c) => [c.start_time, c.end_time, c.subject, c.code, c.kind])).toEqual([
      [t(9), t(10, 50), 'Foundations of Yoga', 'YOGA102', 'Practical'],
      [t(11), t(13), 'Mentorship / Doubt Session', '', 'Mentorship / Doubt Session'],
      [t(14), t(14, 40), 'Mentorship / Doubt Session', '', 'Mentorship'],
      [t(14, 40), t(15, 20), 'Environmental Science', 'BTCH112', 'Lecture'],
      [t(15, 30), t(17), 'Club Activities', '', 'Club Activities'],
    ]);
  });

  it('creates exactly the ten spec subjects with their codes', () => {
    const codes = Object.fromEntries(BST_SUBJECTS.map((s) => [s.name, s.code]));
    expect(Object.keys(codes)).toEqual([
      'Programming for Problem Solving Using Java',
      'AI Foundation - Introduction to Agents',
      'Programming for Web Development - I',
      'Mathematics - I for Data Science',
      'Programming/DSA Contest',
      'Entrepreneurship and Business Communication',
      'Environmental Science',
      'Foundations of Yoga',
      'Mentorship / Doubt Session',
      'Club Activities',
    ]);
    expect(codes['Programming for Problem Solving Using Java']).toBe('BTBC121');
    expect(codes['Mathematics - I for Data Science']).toBe('BTBC112');
    expect(codes['Environmental Science']).toBe('BTCH112');
    expect(codes['Foundations of Yoga']).toBe('YOGA102');
    expect(codes['Entrepreneurship and Business Communication']).toBe('BTBC111');
    expect(codes['Programming for Web Development - I']).toBe('BTBC123');
  });

  it('links every schedule slot to a spec subject (names are 1:1)', () => {
    const names = BST_SUBJECTS.map((s) => s.name);
    for (const c of BST_SCHEDULE) expect(names).toContain(c.subject);
  });

  it('never schedules a class during the 1–2 PM lunch break', () => {
    expect(LUNCH).toEqual({ start_time: '13:00', end_time: '14:00', title: 'Lunch Break', kind: 'Break' });
    for (const c of BST_SCHEDULE) {
      const startsInLunch = c.start_time >= '13:00' && c.start_time < '14:00';
      expect(startsInLunch).toBe(false);
    }
  });
});

describe('Academic calendar 2026–27 — exact conformance', () => {
  it('resolves the 2026–27 academic year correctly', () => {
    expect(calendarYear(new Date('2026-09-15'))).toBe(2026);
    expect(calendarYear(new Date('2027-03-10'))).toBe(2026);
  });

  it('contains the key published dates with verbatim titles', () => {
    const titles = ACADEMIC_CALENDAR.map((e) => e.title);
    expect(titles).toContain('Commencement of Odd Semester (BST)');
    expect(titles).toContain('Commencement of Even Semester');
    expect(titles).toContain('Commencement of Academic Year 2027–28');
    expect(titles).toContain('Freezing of Marks CIA - 1');
    expect(titles).toContain('Freezing of Marks IA - 2');
    expect(titles).toContain('Commencement of Semester End Examination - Jan 2027');
    expect(titles).toContain('Commencement of Semester End Examination - July 2027');
    // Relative events are kept OUT of the dated list (no invented dates).
    expect(titles).not.toContain('Kala Vilas 2027');
    expect(titles).not.toContain('Summer Term (Optional)');
  });

  it('keeps the week-relative events dateless, exactly as published', () => {
    const relatives = ACADEMIC_CALENDAR_TENTATIVE.map((e) => [e.title, e.relative]);
    expect(relatives).toEqual([
      ['Announcement of Results (Odd Semester)', '10 days from the last day of examination'],
      ['Kala Vilas 2027', '3rd week of May 2027'],
      ['Announcement of Results (SEE - July 2027)', '10 days from the last day of examination'],
      ['Summer Term (Optional)', '1st week of August 2027'],
    ]);
  });

  it('seeds single-day Internal Assessments in the odd semester', () => {
    const rows = buildCalendarRows(new Date('2026-09-15'));
    const ia1 = rows.find((r) => r.title === 'Internal Assessment - 1' && r.start_date.endsWith('-10-26'));
    const ia2 = rows.find((r) => r.title === 'Internal Assessment - 2' && r.start_date.endsWith('-12-07'));
    expect(ia1.start_date).toBe(ia1.end_date);
    expect(ia2.start_date).toBe(ia2.end_date);
  });

  it('keeps multi-day spans (practical exams, even-sem IA1)', () => {
    const rows = buildCalendarRows(new Date('2026-09-15'));
    const prac = rows.find((r) => r.title === 'Semester End Practical Exams');
    expect(prac.start_date).toBe('2027-01-11');
    expect(prac.end_date).toBe('2027-01-14');
    const ia1e = rows.find((r) => r.title === 'Internal Assessment - 1' && r.start_date.startsWith('2027-04'));
    expect(ia1e.start_date).toBe('2027-04-05');
    expect(ia1e.end_date).toBe('2027-04-07');
  });

  it('places next-AY August events in August 2027, not 2026', () => {
    const rows = buildCalendarRows(new Date('2026-09-15'));
    const ay = rows.find((r) => r.title.includes('Academic Year 2027–28'));
    expect(ay.start_date).toBe('2027-08-02');
    expect(ay.title).toContain('(Tentative)');
  });

  it('includes all 12 government holidays with verbatim names', () => {
    const rows = buildCalendarRows(new Date('2026-09-15'));
    const holidays = rows.filter((r) => r.event_type === 'holiday').map((r) => r.title);
    expect(holidays).toEqual([
      'Government Holiday - Ganesh Chaturthi',
      'Government Holiday - Gandhi Jayanthi',
      'Government Holiday - Mahanavami & Ayudha Pooja',
      'Government Holiday - Vijayadashami',
      'Government Holiday - Balipadyami / Deepavali',
      'Government Holiday - Christmas Day',
      'Government Holiday - Makar Sankranti',
      'Government Holiday - Republic Day',
      'Government Holiday - Good Friday',
      'Government Holiday - Ugadi',
      'Government Holiday - Ambedkar Jayanthi',
      'Government Holiday - May Day',
    ]);
  });

  it('matches every published date in the chronological calendar', () => {
    const rows = buildCalendarRows(new Date('2026-09-15'));
    const at = (y, m, d) => rows.find((r) => r.start_date === `${y}-${t(m).slice(0, 2)}-${t(d).slice(0, 2)}`);
    expect(at(2026, 8, 3).title).toBe('Commencement of Odd Semester (BST)');
    expect(at(2026, 9, 14).title).toBe('Government Holiday - Ganesh Chaturthi');
    expect(at(2026, 9, 28).title).toBe('Freezing of Marks CIA - 1');
    expect(at(2026, 10, 2).title).toBe('Government Holiday - Gandhi Jayanthi');
    expect(at(2026, 10, 13).title).toBe('Class Committee Meeting - 1');
    expect(at(2026, 10, 20).title).toBe('Government Holiday - Mahanavami & Ayudha Pooja');
    expect(at(2026, 10, 21).title).toBe('Government Holiday - Vijayadashami');
    expect(at(2026, 10, 26).title).toBe('Internal Assessment - 1');
    expect(at(2026, 11, 4).title).toBe('Freezing of Marks IA - 1');
    expect(at(2026, 11, 6).title).toBe('Parent Teacher Meeting (only for UG)');
    expect(at(2026, 11, 10).title).toBe('Government Holiday - Balipadyami / Deepavali');
    expect(at(2026, 11, 17).title).toBe('Freezing of Marks CIA - 2');
    expect(at(2026, 11, 20).title).toBe('Class Committee Meeting - 2');
    expect(at(2026, 12, 7).title).toBe('Internal Assessment - 2');
    expect(at(2026, 12, 16).title).toBe('Freezing of Marks IA - 2');
    expect(at(2026, 12, 25).title).toBe('Government Holiday - Christmas Day');
    expect(at(2027, 1, 1).title).toBe('Commemoration Day - Kalpatharu Day');
    expect(at(2027, 1, 5).title).toBe('Freezing of Marks CIA - 3/P');
    expect(at(2027, 1, 11).title).toBe('Semester End Practical Exams');
    expect(at(2027, 1, 12).title).toBe('Convocation');
    expect(at(2027, 1, 15).title).toBe('Government Holiday - Makar Sankranti');
    expect(at(2027, 1, 18).title).toBe('Announcement of Consolidated IA + CIA Marks');
    expect(at(2027, 1, 20).title).toBe('Freezing of SEE Practical Marks');
    expect(at(2027, 1, 26).title).toBe('Government Holiday - Republic Day');
    expect(at(2027, 1, 27).title).toBe('Commencement of Semester End Examination - Jan 2027 (Tentative)');
    expect(at(2027, 2, 19).title).toBe('Commencement of Even Semester');
    expect(at(2027, 3, 12).title).toBe('Freezing of course registration in ERP');
    expect(at(2027, 3, 22).title).toBe('Freezing of Marks CIA - 1');
    expect(at(2027, 3, 26).title).toBe('Government Holiday - Good Friday');
    expect(at(2027, 3, 31).title).toBe('Class Committee Meeting - 1');
    expect(at(2027, 4, 5).title).toBe('Internal Assessment - 1');
    expect(at(2027, 4, 8).title).toBe('Government Holiday - Ugadi');
    expect(at(2027, 4, 14).title).toBe('Government Holiday - Ambedkar Jayanthi');
    expect(at(2027, 4, 16).title).toBe('Freezing of Marks IA - 1');
    expect(at(2027, 4, 23).title).toBe('Parents Teacher Meeting (only for UG)');
    expect(at(2027, 5, 1).title).toBe('Government Holiday - May Day');
    expect(at(2027, 5, 7).title).toBe('Freezing of Marks CIA - 2');
    expect(at(2027, 5, 20).title).toBe('Class Committee Meeting - 2');
    expect(at(2027, 6, 7).title).toBe('Internal Assessment - 2');
    expect(at(2027, 6, 16).title).toBe('Freezing of Marks IA - 2');
    expect(at(2027, 6, 21).title).toBe('International Day of Yoga');
    expect(at(2027, 6, 23).title).toBe('Freezing of Marks CIA - 3/P');
    expect(at(2027, 6, 29).title).toBe('Announcement of Consolidated IA + CIA Marks');
    expect(at(2027, 7, 7).title).toBe('Commencement of Semester End Examination - July 2027 (Tentative)');
  });

  it('marks the official tentative exam dates in title and description', () => {
    const rows = buildCalendarRows(new Date('2026-09-15'));
    const jan = rows.find((r) => r.title.includes('Semester End Examination - Jan 2027'));
    expect(jan.title).toContain('(Tentative)');
    expect(jan.description).toContain('tentative');
    const jul = rows.find((r) => r.title.includes('Semester End Examination - July 2027'));
    expect(jul.title).toContain('(Tentative)');
    const ay = rows.find((r) => r.title.includes('Academic Year 2027–28'));
    expect(ay.description).toContain('tentative');
    for (const r of rows) expect(r.description).toContain('Source: Official Academic Calendar 2026-27');
  });
});

describe('website DB behaviour', () => {
  it('seeds 22 schedule slots and the full calendar with ids', () => {
    expect(BST_SCHEDULE).toHaveLength(22);
    expect(buildCalendarRows()).toHaveLength(ACADEMIC_CALENDAR.length);
    // the persisted store assigns ids and links slots to subjects
    const events = db.list('events');
    expect(events).toHaveLength(ACADEMIC_CALENDAR.length);
    for (const e of events) expect(e.id).toBeGreaterThan(0);
    for (const c of db.list('schedule')) expect(c.subject_id).toBeGreaterThan(0);
  });

  it('excludes the 1–2 PM lunch break from free periods and reports it as lunch', () => {
    // Monday 2026-09-28, 10:55 AM: between Java lecture and AI Foundation.
    const mondayNoon = new Date(2026, 8, 28, 10, 55);
    const gaps = db.todayGaps(mondayNoon);
    expect(gaps.lunch).toEqual({ start_time: '13:00', end_time: '14:00', title: 'Lunch Break', kind: 'Break' });
    // The only 60-min gap on Monday IS lunch, so freePeriods must be empty.
    expect(gaps.freePeriods).toEqual([]);
  });

  it('computes live class status from the clock (not hardcoded)', () => {
    const during = db.todayClasses(new Date(2026, 8, 28, 9, 30)); // during Java lecture
    expect(during.current.subject).toBe('Programming for Problem Solving Using Java');
    expect(during.current.status).toBe('ongoing');
    expect(during.next.subject).toBe('AI Foundation - Introduction to Agents');

    const before = db.todayClasses(new Date(2026, 8, 28, 8, 0));
    expect(before.current).toBeNull();
    expect(before.next.status).toBe('upcoming');

    const after = db.todayClasses(new Date(2026, 8, 28, 17, 30));
    expect(after.current).toBeNull();
    expect(after.next).toBeNull();
    expect(after.classes.length).toBeGreaterThan(0);
    expect(after.classes.every((c) => c.status === 'completed')).toBe(true);
  });

  it('matches user-typed topic text to subjects (incl. slash names)', () => {
    expect(db.matchSubjectId('java collections')).toBeTruthy();
    expect(db.matchSubjectId('mentorship doubt')).toBeTruthy();
    expect(db.matchSubjectId('yoga')).toBeTruthy();
    expect(db.matchSubjectId('quantum physics')).toBeNull();
  });
});
