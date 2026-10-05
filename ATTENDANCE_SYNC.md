# Excel Attendance Sync — Source of Truth Pipeline

```
LIVE Google Sheet (Section A)  →  attendance-sync edge function (every 2h + Sync Now)
  →  public.attendance (source metadata)  →  Attendance page · Dashboard · Analytics · Orbit AI
```

The live spreadsheet is the **single source of truth**. The database is a synchronized
copy of it — nothing in Orbit recreates, guesses or hardcodes attendance values.

**Attendance is READ-ONLY for the student.** You can view, sync and export it. You
cannot create, edit, delete or manually mark it anywhere in Orbit, and the database
refuses those writes too (see *Read-only enforcement* below).

## Source

- **Google Sheet**: `https://docs.google.com/spreadsheets/d/12bLuQ3Ds-VoQVoNsKYP8XZLTjeIjdjKKcF-poKZ1W2U`
  (secret `ATTENDANCE_SOURCE_URL`, tab *Section A*, `gid=1002611357`).
  The edge function converts it to a CSV export URL server-side (`/export?format=csv&gid=…`)
  and fetches it once per run, shared by every synced user. The sheet must stay
  link-shareable ("Anyone with the link"); if it returns HTML instead of CSV the run
  fails safely and existing data is preserved.
- Layout (validated live 1 Oct 2026): row 1 = `USN, Student Name, Theory %, Lab %,
  Aggregate %`, then 109 date/class columns `10 August class 1` … `30 sep class 4`.
  Date/class columns are detected by header pattern — never by fixed position.
- A repeated class digit on one day (`23 sep class 3` twice) is repaired by giving
  each column a distinct class number, so no class is lost or merged.
- One bare-date header exists (`31 august`, no class digit): it is resolved
  **positionally** — bare columns of the same date take, in column order, the lowest
  class number not already claimed by an explicit `class N` column of that date.
- The trailing **"Clubs and clans"** column carries a real `P`/`A` mark but no date and
  no subject. It is imported as a real class (`class_kind = 'undated'`, its header kept
  in `class_label`) and counted; it is simply not attributable to a subject.
- Only `P`/`A` count. **Blank cells are NOT records** — not present, not absent,
  never imported. Unrecognized values are logged as unmatched, never guessed.
- Subjects come from the student's own timetable where available:
  **class N on a date → the Nth timetable slot of that weekday** (parallel slots
  resolved deterministically). A missing or short timetable never discards a record —
  the class happened, the sheet is what counts it.
- Identity: **USN == `profiles.roll_number`** (primary identifier). A user receives only
  the row(s) matching their own USN; the rest of the sheet is never read for them or
  stored. No USN → FAILED run, no data written.

## Hard business rule: attendance start date

**The attendance period starts at `2026-08-25`.** Records dated before it are
never imported (the sheet keeps them untouched) and excluded from every calculation:

- **Sync**: the edge function refuses to import columns dated before the cutoff
  (logged as skipped-by-rule in `attendance_sync_logs`).
- **App**: `attendanceForRecords()` in `src/lib/calc.js` (the single calculation
  hub behind the Attendance page, Dashboard, weekly summary and projections)
  filters `class_date >= '2026-08-25'` — enforced at the data/query layer, not
  the UI. `attendanceBetween()` is the windowed form, and it defers to the same rule.
- **Orbit AI**: `computedStats()` in `academic-ai` applies the identical filter,
  so AI answers always match the app.

## Deterministic identity (no duplicates, ever)

Every record has a stable identity derived from the **source cell**, never from the
timetable, so a timetable edit can never change an attendance total:

```
source_key = "<usn>_<date>_class<n>"   dated columns
           = "<usn>_<label_slug>"      undated columns (e.g. …_clubs_and_clans)
```

backed by `unique (user_id, source_key)`.

The `orbit_sync_attendance()` RPC (security definer, user-scoped) then:

1. the row with this exact `source_key` → UPDATE in place **only if the mark
   changed** (`P → A` or `A → P`), otherwise a true no-op with no write at all;
2. a pre-migration `excel_sync` row with the same subject+date+slot but no key yet →
   claimed and backfilled, so the first sync after the key was introduced cannot
   double every record;
