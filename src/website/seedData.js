// BST Section A seed data for Orbit's authenticated application.
// Sources of truth:
//   • The official BST Section A timetable (Section A, Ground Floor,
//     Classroom 5, B.Tech 2026–27, odd semester from 3 August 2026).
//   • The "S-VYASA × BST Academic Calendar 2026–27".
// Nothing is invented: no faculty names, no extra classes, no Saturday
// classes, no fake statistics. The Thursday and Friday 2:00–3:20 PM
// period holds TWO separate 40-minute classes (2:00–2:40 and 2:40–3:20)
// exactly as the official timetable shows. Tentative calendar dates
// keep their labels, and events published only as week-relative
// descriptions stay dateless.

const pad = (n) => String(n).padStart(2, '0');

export const SECTION = 'A';
export const VENUE = 'Ground Floor, Classroom 5';
export const ACADEMIC_YEAR = '2026-27';
export const SEMESTER_START = '2026-08-03'; // Odd semester begins

// ------------------------------------------------------------------
// Subjects — exactly the 10 listed for BST Section A. BTBC121/BTBC122
// are the lecture/laboratory codes of the same Java subject, so one
// subject row carries the primary code and the timetable rows carry
// the per-slot code in their notes.
// ------------------------------------------------------------------
export const BST_SUBJECTS = [
  { name: 'Programming for Problem Solving Using Java', code: 'BTBC121', kind: 'Lecture / Laboratory', color: '#a78bfa', credits: 4 },
  { name: 'AI Foundation - Introduction to Agents', code: '', kind: 'Lecture', color: '#67e8f9', credits: 3 },
  { name: 'Programming for Web Development - I', code: 'BTBC123', kind: 'Lecture/Laboratory', color: '#6ee7b7', credits: 4 },
  { name: 'Mathematics - I for Data Science', code: 'BTBC112', kind: 'Lecture/Tutorial', color: '#fbbf24', credits: 4 },
  { name: 'Programming/DSA Contest', code: '', kind: 'Contest', color: '#f472b6', credits: 2 },
  { name: 'Entrepreneurship and Business Communication', code: 'BTBC111', kind: 'Lecture / Practical', color: '#93c5fd', credits: 3 },
  { name: 'Environmental Science', code: 'BTCH112', kind: 'Lecture', color: '#86efac', credits: 2 },
  { name: 'Foundations of Yoga', code: 'YOGA102', kind: 'Lecture / Practical', color: '#c4b5fd', credits: 2 },
  { name: 'Mentorship / Doubt Session', code: '', kind: '', color: '#94a3b8', credits: 1 },
  { name: 'Club Activities', code: '', kind: '', color: '#7dd3fc', credits: 1 },
].map((s) => ({
  ...s,
  faculty: '', // never invented
  semester: 'Odd Semester 2026-27',
  target_percentage: 85,
  attendance_required_pct: 75,
  description: s.code ? `Course code ${s.code}` : '',
}));

