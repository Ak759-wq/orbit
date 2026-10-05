// Events feature helpers. All statuses and countdowns are DYNAMIC —
// calculated from the current date, start/end dates and registration
// deadlines. Nothing is hardcoded per event.

import { daysBetween, todayISO } from './datetime.js';

// The 10 event types from the spec.
export const EVENT_DB_TYPES = [
  'Hackathon', 'Competition', 'Workshop', 'Webinar', 'Conference',
  'College Event', 'Club Event', 'Coding Contest', 'AI Event', 'Other',
];

export const MODES = ['Online', 'Offline', 'Hybrid'];

// Global event status, calculated from dates + deadline.
export function eventStatus(ev, todayIso = todayISO()) {
  const end = ev.end_date || ev.start_date;
  if (end && end < todayIso) return 'Completed';
  if (ev.start_date && ev.start_date <= todayIso) return 'Event Started';
  if (ev.reg_deadline) {
    if (ev.reg_deadline < todayIso) return 'Registration Closed';
    if (ev.reg_deadline === todayIso) return 'Registration Closing Soon';
    if (daysBetween(todayIso, ev.start_date) != null && daysBetween(todayIso, ev.start_date) <= 3) return 'Registration Closing Soon';
  }
  return 'Registration Open';
}

// "Registration closes in X days" / "closes tomorrow" / "closed".
export function deadlineLabel(ev, todayIso = todayISO()) {
  if (!ev.reg_deadline) return null;
  const d = daysBetween(todayIso, ev.reg_deadline);
  if (d == null) return null;
  if (d < 0) return 'Registration closed';
  if (d === 0) return 'Registration closes today';
  if (d === 1) return 'Registration closes tomorrow';
  return `Registration closes in ${d} days`;
}

export const STATUS_TONE = {
  'Upcoming': '#d9ebff',
  'Registration Open': '#d3f5e3',
  'Registration Closing Soon': '#ffc900',
  'Registration Closed': '#f6f1e7',
  'Event Started': '#a3e635',
  'Completed': '#e5e0d3',
};

export const TRACK_STATUSES = ['Interested', 'Registered', 'Participating', 'Completed'];

// Summaries for dateless "week-relative" calendar entries.
export function relativeSummary(ev) {
  if (ev.start_date) return null;
  return {
    semester: ev.description?.includes('Odd') ? 'Odd Semester' : 'Even Semester',
    label: ev.description?.match(/10 days from the last day of examination|3rd week of May 2027|1st section/)?.[0]
      || ev.description?.split('·')[0]
      || 'Date to be announced',
    tentative: (ev.description || '').includes('tentative'),
  };
}

// Build the compact JSON snapshot of the user's events for the AI.
export function eventsSnapshot(events, bookmarks, todayIso = todayISO()) {
  const list = (events || []).map((e) => {
    const d = e.reg_deadline ? daysBetween(todayIso, e.reg_deadline) : null;
    return {
      id: e.id, title: e.title, type: e.event_type, organizer: e.organizer,
      start: e.start_date, end: e.end_date, reg_deadline: e.reg_deadline,
      reg_deadline_in_days: d, mode: e.mode, location: e.location || undefined,
      eligibility: e.eligibility || undefined, prize: e.prize || undefined,
      skills: e.skills?.length ? e.skills : undefined,
      tags: e.tags?.length ? e.tags : undefined,
      source_url: e.source_url || undefined,
      status: eventStatus(e, todayIso),
      bookmarked: (bookmarks || []).some((b) => b.event_id === e.id),
      track_status: (bookmarks || []).find((b) => b.event_id === e.id)?.track_status,
    };
  });
  return { today: todayIso, count: list.length, events: list };
}

// Track-status cycle for the bookmark button.
export function nextTrackStatus(cur) {
  const i = TRACK_STATUSES.indexOf(cur);
  return TRACK_STATUSES[(i + 1) % TRACK_STATUSES.length];
}
