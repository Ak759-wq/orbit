// @vitest-environment jsdom
// Attendance is EXCEL-ONLY and READ-ONLY — these are the guardrails.
//
// The Excel (Google Sheets) attendance sheet is the single source of
// truth. Nothing in this app may create, edit or delete a mark, so the
// tests below cover three layers:
//
//   1. the rendered page  — no Add record, no "Mark today's classes",
//      no Present/Absent buttons, and every figure derived from the
//      supplied synced rows rather than hardcoded;
//   2. the shared selectors — one derivation of overall/subject
//      attendance, which is what Attendance, Dashboard, Analytics,
//      Summary and the AI snapshot all read;
//   3. the source + database — no manual write helper anywhere in the
//      data layer, and a SELECT-only policy plus a service-role-only
//      sync RPC so the student cannot bypass the UI with a raw request.
//
// jsdom is required: the page renders lucide icons and Orbit buttons
// into a real DOM, and the button-label assertions read that DOM.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { AppContext } = await import('./state/AppContext.jsx');
const { attendanceForRecords, attendanceBetween } = await import('./lib/calc.js');
const { getSubjectAttendance, getUnattributedAttendance } = await import('./lib/queries.js');
const { MemoryRouter } = await import('react-router-dom');
const Attendance = (await import('./components/modules/Attendance.jsx')).default;

const TODAY = '2026-10-03';

const SUBJECTS = [
  { id: 51, name: 'Java', code: 'BTBC121', attendance_required_pct: 75, color: '#a78bfa' },
  { id: 52, name: 'Agents', code: 'BTBC122', attendance_required_pct: 75, color: '#4e8df6' },
  { id: 58, name: 'Yoga', code: 'BTBC128', attendance_required_pct: 70, color: '#f79b2e' },
];

// A synced row. `source_key` is what the Excel pipeline stamps on every
// imported cell, and `source: 'excel_sync'` is now enforced by a CHECK
// constraint in the database.
const synced = (id, subject_id, class_date, status, extra = {}) => ({
  id, subject_id, class_date, status,
  source: 'excel_sync', source_key: `2392608071_${class_date}_class${id}`,
  ...extra,
});

