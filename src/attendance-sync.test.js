// Attendance sync parser — source-of-truth regression tests.
//
// The attendance Google Sheet is the single source of truth for the
// attendance period (25 Aug 2026 onward). These tests drive the real
// extractRecords() from the Supabase edge function against a fixture
// that reproduces the live sheet's exact quirks, because two of them
// used to silently destroy a student's attendance.
//
// Bug 1 (the 77 vs 75 bug): the sheet repeats a class digit on some days
//   — 23 Sep reads "class 3, class 2, class 3, class 4". Keying records
//   by the header digit alone made two columns collide and the later
//   mark overwrote the earlier one, losing a class AND corrupting the
//   present/absent split.
// Bug 2: the trailing "Clubs and clans" column is a real class the sheet
//   simply doesn't date. Its header doesn't match the date regex, so it
//   was discarded entirely.
// Bug 3: the timetable was load-bearing for COUNTING (a class number
//   beyond the day's scheduled slots was dropped), which violated the
//   rule that attendance is never derived from the timetable.
//
// The edge function is TypeScript running on Deno, so it is compiled to
// ESM here with the project's esbuild and the pure parser is imported.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EDGE_FN = 'supabase/functions/attendance-sync/index.ts';

let extractRecords;
let attendanceForRecords;

// Compile the edge function to plain ESM so the pure parser (parseCsv,
// extractRecords) can be imported into this Node test process. The
// Deno-only scaffolding (env reads, the HTTP handler, the supabase
// client import) is neutralised; none of it is under test here.
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'att-sync-'));
  const out = join(dir, 'parser.mjs');
  execFileSync('node_modules/.bin/esbuild', [
    EDGE_FN, '--format=esm', '--platform=neutral', `--outfile=${out}`,
  ], { stdio: 'pipe' });

  let js = readFileSync(out, 'utf8');
  js = js
    .replace(/^import .*supabase-js.*$/m, '')
    .replace(/^const (SOURCE_URL|SYNC_KEY|SUPABASE_URL|ANON_KEY|SERVICE_KEY|DEBUG) = Deno[\s\S]*?$/gm, '')
    .replace(/^const corsHeaders = \{[\s\S]*?^\};$/m, 'const corsHeaders = {};')
    .replace(/^function json\([\s\S]*?^\}$/m, 'function json() { return {}; }');
  // Deno.serve is the HTTP entrypoint; stub it so importing the module
  // has no side effects under Node.
  writeFileSync(out, `globalThis.Deno = { env: { get: () => '' }, serve: () => {} };\n${js}`);

  const mod = await import(pathToFileURL(out).href);
  extractRecords = mod.extractRecords;

  const calc = await import('./lib/calc.js');
  attendanceForRecords = calc.attendanceForRecords;
});

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const USN = '2392608071';
const AY = 2026; // Aug–Dec 2026
const CUTOFF = '2026-08-25';

// BST timetable slot counts per weekday (Mon=1 … Fri=5).
const timetable = (counts = { 1: 4, 2: 4, 3: 4, 4: 5, 5: 5 }) =>
  new Map(Object.entries(counts).map(([d, n]) => [
    Number(d),
    Array.from({ length: n }, (_, i) => ({ subject_id: 1000 + Number(d) * 10 + i + 1, slot_id: Number(d) * 10 + i + 1 })),
  ]));

// Build a sheet whose student row lines up with the header. `cells` is
// positional and MUST be the same length as `headers`, so a test can never
// silently misalign a value against the wrong column — exactly the class of
// bug this file guards against. Cells 0/1 are USN/Name; a header ending in
// '%' always gets a percentage, never a mark.
const sheet = (headers, cells = []) => {
  if (cells.length !== headers.length) {
    throw new Error(`fixture misaligned: ${cells.length} cells for ${headers.length} headers`);
  }
  const rowFor = (usn, name) => headers.map((h, i) => {
    if (i === 0) return usn;
    if (i === 1) return name;
    if (/%\s*$/.test(h.trim())) return '100%';
    return cells[i] ?? '';
  });
  return [headers, rowFor('2392608001', 'Someone Else'), rowFor(USN, 'Aditya kumar')];
};