// ------------------------------------------------------------------
// Weekly timetable, Monday–Friday (day 1–5). Times in 24h for the DB.
// Thursday & Friday 2:00–3:20 PM are TWO real 40-minute classes
// (2:00–2:40 and 2:40–3:20) — never merged into one block.
// Lunch (13:00–14:00) is a break and is NOT a class.
// ------------------------------------------------------------------
export const BST_SCHEDULE = [
  // Monday
  { day: 1, start_time: '09:00', end_time: '10:50', subject: 'Programming for Problem Solving Using Java', code: 'BTBC121', kind: 'Lecture' },
  { day: 1, start_time: '11:00', end_time: '13:00', subject: 'AI Foundation - Introduction to Agents', code: '', kind: 'Lecture' },
  { day: 1, start_time: '14:00', end_time: '15:20', subject: 'Programming for Problem Solving Using Java', code: 'BTBC122', kind: 'Laboratory' },
  { day: 1, start_time: '15:30', end_time: '17:00', subject: 'Programming for Web Development - I', code: 'BTBC123', kind: 'Lecture/Laboratory' },
  // Tuesday
  { day: 2, start_time: '09:00', end_time: '10:50', subject: 'Mathematics - I for Data Science', code: 'BTBC112', kind: 'Lecture/Tutorial' },
  { day: 2, start_time: '11:00', end_time: '13:00', subject: 'Programming/DSA Contest', code: '', kind: 'Contest' },
  { day: 2, start_time: '14:00', end_time: '15:20', subject: 'Entrepreneurship and Business Communication', code: 'BTBC111', kind: 'Lecture' },
  { day: 2, start_time: '15:30', end_time: '17:00', subject: 'Entrepreneurship and Business Communication', code: 'BTBC111', kind: 'Practical' },
  // Wednesday (same pattern as Monday)
  { day: 3, start_time: '09:00', end_time: '10:50', subject: 'Programming for Problem Solving Using Java', code: 'BTBC121', kind: 'Lecture' },
  { day: 3, start_time: '11:00', end_time: '13:00', subject: 'AI Foundation - Introduction to Agents', code: '', kind: 'Lecture' },
  { day: 3, start_time: '14:00', end_time: '15:20', subject: 'Programming for Problem Solving Using Java', code: 'BTBC122', kind: 'Laboratory' },
  { day: 3, start_time: '15:30', end_time: '17:00', subject: 'Programming for Web Development - I', code: 'BTBC123', kind: 'Lecture/Laboratory' },
  // Thursday — two separate 40-minute classes: 2:00–2:40 Env Sci, 2:40–3:20 Yoga
  { day: 4, start_time: '09:00', end_time: '10:50', subject: 'Mathematics - I for Data Science', code: 'BTBC112', kind: 'Lecture/Tutorial' },
  { day: 4, start_time: '11:00', end_time: '13:00', subject: 'Programming/DSA Contest', code: '', kind: 'Contest' },
  { day: 4, start_time: '14:00', end_time: '14:40', subject: 'Environmental Science', code: 'BTCH112', kind: 'Lecture' },
  { day: 4, start_time: '14:40', end_time: '15:20', subject: 'Foundations of Yoga', code: 'YOGA102', kind: 'Lecture' },
  { day: 4, start_time: '15:30', end_time: '17:00', subject: 'Club Activities', code: '', kind: 'Club Activities / Doubt Session' },
  // Friday — two separate 40-minute classes: 2:00–2:40 Mentorship, 2:40–3:20 Env Sci
  { day: 5, start_time: '09:00', end_time: '10:50', subject: 'Foundations of Yoga', code: 'YOGA102', kind: 'Practical' },
  { day: 5, start_time: '11:00', end_time: '13:00', subject: 'Mentorship / Doubt Session', code: '', kind: 'Mentorship / Doubt Session' },
  { day: 5, start_time: '14:00', end_time: '14:40', subject: 'Mentorship / Doubt Session', code: '', kind: 'Mentorship' },
  { day: 5, start_time: '14:40', end_time: '15:20', subject: 'Environmental Science', code: 'BTCH112', kind: 'Lecture' },
  { day: 5, start_time: '15:30', end_time: '17:00', subject: 'Club Activities', code: '', kind: 'Club Activities' },
].map((c) => ({
  ...c,
  section: SECTION,
  room: VENUE,
  faculty: '', // never invented
  notes: c.code ? `${c.kind} · ${c.code}` : c.kind,
}));

// Timetable slot name → subject row name (Part 2 list) where the source
// uses a different label for the same activity.
export const SLOT_SUBJECT_ALIASES = {
  Mentorship: 'Mentorship / Doubt Session',
  'Club Activities / Doubt Session': 'Club Activities',
};

// Daily non-class period. Never counted as a class anywhere.
export const LUNCH = { start_time: '13:00', end_time: '14:00', title: 'Lunch Break', kind: 'Break' };

// ------------------------------------------------------------------
// Academic Calendar 2026–27 — dated events exactly as published.
//   semester: 'odd' | 'even'
//   cat: holiday | assessment | exam | deadline | meeting | event | semester
//   tentative: the official calendar itself marks the date as tentative
// Titles, hyphenation and "(only for UG)" wording are verbatim.
// ------------------------------------------------------------------
const ODD = 'Odd Semester';
const EVEN = 'Even Semester';
const SRC = 'Source: Official Academic Calendar 2026-27';

