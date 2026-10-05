// Input validation shared by every form, the CSV importer and
// the demo seeder. Each validator returns { ok, errors: {} }
// where errors maps field → human-readable message.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const NUM = (v) => v !== '' && v != null && Number.isFinite(Number(v));

// Calendar-valid check WITHOUT timezone round-trips: new Date(s+'T00:00:00')
// shifts by the local UTC offset, so e.g. in IST every date validated as the
// previous day. Parse components directly instead.
function isValidISODate(s) {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// ---------------- Subject ----------------
export function validateSubject(f) {
  const errors = {};
  if (!f.name?.trim()) errors.name = 'Subject name is required.';
  if (f.name?.trim() && f.name.trim().length > 80) errors.name = 'Name must be 80 characters or fewer.';
  if (f.credits !== '' && f.credits != null && (!NUM(f.credits) || Number(f.credits) < 0)) errors.credits = 'Credits must be a number ≥ 0.';
  if (!NUM(f.target_percentage) || Number(f.target_percentage) < 0 || Number(f.target_percentage) > 100) errors.target_percentage = 'Target percentage must be between 0 and 100.';
  if (!NUM(f.attendance_required_pct) || Number(f.attendance_required_pct) < 0 || Number(f.attendance_required_pct) > 100) errors.attendance_required_pct = 'Attendance requirement must be between 0 and 100.';
  return { ok: Object.keys(errors).length === 0, errors };
}

// ---------------- Class slot ----------------
export function validateClassSlot(f) {
  const errors = {};
  if (!f.subject_id) errors.subject_id = 'Pick a subject.';
  if (f.day_of_week == null || f.day_of_week === '' || Number(f.day_of_week) < 0 || Number(f.day_of_week) > 6) errors.day_of_week = 'Pick a day.';
  if (!TIME.test(f.start_time || '')) errors.start_time = 'Start time must be HH:MM.';
  if (!TIME.test(f.end_time || '')) errors.end_time = 'End time must be HH:MM.';
  if (TIME.test(f.start_time || '') && TIME.test(f.end_time || '')) {
    const s = Number(f.start_time.slice(0, 2)) * 60 + Number(f.start_time.slice(3, 5));
    const e = Number(f.end_time.slice(0, 2)) * 60 + Number(f.end_time.slice(3, 5));
    if (e <= s) errors.end_time = 'End time must be after start time.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// ---------------- Calendar event ----------------
export function validateEvent(f) {
  const errors = {};
  if (!f.title?.trim()) errors.title = 'Event name is required.';
  if (!isValidISODate(f.start_date || '')) errors.start_date = 'Start date must be a valid date (YYYY-MM-DD).';
  if (!isValidISODate(f.end_date || '')) errors.end_date = 'End date must be a valid date (YYYY-MM-DD).';
  if (isValidISODate(f.start_date || '') && isValidISODate(f.end_date || '') && f.end_date < f.start_date) {
    errors.end_date = 'End date cannot be before start date.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// ---------------- Test ----------------
export function validateTest(f) {
  const errors = {};
  if (!f.name?.trim()) errors.name = 'Test name is required.';
  if (!f.subject_id) errors.subject_id = 'Pick a subject.';
  if (!isValidISODate(f.test_date || '')) errors.test_date = 'Test date must be a valid date (YYYY-MM-DD).';
  if (!NUM(f.max_marks)) errors.max_marks = 'Maximum marks is required.';
  else if (Number(f.max_marks) <= 0) errors.max_marks = 'Maximum marks must be greater than zero.';
  if (f.marks_obtained !== '' && f.marks_obtained != null) {
    if (!NUM(f.marks_obtained)) errors.marks_obtained = 'Marks obtained must be a number.';
    else if (Number(f.marks_obtained) < 0) errors.marks_obtained = 'Marks obtained cannot be negative.';
    else if (NUM(f.max_marks) && Number(f.max_marks) > 0 && Number(f.marks_obtained) > Number(f.max_marks)) {
      errors.marks_obtained = 'Marks obtained cannot exceed maximum marks.';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// ---------------- Assignment / task ----------------
export function validateAssignment(f) {
  const errors = {};
  if (!f.title?.trim()) errors.title = 'Task name is required.';
  if (!f.subject_id) errors.subject_id = 'Pick a subject.';
  if (!isValidISODate(f.due_date || '')) errors.due_date = 'Due date must be a valid date (YYYY-MM-DD).';
  if (f.submission_link && !/^https?:\/\/.+/i.test(f.submission_link)) errors.submission_link = 'Submission link must start with http:// or https://.';
  if (f.attachment_url && !/^https?:\/\/.+/i.test(f.attachment_url)) errors.attachment_url = 'Attachment URL must start with http:// or https://.';
  return { ok: Object.keys(errors).length === 0, errors };
}

// ---------------- Study session ----------------
export function validateSession(f) {
  const errors = {};
  if (!f.subject_id) errors.subject_id = 'Pick a subject.';
  if (!isValidISODate(f.session_date || '')) errors.session_date = 'Date must be a valid date (YYYY-MM-DD).';
  if (!TIME.test(f.start_time || '')) errors.start_time = 'Start time must be HH:MM.';
  if (!TIME.test(f.end_time || '')) errors.end_time = 'End time must be HH:MM.';
  if (TIME.test(f.start_time || '') && TIME.test(f.end_time || '')) {
    const s = Number(f.start_time.slice(0, 2)) * 60 + Number(f.start_time.slice(3, 5));
    const e = Number(f.end_time.slice(0, 2)) * 60 + Number(f.end_time.slice(3, 5));
    if (e <= s) errors.end_time = 'End time must be after start time.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// ---------------- Goal ----------------
export function validateGoal(f) {
  const errors = {};
  if (!f.name?.trim()) errors.name = 'Goal name is required.';
  if (!NUM(f.target_value)) errors.target_value = 'Target value is required.';
  else if (Number(f.target_value) <= 0) errors.target_value = 'Target value must be greater than zero.';
  if (f.current_value !== '' && f.current_value != null) {
    if (!NUM(f.current_value)) errors.current_value = 'Current value must be a number.';
    else if (Number(f.current_value) < 0) errors.current_value = 'Current value cannot be negative.';
  }
  if (f.deadline && !isValidISODate(f.deadline)) errors.deadline = 'Deadline must be a valid date (YYYY-MM-DD).';
  return { ok: Object.keys(errors).length === 0, errors };
}

// ---------------- Resource / note ----------------
export function validateResource(f) {
  const errors = {};
  if (!f.title?.trim()) errors.title = 'Title is required.';
  if (f.resource_type !== 'note' && !f.url?.trim()) errors.url = 'URL or link is required for this type.';
  if (f.url && !/^https?:\/\/.+/i.test(f.url) && f.resource_type !== 'note') errors.url = 'URL must start with http:// or https://.';
  return { ok: Object.keys(errors).length === 0, errors };
}

// ---------------- Attendance ----------------
// Intentionally absent: attendance has no student-entered form. The
// Excel (Google Sheets) attendance sheet is the only source, so there
// is no attendance payload to validate.

// ---------------- Profile ----------------
export function validateProfile(f) {
  const errors = {};
  if (!f.full_name?.trim()) errors.full_name = 'Name is required.';
  if (f.roll_number && f.roll_number.length > 40) errors.roll_number = 'Roll number must be 40 characters or fewer.';
  return { ok: Object.keys(errors).length === 0, errors };
}

// ---------------- CSV calendar import ----------------
// Accepts headers: title|name, type|event_type, start_date|date, end_date, priority, subject, description
// Returns { valid: rows[], invalid: [{row, errors}] }
export function parseCalendarImport(rows, subjectList = []) {
  const valid = [];
  const invalid = [];
  rows.forEach((raw, idx) => {
    const f = {
      title: raw.title ?? raw.name ?? '',
      event_type: String(raw.event_type ?? raw.type ?? 'other').toLowerCase().replace(/\s+/g, '_'),
      start_date: String(raw.start_date ?? raw.date ?? '').trim(),
      end_date: String(raw.end_date ?? '').trim() || String(raw.start_date ?? raw.date ?? '').trim(),
      priority: String(raw.priority ?? 'normal').toLowerCase(),
      description: raw.description ?? '',
      subject: raw.subject ?? '',
    };
    const subjectMatch = f.subject
      ? subjectList.find((s) => s.name.toLowerCase() === f.subject.toLowerCase() || (s.code && s.code.toLowerCase() === f.subject.toLowerCase()))
      : null;
    const rec = {
      title: f.title,
      event_type: f.event_type,
      start_date: f.start_date,
      end_date: f.end_date,
      priority: f.priority,
      description: f.description,
      subject_id: subjectMatch ? subjectMatch.id : null,
    };
    const { ok, errors } = validateEvent(rec);
    if (ok) valid.push(rec);
    else invalid.push({ row: idx + 1, errors, data: f });
  });
  return { valid, invalid };
}