/** The exact 23 Sep shape from the live sheet: class 3 typed twice. */
const DUP_HEADERS = [
  'USN', 'Student Name', 'Theory %', 'Lab %', 'Aggregate %',
  '22 sep class 1', '22 sep class 2',
  '23 sep class 3', '23 sep class 2', '23 sep class 3', '23 sep class 4',
  '24 sep class 1', '24 sep class 2',
  'Clubs and clans',
];

// The live sheet's marks, verbatim: col 7 "23 sep class 3" = P and
// col 9 "23 sep class 3" = A. Two columns, one header digit — the exact
// collision that used to destroy the P.
const DUP_CELLS = ['', '', '', '', '', 'P', 'P', 'P', 'P', 'A', 'A', 'P', 'P', 'A'];
const dupGrid = () => sheet(DUP_HEADERS, DUP_CELLS);

describe('attendance sync: the real period totals 77 classes', () => {
  // A full-size fixture mirroring the live sheet's shape. Header and mark
  // are written as ONE pair per column, so a value can never drift onto
  // the wrong column — the mistake this whole file guards against.
  // 76 dated columns from the 25 Aug cutoff + the undated club column.
  const P = 'P';
  const datedColumns = [
    ['25 august class 1', P], ['25 august class 2', P], ['25 august class 3', P], ['25 august class 4', P],
    ['27 august class 1', P], ['27 august class 2', P], ['27 august class 3', P],
    ['26 august class 4', P],
    ['28 august class 3', P], ['28 august class 4', P],
    ['31 august', P], ['31 august class 3', P],
    ['1 September class 1', P], ['1 September class 3', P],
    ['2 september class 1', P],
    ['3 september class 1', P], ['3 September class 2', P], ['3 September class 3', P], ['3 September class 4', P],
    ['4 September class 1', P], ['4 September class 2', P], ['4 September class 3', P], ['4 September class 4', P],
    ['7 September class 1', P], ['7 September class 2', P], ['7 September class 3', P],
    ['8 sep class 2', P], ['8 sep class 3', P],
    ['9 sep class 1', P], ['9 sep class 2', P], ['9 sep class 3', P], ['9 sep class 4', P],
    ['10 sep class 1', P], ['10 sep class 2', P], ['11 sep class 1', P], ['11 sep class 2', P],
    ['15 sep class 1', P], ['15 sep Class 2', P], ['15 sep class 3', P], ['15 sep class 4', P],
    ['16 sep class 1', P], ['16 sep class 2', P], ['16 sep Class 3', P], ['16 sep Class 4', P],
    ['17 sep class 1', P], ['17 sep class 2', P],
    ['18 sep class 1', P], ['18 sep class 2', P], ['18 sep class 3', P],
    ['21 sep class 1', P], ['21 sep class 2', P], ['21 sep class 3', P], ['21 sep class 4', P],
    ['22 sep class 1', P], ['22 sep class 2', P],
    // 23 Sep verbatim from the sheet: class 3 typed twice.
    ['23 sep class 3', P], ['23 sep class 2', P], ['23 sep class 3', 'A'], ['23 sep class 4', 'A'],
    ['24 sep class 1', P], ['24 sep class 2', P],
    ['25 sep class 1', P],
    ['28 sep class 1', P], ['28 sep class 2', P], ['28 sep class 3', P], ['28 sep class 4', P],
    ['29 sep class 1', P], ['29 sep class 2', P], ['29 sep class 3', P],
    ['30 sep class 1', P], ['30 sep class 2', P], ['30 sep class 3', P], ['30 sep class 4', P],
    ['1 oct class 1', P], ['1 oct class 2', P], ['1 oct class 3', P],
  ];
  const undatedColumns = [['Clubs and clans', 'A']];
  // Before the 25 Aug cutoff: present in the sheet, never counted.
  const preCutoffColumns = [
    ['24 august class 1', P], ['24 august class 2', P],
    ['24 august class 3', P], ['24 august class 4', P],
  ];
  // Metadata columns carry no mark; they still occupy a column slot.
  const META = [['USN', ''], ['Student Name', ''], ['Theory %', ''], ['Lab %', ''], ['Aggregate %', '']];
  const PERIOD_HEADERS = [...META, ...datedColumns, ...undatedColumns, ...preCutoffColumns].map((c) => c[0]);
  const periodCells = [...META, ...datedColumns, ...undatedColumns, ...preCutoffColumns].map((c) => c[1]);

  it('imports every class from 25 Aug 2026 and nothing before it', () => {
    const r = extractRecords(sheet(PERIOD_HEADERS, periodCells), timetable(), USN, AY);
    // eslint-disable-next-line no-console// THE acceptance number: 77 classes from the attendance period.
    expect(r.records).toHaveLength(77);
    expect(r.reconciliation.dated_records).toBe(76);
    expect(r.reconciliation.undated_records).toBe(1);
    // Nothing the sheet had was dropped.
    expect(r.reconciliation.missing).toEqual([]);
    expect(r.reconciliation.source_cells).toBe(77);
    // The four 24 Aug columns sit before the cutoff.
    expect(r.excludedEarly).toHaveLength(4);
    expect(r.records.every((x) => x.class_date === null || x.class_date >= CUTOFF)).toBe(true);
  });

  it('yields one record per source cell — no duplicates, no merges', () => {
    const r = extractRecords(sheet(PERIOD_HEADERS, periodCells), timetable(), USN, AY);
    const keys = r.records.map((x) => x.source_key);
    expect(new Set(keys).size).toBe(77);
    // 28 Sep and 30 Sep are four separate classes each, not one per day.
    for (const date of ['2026-09-28', '2026-09-30']) {
      expect(r.records.filter((x) => x.class_date === date)).toHaveLength(4);
    }
  });

  it('reports the pre-fix loss so the bug cannot come back silently', () => {
    const r = extractRecords(sheet(PERIOD_HEADERS, periodCells), timetable(), USN, AY);
    // Exactly one collision is repaired — the duplicated 23 Sep header.
    expect(r.reconciliation.collisions_repaired).toBe(1);
    // Before the fix that collision produced 76 records, not 77.
    expect(r.records).not.toHaveLength(76);
    // Both 23 Sep marks survive.
    const sep23 = r.records.filter((x) => x.class_date === '2026-09-23');
    expect(sep23.filter((x) => x.status === 'present')).toHaveLength(2);
    expect(sep23.filter((x) => x.status === 'absent')).toHaveLength(2);
  });

  it('feeds one shared dataset to every page that shows attendance', () => {
    const r = extractRecords(sheet(PERIOD_HEADERS, periodCells), timetable(), USN, AY);
    // Dashboard, Analytics and Orbit AI all read attendanceForRecords,
    // so they cannot disagree with the Attendance page.
    const stats = attendanceForRecords(r.records);
    expect(stats.total).toBe(77);
    expect(stats.present).toBe(r.records.filter((x) => x.status === 'present').length);
    expect(stats.absent).toBe(r.records.filter((x) => x.status === 'absent').length);
    expect(stats.present + stats.absent).toBe(77);
  });
});