export const ACADEMIC_CALENDAR = [
  // ---------------- ODD SEMESTER ----------------
  { m: 8, d: 3, title: 'Commencement of Odd Semester (BST)', cat: 'semester', semester: ODD },
  { m: 9, d: 14, title: 'Government Holiday - Ganesh Chaturthi', cat: 'holiday', semester: ODD },
  { m: 9, d: 28, title: 'Freezing of Marks CIA - 1', cat: 'deadline', semester: ODD },
  { m: 10, d: 2, title: 'Government Holiday - Gandhi Jayanthi', cat: 'holiday', semester: ODD },
  { m: 10, d: 13, title: 'Class Committee Meeting - 1', cat: 'meeting', semester: ODD },
  { m: 10, d: 20, title: 'Government Holiday - Mahanavami & Ayudha Pooja', cat: 'holiday', semester: ODD },
  { m: 10, d: 21, title: 'Government Holiday - Vijayadashami', cat: 'holiday', semester: ODD },
  { m: 10, d: 26, title: 'Internal Assessment - 1', cat: 'assessment', semester: ODD },
  { m: 11, d: 4, title: 'Freezing of Marks IA - 1', cat: 'deadline', semester: ODD },
  { m: 11, d: 6, title: 'Parent Teacher Meeting (only for UG)', cat: 'meeting', semester: ODD },
  { m: 11, d: 10, title: 'Government Holiday - Balipadyami / Deepavali', cat: 'holiday', semester: ODD },
  { m: 11, d: 17, title: 'Freezing of Marks CIA - 2', cat: 'deadline', semester: ODD },
  { m: 11, d: 20, title: 'Class Committee Meeting - 2', cat: 'meeting', semester: ODD },
  { m: 12, d: 7, title: 'Internal Assessment - 2', cat: 'assessment', semester: ODD },
  { m: 12, d: 16, title: 'Freezing of Marks IA - 2', cat: 'deadline', semester: ODD },
  { m: 12, d: 25, title: 'Government Holiday - Christmas Day', cat: 'holiday', semester: ODD },
  { m: 1, d: 1, title: 'Commemoration Day - Kalpatharu Day', cat: 'event', semester: ODD },
  { m: 1, d: 5, title: 'Freezing of Marks CIA - 3/P', cat: 'deadline', semester: ODD },
  { m: 1, d: 11, endDay: 14, title: 'Semester End Practical Exams', cat: 'exam', semester: ODD },
  { m: 1, d: 12, title: 'Convocation', cat: 'event', semester: ODD },
  { m: 1, d: 15, title: 'Government Holiday - Makar Sankranti', cat: 'holiday', semester: ODD },
  { m: 1, d: 18, title: 'Announcement of Consolidated IA + CIA Marks', cat: 'deadline', semester: ODD },
  { m: 1, d: 20, title: 'Freezing of SEE Practical Marks', cat: 'deadline', semester: ODD },
  { m: 1, d: 26, title: 'Government Holiday - Republic Day', cat: 'holiday', semester: ODD },
  { m: 1, d: 27, title: 'Commencement of Semester End Examination - Jan 2027', cat: 'exam', semester: ODD, tentative: true },

  // ---------------- EVEN SEMESTER ----------------
  { m: 2, d: 19, title: 'Commencement of Even Semester', cat: 'semester', semester: EVEN },
  { m: 3, d: 12, title: 'Freezing of course registration in ERP', cat: 'deadline', semester: EVEN },
  { m: 3, d: 22, title: 'Freezing of Marks CIA - 1', cat: 'deadline', semester: EVEN },
  { m: 3, d: 26, title: 'Government Holiday - Good Friday', cat: 'holiday', semester: EVEN },
  { m: 3, d: 31, title: 'Class Committee Meeting - 1', cat: 'meeting', semester: EVEN },
  { m: 4, d: 5, endDay: 7, title: 'Internal Assessment - 1', cat: 'assessment', semester: EVEN },
  { m: 4, d: 8, title: 'Government Holiday - Ugadi', cat: 'holiday', semester: EVEN },
  { m: 4, d: 14, title: 'Government Holiday - Ambedkar Jayanthi', cat: 'holiday', semester: EVEN },
  { m: 4, d: 16, title: 'Freezing of Marks IA - 1', cat: 'deadline', semester: EVEN },
  { m: 4, d: 23, title: 'Parents Teacher Meeting (only for UG)', cat: 'meeting', semester: EVEN },
  { m: 5, d: 1, title: 'Government Holiday - May Day', cat: 'holiday', semester: EVEN },
  { m: 5, d: 7, title: 'Freezing of Marks CIA - 2', cat: 'deadline', semester: EVEN },
  { m: 5, d: 20, title: 'Class Committee Meeting - 2', cat: 'meeting', semester: EVEN },
  { m: 6, d: 7, endDay: 9, title: 'Internal Assessment - 2', cat: 'assessment', semester: EVEN },
  { m: 6, d: 16, title: 'Freezing of Marks IA - 2', cat: 'deadline', semester: EVEN },
  { m: 6, d: 21, title: 'International Day of Yoga', cat: 'event', semester: EVEN },
  { m: 6, d: 23, title: 'Freezing of Marks CIA - 3/P', cat: 'deadline', semester: EVEN },
  { m: 6, d: 29, title: 'Announcement of Consolidated IA + CIA Marks', cat: 'deadline', semester: EVEN },
  { m: 7, d: 7, title: 'Commencement of Semester End Examination - July 2027', cat: 'exam', semester: EVEN, tentative: true },
  { m: 8, d: 2, yr: 1, title: 'Commencement of Academic Year 2027–28', cat: 'semester', semester: EVEN, tentative: true },
];

