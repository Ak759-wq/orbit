// CSV / JSON export helpers (client-side downloads).

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(headers, rows) {
  const head = headers.map(csvEscape).join(',');
  const body = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  return head + (body ? `\n${body}` : '') + '\n';
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCSV(filename, headers, rows) {
  download(filename, toCSV(headers, rows), 'text/csv;charset=utf-8');
}

export function downloadJSON(filename, data) {
  download(filename, JSON.stringify(data, null, 2), 'application/json');
}

// Parse CSV text → array of row objects using the header row.
// Handles quoted fields with embedded commas/newlines.
export function parseCSV(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = '';
      rows.push(cur); cur = [];
    } else field += ch;
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] != null ? r[i].trim() : ''])));
}

// Convert imported rows to subject/exam/test/attendance export rows.
export const EXPORT_FORMATS = {
  tests: {
    headers: ['Name', 'Subject', 'Type', 'Date', 'Topic', 'Max Marks', 'Marks Obtained', 'Percentage', 'Notes'],
    row: (t, subjName, pct) => [t.name, subjName, t.test_type, t.test_date, t.topic || '', t.max_marks, t.marks_obtained ?? '', pct != null ? `${pct}%` : '', t.notes || ''],
  },
  attendance: {
    headers: ['Date', 'Subject', 'Status', 'Notes'],
    row: (r, subjName) => [r.class_date, subjName, r.status, r.notes || ''],
  },
  assignments: {
    headers: ['Title', 'Subject', 'Type', 'Due Date', 'Priority', 'Status', 'Submission Link', 'Description'],
    row: (a, subjName) => [a.title, subjName, a.task_type, a.due_date, a.priority, a.status, a.submission_link || '', a.description || ''],
  },
  calendar: {
    headers: ['Title', 'Type', 'Start Date', 'End Date', 'Priority', 'Subject', 'Description'],
    row: (e, subjName) => [e.title, e.event_type, e.start_date, e.end_date, e.priority, subjName || '', e.description || ''],
  },
  study_sessions: {
    headers: ['Date', 'Subject', 'Topic', 'Start', 'End', 'Status', 'Goal', 'Notes'],
    row: (s, subjName) => [s.session_date, subjName, s.topic || '', s.start_time, s.end_time, s.status, s.goal || '', s.notes || ''],
  },
};