describe('attendance sync: the sheet is the source of truth', () => {
  it('keeps every class on a day whose header repeats a class number', () => {
    const grid = dupGrid();
    const r = extractRecords(grid, timetable(), USN, AY);

    const sep23 = r.records.filter((x) => x.class_date === '2026-09-23');
    // The bug: only 3 of the 4 columns survived.
    expect(sep23).toHaveLength(4);
    // Class numbers are made distinct; no two records share one.
    expect(sep23.map((x) => x.class_number).sort()).toEqual([1, 2, 3, 4]);
    // Both P marks and both A marks are preserved — the old last-wins
    // keying destroyed the earlier "23 sep class 3" (P).
    expect(sep23.filter((x) => x.status === 'present')).toHaveLength(2);
    expect(sep23.filter((x) => x.status === 'absent')).toHaveLength(2);
    expect(r.reconciliation.collisions_repaired).toBe(1);
    expect(r.reconciliation.missing).toEqual([]);
  });

  it('imports the undated "Clubs and clans" column as a real class', () => {
    const grid = dupGrid();
    const r = extractRecords(grid, timetable(), USN, AY);

    const undated = r.records.filter((x) => x.class_kind === 'undated');
    expect(undated).toHaveLength(1);
    expect(undated[0].class_label).toBe('Clubs and clans');
    expect(undated[0].class_date).toBeNull();
    expect(undated[0].status).toBe('absent');
    expect(undated[0].source_key).toBe(`${USN}_clubs_and_clans`);
    // Its mark is counted, not discarded.
    expect(r.reconciliation.total).toBe(r.records.length);
  });

  it('never imports the percentage summary columns as attendance', () => {
    // Theory % / Lab % / Aggregate % hold "100%", "92%", "96%".
    const grid = [
      ['USN', 'Student Name', 'Theory %', 'Lab %', 'Aggregate %', '25 aug class 1', 'Clubs and clans'],
      [USN, 'Aditya kumar', '100%', '92%', '96%', 'P', 'A'],
    ];
    const r = extractRecords(grid, timetable(), USN, AY);
    // Exactly the two real classes — the three % columns are ignored.
    expect(r.records).toHaveLength(2);
    expect(r.records.every((x) => x.class_kind !== 'summary')).toBe(true);
    expect(r.reconciliation.source_cells).toBe(2);
  });

  it('ignores blank cells — a blank is not present and not absent', () => {
    const grid = [
      ['USN', 'Student Name', '25 aug class 1', '25 aug class 2', '25 aug class 3'],
      [USN, 'Aditya kumar', 'P', '', 'A'],
    ];
    const r = extractRecords(grid, timetable(), USN, AY);
    expect(r.records).toHaveLength(2);
    expect(r.blanks).toBe(1);
  });

  it('applies the 25 August 2026 cutoff consistently', () => {
    const grid = sheet(
      ['USN', 'Student Name', '24 august class 1', '24 august class 2', '25 august class 1'],
      ['', '', 'P', 'P', 'P'],
    );
    const r = extractRecords(grid, timetable(), USN, AY);
    // The two 24 Aug columns are before the period and never imported.
    expect(r.excludedEarly).toHaveLength(2);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].class_date).toBe(CUTOFF);
  });

  it('never derives attendance from the timetable', () => {
    // A class 4 on a day the timetable only schedules 3 slots for.
    const headers = ['USN', 'Student Name', '2 sep class 1', '2 sep class 2', '2 sep class 3', '2 sep class 4'];
    const grid = sheet(headers, ['', '', 'P', 'P', 'P', 'A']);
    const r = extractRecords(grid, timetable({ 3: 3 }), USN, AY); // Wed has 3 slots
    // All four sheet columns are kept; the timetable only labels them.
    expect(r.records).toHaveLength(4);
    expect(r.records.filter((x) => x.class_number === 4)).toHaveLength(1);
    // The unmatched bucket stays empty — nothing was rejected.
    expect(r.unmatched).toEqual([]);
  });

  it('keeps a record even when the timetable has no slots that day', () => {
    const grid = sheet(['USN', 'Student Name', '2 sep class 1'], ['', '', 'P']);
    const r = extractRecords(grid, new Map(), USN, AY);
    expect(r.records).toHaveLength(1);
    // Subject is simply unknown — the class still happened.
    expect(r.records[0].subject_id).toBeNull();
  });
});