// Official calendar entries published WITHOUT an exact date. These are
// never given invented dates; the Calendar page lists them separately
// as "dates to be announced".
export const ACADEMIC_CALENDAR_TENTATIVE = [
  { title: 'Announcement of Results (Odd Semester)', relative: '10 days from the last day of examination', semester: ODD, tentative: true, source: SRC },
  { title: 'Kala Vilas 2027', relative: '3rd week of May 2027', semester: EVEN, tentative: true, source: SRC },
  { title: 'Announcement of Results (SEE - July 2027)', relative: '10 days from the last day of examination', semester: EVEN, tentative: true, source: SRC },
  { title: 'Summer Term (Optional)', relative: '1st week of August 2027', semester: EVEN, tentative: true, source: SRC },
];

// Calendar category → academic_events.event_type + priority.
const CAT_MAP = {
  holiday: { event_type: 'holiday', priority: 'low' },
  assessment: { event_type: 'internal', priority: 'high' },
  exam: { event_type: 'endsem', priority: 'high' },
  deadline: { event_type: 'assignment', priority: 'normal' },
  meeting: { event_type: 'college_event', priority: 'low' },
  event: { event_type: 'college_event', priority: 'low' },
  semester: { event_type: 'semester_start', priority: 'normal' },
};

// Resolve the academic-year anchor: Aug–Dec → this year; Jan–Jul → the
// following year. `yr: 1` entries (next AY's August) shift one further.
export function calendarYear(now = new Date()) {
  const m = now.getMonth() + 1;
  return m >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

export function buildCalendarRows(now = new Date()) {
  const y = calendarYear(now);
  const rows = [];
  for (const e of ACADEMIC_CALENDAR) {
    const year = e.m >= 8 ? y + (e.yr || 0) : y + 1;
    const start = `${year}-${pad(e.m)}-${pad(e.d)}`;
    const end = e.endDay ? `${year}-${pad(e.m)}-${pad(e.endDay)}` : start;
    const meta = CAT_MAP[e.cat] || { event_type: 'other', priority: 'normal' };
    const title = e.tentative ? `${e.title} (Tentative)` : e.title;
    const description = [
      e.semester,
      e.tentative ? 'Date marked tentative in the official calendar' : '',
      `Duration: ${e.endDay ? `${e.endDay - e.d + 1} days` : '1 day'}`,
      SRC,
    ].filter(Boolean).join(' · ');
    rows.push({
      title,
      event_type: meta.event_type,
      start_date: start,
      end_date: end,
      priority: meta.priority,
      description,
      subject_id: null,
    });
  }
  return rows;
}