// The live sheet: 77 real classes — 74 present, 3 absent (96.1%).
function liveSheetRecords() {
  const rows = [];
  let id = 1;
  for (let i = 0; i < 73; i++) {
    rows.push(synced(id++, SUBJECTS[i % 3].id, `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, 'present'));
  }
  for (let i = 0; i < 3; i++) {
    rows.push(synced(id++, SUBJECTS[i].id, `2026-10-0${i + 1}`, 'absent'));
  }
  // The sheet's one undated column — a real class with no date or subject.
  rows.push(synced(id++, null, null, 'present', {
    class_kind: 'undated', class_label: 'Clubs and clans', source_key: '2392608071_clubs_and_clans',
  }));
  return rows;
}

const SYNC_LOGS = [{ id: 1, status: 'SUCCESS', completed_at: '2026-10-03T04:00:00Z', started_at: '2026-10-03T03:58:00Z' }];

// Mirrors exactly what AppContext builds in production, so the fixture
// can never drift from the real analytics shape.
function context(overrides = {}) {
  const attendance = overrides.attendance ?? liveSheetRecords();
  const subjects = overrides.subjects ?? SUBJECTS;
  const base = {
    subjects, attendance, assignments: [], tests: [], sessions: [], goals: [], events: [],
    schedule: [], syncLogs: SYNC_LOGS, dismissals: [], hackathons: [], bookmarks: [],
    resources: [],
    ...overrides,
  };
  return {
    data: base,
    // The page reads these; they are computed from the rows, never typed in.
    analytics: {
      overallAtt: attendanceForRecords(attendance),
      subjectAttendance: getSubjectAttendance(attendance, subjects),
      unattributedAtt: getUnattributedAttendance(attendance),
      excludedPreCutoff: 0,
    },
    profile: null, settings: null, today: TODAY, loading: false, error: null,
    toast: null, flash: vi.fn(), subjectName: vi.fn(() => null), subjectMap: new Map(),
    authReady: true, insertRow: vi.fn(), updateRow: vi.fn(), deleteRow: vi.fn(), insertMany: vi.fn(),
    seedDemo: vi.fn(), clearDemo: vi.fn(), seedAllReal: vi.fn(), saveSettings: vi.fn(),
    syncAttendanceNow: vi.fn(async () => ({ summary: { inserted: 0, updated: 0, skipped: 77 } })),
  };
}

async function mount(Component, overrides) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const ctx = context(overrides);
  await act(async () => {
    root.render(createElement(MemoryRouter, null,
      createElement(AppContext.Provider, { value: ctx }, createElement(Component))));
  });
  return {
    el: container,
    ctx,
    text: () => container.textContent,
    buttons: () => [...container.querySelectorAll('button')].map((b) => b.textContent.trim()),
    async click(label) {
      const btn = [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(label));
      if (!btn) throw new Error(`no button matching "${label}"`);
      await act(async () => { btn.click(); });
    },
    async unmount() { root.unmount(); container.remove(); },
  };
}

// ---------------------------------------------------------------------------
describe('Attendance page: no manual marking exists', () => {
  it('has no add-record control, no modal and no present/absent buttons', async () => {
    const v = await mount(Attendance);
    const t = v.text();
    expect(t).not.toContain('Add record');
    expect(t).not.toContain("Mark today's classes");
    expect(t).not.toContain('Add attendance record');
    expect(t).not.toContain('Undo');

    // The words "Present"/"Absent" legitimately appear as READ-ONLY labels
    // and table badges, so the assertion is on interactive controls only:
    // there must be no button that marks a class.
    const labels = v.buttons();
    expect(labels).not.toContain('Present');
    expect(labels).not.toContain('Absent');
    expect(labels.some((l) => l === 'Present ✓')).toBe(false);
    expect(labels.some((l) => l === 'Absent ✗')).toBe(false);

    // And nothing on the page opens a form.
    expect(v.el.querySelectorAll('form').length).toBe(0);
    expect(v.el.querySelectorAll('select').length).toBe(0);
    await v.unmount();
  });

  it('never labels a record as manually entered', async () => {
    const v = await mount(Attendance);
    expect(v.text()).not.toContain('Manual');
    expect(v.text()).toContain('Excel sync');
    await v.unmount();
  });

  it('keeps Export and Sync Now, and Sync Now really syncs', async () => {
    const v = await mount(Attendance);
    const labels = v.buttons();
    expect(labels.some((l) => l.includes('Export'))).toBe(true);
    expect(labels.some((l) => l.includes('Sync Now'))).toBe(true);

    await v.click('Sync Now');
    expect(v.ctx.syncAttendanceNow).toHaveBeenCalledTimes(1);
    await v.unmount();
  });

  it('states that attendance is read-only', async () => {
    const v = await mount(Attendance);
    expect(v.text()).toContain('Read-only');
    await v.unmount();
  });
});

// ---------------------------------------------------------------------------
describe('Attendance page: every number is derived from the synced rows', () => {
  it('shows the real sheet figures (77 classes, 74 present, 3 absent, 96.1%)', async () => {
    const v = await mount(Attendance);
    const t = v.text();
    expect(t).toContain('77');
    expect(t).toContain('74');
    expect(t).toContain('3');
    expect(t).toContain('96.1%');
    expect(t).toContain('Records: 77');
    expect(t).toContain('77 from Excel');
    await v.unmount();
  });

  it('moves every figure when the sheet changes — nothing is hardcoded', async () => {
    const v = await mount(Attendance, {
      attendance: [
        synced(1, 51, '2026-09-28', 'present'),
        synced(2, 51, '2026-09-29', 'absent'),
        synced(3, 52, '2026-09-30', 'present'),
      ],
    });
    const t = v.text();
    expect(t).toContain('66.7%');            // 2 of 3
    expect(t).toContain('Records: 3');
    expect(t).not.toContain('96.1%');
    expect(t).not.toContain('77');
    await v.unmount();
  });

  it('never counts a blank or pre-cutoff record as attendance', async () => {
    // 24 Aug sits before the 25 Aug 2026 attendance period and must be
    // excluded from every count, exactly like the sync excludes it.
    const v = await mount(Attendance, {
      attendance: [
        synced(1, 51, '2026-09-28', 'present'),
        synced(2, 51, '2026-08-24', 'present'),
      ],
    });
    const t = v.text();
    expect(t).toContain('100%');
    expect(t).toContain('Records: 2');
    expect(t).toContain('1 before 25 Aug not counted');
    await v.unmount();
  });

  it('shows honest empty states instead of inventing attendance', async () => {
    const v = await mount(Attendance, { attendance: [] });
    expect(v.text()).toContain('Not enough data yet.');
    await v.unmount();
  });

  it('preserves the last good data and says so when a sync fails', async () => {
    const v = await mount(Attendance, {
      syncLogs: [{ id: 9, status: 'FAILED', error_message: 'Sheet unreachable', completed_at: '2026-10-03T06:00:00Z', started_at: '2026-10-03T05:58:00Z' }, ...SYNC_LOGS],
    });
    const t = v.text();
    expect(t).toContain('Last Excel sync failed.');
    expect(t).toContain('preserved');
    expect(t).toMatch(/All 77 existing attendance records/);
    // "Last synced" must reflect the last SUCCESSFUL run, never the failure.
    expect(t).toContain('Last successful sync:');
    await v.unmount();
  });
});

// ---------------------------------------------------------------------------
describe('the sheet record that has no subject still counts, visibly', () => {
  it('names the undated session and reconciles it with the total', async () => {
    const v = await mount(Attendance, {
      attendance: [
        synced(1, 51, '2026-09-28', 'present'),
        synced(2, null, null, 'absent', {
          class_kind: 'undated', class_label: 'Clubs and clans', source_key: '2392608071_clubs_and_clans',
        }),
      ],
    });
    const t = v.text();
    // The label the sheet gave it — never a blank and never a fabricated subject.
    expect(t).toContain('Clubs and clans');
    // Counted in the totals, and explained rather than silently dropped
    // from the subject cards (which only sum the dated, attributed ones).
    expect(t).toContain('Records: 2');
    expect(t).toContain('50%');
    expect(t).toContain('Plus 1 session the sheet records without a subject or date');
    expect(t).toContain('0 present, 1 absent');
    await v.unmount();
  });
});

// ---------------------------------------------------------------------------
describe('one shared attendance query feeds every surface', () => {
  it('builds overall and per-subject figures from the same rows', () => {
    const records = liveSheetRecords();
    const overall = attendanceForRecords(records);
    const bySubject = getSubjectAttendance(records, SUBJECTS);
    const unattributed = getUnattributedAttendance(records);

    expect(overall.total).toBe(77);
    // The headline number is the sum of its own parts — the same rows,
    // never a second calculation.
    expect(bySubject.reduce((n, s) => n + s.total, 0) + unattributed.total).toBe(overall.total);
    expect(bySubject.reduce((n, s) => n + s.present, 0) + unattributed.present).toBe(overall.present);
    expect(overall.present + overall.absent).toBe(overall.total);
    // 74 / 77 = 96.1% — the exact figure the sheet must produce.
    expect(overall.pct).toBe(96.1);
    expect(overall.present).toBe(74);
    expect(overall.absent).toBe(3);
  });

  it('applies the 25 Aug period rule to windowed figures too', () => {
    const records = [
      synced(1, 51, '2026-08-24', 'present'), // before the period
      synced(2, 51, '2026-09-28', 'present'),
      synced(3, 51, '2026-09-30', 'absent'),
    ];
    const overall = attendanceForRecords(records);
    const week = attendanceBetween(records, '2026-09-28', '2026-10-03');
    expect(overall.total).toBe(2);
    expect(week).toEqual(attendanceForRecords(records.slice(1)));
    expect(week.pct).toBe(50);
  });

  it('attributes nothing when the sheet gave no subject, rather than guessing', () => {
    const unattributed = getUnattributedAttendance([
      synced(1, null, null, 'absent', { class_label: 'Clubs and clans', source_key: 'u_clubs_and_clans' }),
      synced(2, 51, '2026-09-28', 'present'),
    ]);
    expect(unattributed.total).toBe(1);
    expect(getSubjectAttendance([synced(2, 51, '2026-09-28', 'present')], SUBJECTS)
      .find((s) => s.subjectId === 51).total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Source-level guards. The UI being clean proves nothing on its own — these
// assert the write path itself is gone, at the data layer and in the database.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('no manual attendance write path exists in the app', () => {
  it('the data layer exposes no attendance mutation helpers', () => {
    const db = read('./lib/db.js');
    const owned = /const OWNED = \[([^\]]*)\]/.exec(db)[1];
    expect(owned).not.toMatch(/'attendance'/);
    expect(owned).not.toMatch(/"attendance"/);
  });

  it('the Attendance page has no marking handlers or modal', () => {
    const page = read('./components/modules/Attendance.jsx');
    for (const gone of ['validateAttendance', 'insertRow', 'deleteRow', 'Add record',
      "Mark today's classes", '>Manual<', 'orbit-quick-add', 'const mark =', 'const toggle =']) {
      expect(page, `Attendance.jsx must not contain "${gone}"`).not.toContain(gone);
    }
  });

  it('nothing seeds demo or fallback attendance', () => {
    expect(read('./state/AppContext.jsx')).not.toContain('api.db.attendance');
    expect(read('./state/demo.js')).not.toMatch(/attendance\.push|const attendance =/);
    expect(read('./lib/validate.js')).not.toContain('validateAttendance');
  });
});

describe('the database refuses any attendance write from the student', () => {
  const migration = read('../supabase/attendance-readonly.sql');

  it('makes attendance SELECT-only for the owner', () => {
    expect(migration).toContain('drop policy if exists "attendance_owner_all"');
    expect(migration).toMatch(/create policy "attendance_select_own"[\s\S]*for select using \(auth\.uid\(\) = user_id\)/);
    expect(migration).not.toMatch(/create policy "attendance_owner_all"/);
    expect(read('../supabase/schema.sql')).toContain('attendance_select_own');
  });

  it('keeps the sync RPC away from the authenticated role', () => {
    expect(migration).toMatch(/revoke execute on function public\.orbit_sync_attendance[\s\S]*from authenticated/);
    expect(migration).toMatch(/grant execute on function public\.orbit_sync_attendance[\s\S]*to service_role/);
  });

  it('enforces Excel provenance and deterministic identity on every row', () => {
    expect(migration).toMatch(/constraint attendance_excel_only[\s\S]*check \(source = 'excel_sync' and source_key is not null\)/);
    // Non-sheet rows are removed, and the sheet is the only source.
    expect(migration).toMatch(/delete from public\.attendance\s+where source is null or source <> 'excel_sync'/);
    // The owner-scoped purge is the only client-reachable delete.
    expect(migration).toMatch(/create or replace function public\.orbit_purge_attendance[\s\S]*user_id = auth\.uid\(\)/);
  });

  it('resets go through the owner-scoped purge, not a table delete', () => {
    const db = read('./lib/db.js');
    expect(db).toContain("supabase.rpc('orbit_purge_attendance', { p_scope: 'demo' })");
    expect(db).toContain("supabase.rpc('orbit_purge_attendance', { p_scope: 'all' })");
    // 'attendance' must not appear in either client-side delete list.
    const lists = [...db.matchAll(/const order = \[([^\]]*)\]/g)].map((m) => m[1]);
    expect(lists.length).toBe(2);
    for (const l of lists) expect(l).not.toContain('attendance');
  });
});