describe('attendance sync: deterministic identity and idempotency', () => {
  it('builds the student + date + class key for dated records', () => {
    const grid = sheet(['USN', 'Student Name', '30 sep class 1', '30 sep class 2', '30 sep class 3', '30 sep class 4'], ['', '', 'P', 'P', 'P', 'A']);
    const r = extractRecords(grid, timetable(), USN, AY);
    expect(r.records.map((x) => x.source_key)).toEqual([
      `${USN}_2026-09-30_class1`,
      `${USN}_2026-09-30_class2`,
      `${USN}_2026-09-30_class3`,
      `${USN}_2026-09-30_class4`,
    ]);
  });

  it('never emits a duplicate source_key, however the headers are written', () => {
    // Capitalised "Class", out-of-order digits, a bare date and a repeat.
    const headers = [
      'USN', 'Student Name',
      '1 September Class 1', '1 September Class 2',
      '2 september class 2', '2 september class 1',
      '3 sep class 3', '3 sep class 3',
      '4 sep',
      'Clubs and clans',
    ];
    const grid = sheet(headers, ['', '', 'P', 'A', 'P', 'A', 'P', 'P', 'A', 'P']);
    const r = extractRecords(grid, timetable(), USN, AY);
    const keys = r.records.map((x) => x.source_key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(r.reconciliation.missing).toEqual([]);
    // One record per non-blank mark: nothing merged, nothing dropped.
    expect(r.records).toHaveLength(r.reconciliation.source_cells);
  });

  it('produces identical keys on a re-run, so syncs are true no-ops', () => {
    const grid = dupGrid();
    const first = extractRecords(grid, timetable(), USN, AY);
    const second = extractRecords(grid, timetable(), USN, AY);
    expect(second.records.map((x) => x.source_key)).toEqual(first.records.map((x) => x.source_key));
    expect(second.records.map((x) => x.status)).toEqual(first.records.map((x) => x.status));
  });

  it('preserves the source row so any record can be traced to its sheet cell', () => {
    const grid = dupGrid();
    const r = extractRecords(grid, timetable(), USN, AY);
    // source_row is the 1-based CSV column index.
    expect(r.records.find((x) => x.source_key === `${USN}_clubs_and_clans`).source_row).toBe(14);
    for (const rec of r.records) expect(rec.source_row).toBeGreaterThan(0);
  });
});

describe('attendance sync: reconciliation and totals', () => {
  it('reports source cells vs records kept, and names anything missing', () => {
    const grid = dupGrid();
    const r = extractRecords(grid, timetable(), USN, AY);
    expect(r.reconciliation.source_cells).toBe(r.records.length);
    expect(r.reconciliation.missing).toEqual([]);
    expect(r.reconciliation.dated_records + r.reconciliation.undated_records).toBe(r.records.length);
  });

  it('counts an undated class toward the attendance percentage', () => {
    const grid = dupGrid();
    const r = extractRecords(grid, timetable(), USN, AY);

    // attendanceForRecords is the one calculation layer every page uses.
    const stats = attendanceForRecords(r.records);
    expect(stats.total).toBe(r.records.length);
    expect(stats.present + stats.absent).toBe(stats.total);
    // Computed from the records, never hardcoded. safePct rounds for
    // display, so compare at display precision.
    expect(stats.pct).toBeCloseTo((stats.present / stats.total) * 100, 1);
  });

  it('fails loudly rather than importing nothing when the sheet structure changes', () => {
    const grid = [['USN', 'Student Name', 'Total'], [USN, 'Aditya kumar', '77']];
    expect(() => extractRecords(grid, timetable(), USN, AY)).toThrow(/structure changed/i);
  });

  it('reports a USN that is absent from the sheet instead of guessing', () => {
    const grid = dupGrid();
    const r = extractRecords(grid, timetable(), '9999999999', AY);
    expect(r.found).toBe(false);
    expect(r.records).toEqual([]);
  });

  it('matches the student by USN, not by name', () => {
    // A different USN that happens to share the name must not be imported.
    const grid = [
      ['USN', 'Student Name', '25 aug class 1'],
      ['2392609999', 'Aditya kumar', 'P'],
      [USN, 'aditya KUMAR', 'A'],
    ];
    const r = extractRecords(grid, timetable(), USN, AY);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].status).toBe('absent');
  });
});