3. otherwise inserted fresh with `source = 'excel_sync'`;
4. finally, sheet rows whose `source_key` is absent from this run are pruned —
   a class column deleted upstream disappears here too. The prune is skipped
   entirely when the incoming set is empty, so a truncated parse can never wipe
   the table.

So the sheet can grow every day — new dates/classes appear automatically, changed
marks update the existing row, and re-running the sync inserts/updates nothing.

## Read-only enforcement

A UI with no buttons is not a guarantee, so the write path itself is closed:

| Layer | Rule |
|---|---|
| RLS on `public.attendance` | `attendance_select_own … for select` only — the student can read their own attendance and nothing else (`attendance_owner_all … for all` is dropped) |
| `orbit_sync_attendance` | executed by `service_role` only; the `authenticated` grant is revoked, so a student cannot call it from the console with invented records |
| Provenance constraint | `check (source = 'excel_sync' and source_key is not null)` — every row must be attributable to a sheet cell |
| Data layer | `'attendance'` is absent from the `OWNED` table list in `src/lib/db.js`, so the app has no attendance insert/update/remove helper at all |
| Resets | "Clear demo data" / "Delete all academic data" call `orbit_purge_attendance(p_scope)`, a security-definer function hard-scoped to `auth.uid()` |

**Apply it**: run `supabase/attendance-readonly.sql` once in the Supabase SQL editor
(adds `class_label`, drops non-sheet rows, adds the provenance constraint, swaps the
policy, adds the purge RPC and replaces the sync RPC with the Excel-only version).
Idempotent — safe to re-run. `supabase/schema.sql` already ships the SELECT-only
policy so a rebuilt database is read-only from day one.

The sync edge function needs no redeploy: it already calls the RPC with the
service-role client, so "Sync Now" keeps working through it.

## Components

| Piece | Where |
|---|---|
| Pipeline migration (source columns, sync logs, keys, first sync RPC) | `supabase/attendance-sync.sql` + `supabase/revert-to-excel.sql` |
| Read-only migration (policy, grants, provenance, `class_label`, purge) | `supabase/attendance-readonly.sql` |
| Edge function (fetch → parse → match → upsert → log) | `supabase/functions/attendance-sync/index.ts` |
| Shared attendance selectors (used by every surface) | `src/lib/queries.js` (`getSubjectAttendance`, `getUnattributedAttendance`), `src/lib/calc.js` (`attendanceForRecords`, `attendanceBetween`) |
| Secrets | `ATTENDANCE_SOURCE_URL` (Sheets URL), `SYNC_CRON_SECRET` (Supabase) |
| Schedule | pg_cron job `orbit-attendance-sync` — `0 */2 * * *` → pg_net POST with `x-sync-key` |
| Manual trigger | "Sync Now" on the Attendance page, in Dashboard and in Settings (`syncAttendanceNow` in AppContext) |

## Idempotency & safety

- Deterministic `source_key` per source cell, unique per user — repeated syncs cannot duplicate.
- Unchanged marks write nothing → re-runs are true no-ops (`0 inserted, 0 updated`).
- Changed marks UPDATE in place; the sheet always wins for its own sessions.
- Failures (fetch, auth, HTML response, structure change, RPC error) log `FAILED`
  and leave the last successfully synchronized data intact — nothing is erased and
  nothing is invented as a fallback.
- Every run appends a row to `attendance_sync_logs` with found/inserted/updated/skipped/unmatched.

## Frontend

- `data.attendance` (one `select`) is the only attendance read. Every surface derives
  its numbers from it through the shared selectors, so the Attendance page, Dashboard,
  Analytics, weekly summary and Orbit AI cannot disagree.
- Attendance page: **Export** and **Sync Now** only — no add, edit, delete or mark
  control exists. The top strip shows the source, the **last successful** sync time,
  the record count (with how many came from Excel and how many pre-cutoff rows are not
  counted), a Read-only badge, and an explicit failure notice that keeps the last good
  data on screen.
- The undated sheet session is counted in the totals and explained in a footnote, so
  the subject cards visibly reconcile with the headline number.

## Current results (live)

Sheet row for USN 2392608071 (Aditya kumar): **77 valid records, 74 present / 3 absent
= 96.1%**, 0 blanks, 0 unmatched, 0 duplicates. These are computed from the synced rows
on every load — nothing in the app stores them as constants.