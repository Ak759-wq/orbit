-- ============================================================
-- Orbit — Excel Attendance Sync (source-of-truth pipeline)
--   Google Sheet (Section A)  →  attendance-sync edge function
--   →  public.attendance (+ source metadata)  →  Orbit UI
--
-- HARD BUSINESS RULE: the attendance period starts on 2026-08-25.
-- Records dated before it are stored (never deleted) but excluded
-- from every calculation: the sync does not import them, and both
-- calculation layers (src/lib/calc.js attendanceForRecords and the
-- academic-ai computedStats) filter class_date >= '2026-08-25'.
--
-- Attendance rows imported from the workbook carry:
--   source = 'excel_sync', source_file, source_row, imported_at
-- so they are always distinguishable from manual records.
-- Manual attendance keeps working; the sync never deletes rows —
-- a failed sync simply leaves the last known good data in place.
--
-- Idempotency: the RPC upserts on the deterministic source_key
-- (student + date + class number, e.g. 2392608071_2026-09-30_1) and
-- only counts an UPDATE when the status actually changed, so
-- re-running the sync can never create duplicates.
--
-- class_date and subject_id became NULLABLE because the sheet carries
-- one genuinely undated attendance column ("Clubs and clans"). The
-- attendance period counts every row regardless of date, so an
-- undated record is a real class — it must not be dropped just
-- because the sheet gives it no date. calc.js attendanceForRecords
-- already counts undated rows.
--
-- Run once in the Supabase SQL editor (or via Management API).
-- ============================================================

-- ------------------------------------------------------------
-- 1) attendance: source metadata + future-proof statuses.
--    Existing rows are 'manual' (backfilled by the NOT NULL default).
--    'late'/'excused' are accepted for forward compatibility; the
--    current sheet only ever contains P/A.
-- ------------------------------------------------------------
alter table public.attendance
  add column if not exists source text not null default 'manual',
  add column if not exists source_file text,
  add column if not exists source_row integer,
  add column if not exists imported_at timestamptz;

-- Widen the status domain (drop + recreate, name-tolerant).
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance
  add constraint attendance_status_check
  check (status in ('present','absent','late','excused'));

-- ------------------------------------------------------------
-- 2) Sync log: one row per run, per user. Select/insert are RLS-
--    scoped to the owner; service_role (edge function) bypasses RLS.
-- ------------------------------------------------------------
create table if not exists public.attendance_sync_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  run_type text not null default 'scheduled' check (run_type in ('scheduled','manual')),
  status text not null check (status in ('SUCCESS','PARTIAL','FAILED')),
  source_file text,
  records_found integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  records_unmatched integer not null default 0,
  unmatched_detail jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.attendance_sync_logs enable row level security;

drop policy if exists "sync_logs_select_own" on public.attendance_sync_logs;
create policy "sync_logs_select_own" on public.attendance_sync_logs
  for select using (auth.uid() = user_id);

drop policy if exists "sync_logs_insert_own" on public.attendance_sync_logs;
create policy "sync_logs_insert_own" on public.attendance_sync_logs
  for insert with check (auth.uid() = user_id);

create index if not exists idx_sync_logs_user_started
  on public.attendance_sync_logs (user_id, started_at desc);

-- ------------------------------------------------------------
-- 2b) Deterministic record identity.
--
--   source_key  = "<usn>_<date>_class<n>"  for dated columns
--               = "<usn>_<label_slug>"     for undated columns
--   class_kind  = 'dated' | 'undated'
--   class_number= the class digit read from the header (null if undated)
--
-- This is what makes repeated syncs safe: the same sheet cell always
-- produces the same key, so re-running updates in place instead of
-- inserting a second row. It also decouples record identity from the
-- timetable — a timetable edit can never change an attendance total.
-- ------------------------------------------------------------
alter table public.attendance
  add column if not exists class_number integer,
  add column if not exists class_kind text,
  add column if not exists source_key text;

alter table public.attendance drop constraint if exists attendance_class_kind_check;
alter table public.attendance
  add constraint attendance_class_kind_check
  check (class_kind is null or class_kind in ('dated','undated'));

-- The undated "Clubs and clans" column has no date and no subject.
alter table public.attendance
  alter column class_date drop not null,
  alter column subject_id drop not null;

-- One row per source cell. NULL source_key rows (pre-migration manual
-- and legacy rows) are excluded, and Postgres treats NULLs as distinct
-- in a unique index, so existing rows are never blocked here.
create unique index if not exists uniq_attendance_source_key
  on public.attendance (user_id, source_key)
  where source_key is not null;

-- ------------------------------------------------------------
-- 3) Sync RPC — the only write path for imported attendance.
--    security definer so the edge function (service role) and the
--    signed-in owner can both use it; nobody can target another user.
--
--    Record JSON shape produced by the edge function:
--      { source_key, class_number, class_kind, subject_id, slot_id,
--        class_date, status, source_row }
--
--    Matching order per record:
--      a) the row with this exact source_key → update in place on change.
--         This is the deterministic identity, so re-running a sync can
--         never create a duplicate.
--      b) a pre-migration excel_sync row (source_key IS NULL) matching the
--         old subject+date+slot shape → claimed and backfilled, so the
--         first sync after deployment does not double every record.
--      c) a manual row same subject+date without a slot → claimed as the
--         Excel session (Excel is source of truth for its sessions)
--      d) any other row with the same key → skipped (manual preserved)
--      e) otherwise inserted fresh
--
--    After the loop, excel_sync rows whose source_key is NOT in this run's
--    set are deleted: the sheet is the source of truth, so a column that
--    disappeared upstream must disappear here too. Manual and demo rows
--    are never touched. Guarded by p_prune so a caller can opt out, and
--    skipped entirely when the incoming set is empty (a failed or
--    truncated parse must never wipe the table).
-- ------------------------------------------------------------
-- Drop the previous 3-argument signature first: PostgREST cannot resolve
-- an overloaded RPC unambiguously, so leaving it behind makes every
-- call ambiguous (and the sync silently stops writing).
drop function if exists public.orbit_sync_attendance(uuid, jsonb, text);

create or replace function public.orbit_sync_attendance(
  p_user_id uuid,
  p_records jsonb,
  p_source_file text default 'attendance.xlsx',
  p_prune boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_ins integer := 0;
  v_upd integer := 0;
  v_skip integer := 0;
  v_del integer := 0;
  v_subject bigint;
  v_slot bigint;
  v_date date;
  v_status text;
  v_row integer;
  v_key text;
  v_cnum integer;
  v_ckind text;
  v_keys text[] := array[]::text[];
  v_existing public.attendance%rowtype;
begin
  if p_user_id is null then
    raise exception 'orbit_sync_attendance: p_user_id is required';
  end if;
  -- Authenticated callers may only sync their own rows; service role
  -- (auth.uid() null) is the scheduled-sync path.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'orbit_sync_attendance: cannot sync attendance for another user';
  end if;

  -- Serialize per user: concurrent syncs queue instead of racing.
  perform pg_advisory_xact_lock(hashtext('orbit_att_sync:' || p_user_id::text));

  for r in select * from jsonb_array_elements(p_records) loop
    v_subject := nullif(r->>'subject_id', '')::bigint;
    v_slot    := nullif(r->>'slot_id', '')::bigint;
    v_date    := nullif(r->>'class_date', '')::date;
    v_status  := r->>'status';
    v_row     := coalesce(nullif(r->>'source_row', '')::integer, 0);
    v_key     := nullif(r->>'source_key', '');
    v_cnum    := nullif(r->>'class_number', '')::integer;
    v_ckind   := nullif(r->>'class_kind', '');

    -- Identity is the source_key, not the timetable. subject_id and
    -- class_date are deliberately NOT required: the sheet's undated
    -- "Clubs and clans" column has neither, and it is still a real class.
    if v_status not in ('present','absent','late','excused') then
      v_skip := v_skip + 1;
      continue;
    end if;

    if v_key is not null then
      v_keys := array_append(v_keys, v_key);

      -- a) deterministic identity: this exact source cell, already imported
      select * into v_existing from public.attendance a
       where a.user_id = p_user_id and a.source_key = v_key
       order by a.id
       limit 1;
      if found then
        if v_existing.status is distinct from v_status then
          update public.attendance
             set status = v_status,
                 subject_id = v_subject,
                 slot_id = v_slot,
                 class_date = v_date,
                 class_number = v_cnum,
                 class_kind = v_ckind,
                 source_file = p_source_file,
                 source_row = v_row,
                 imported_at = now(),
                 updated_at = now()
           where id = v_existing.id;
          v_upd := v_upd + 1;
        else
          v_skip := v_skip + 1;  -- unchanged: no write, true no-op
        end if;
        continue;
      end if;

      -- b) pre-migration excel_sync row (no source_key yet) with the same
      --    subject+date+slot: claim it so the first post-deploy sync does
      --    not duplicate every record that is already there.
      if v_subject is not null and v_date is not null then
        select * into v_existing from public.attendance a
         where a.user_id = p_user_id
           and a.source_key is null
           and a.source = 'excel_sync'
           and a.subject_id = v_subject
           and a.class_date = v_date
           and a.slot_id is not distinct from v_slot
         order by a.id
         limit 1;
        if found then
          update public.attendance
             set status = v_status,
                 source_key = v_key,
                 class_number = v_cnum,
                 class_kind = v_ckind,
                 source_file = p_source_file,
                 source_row = v_row,
                 imported_at = now(),
                 updated_at = now()
           where id = v_existing.id;
          v_upd := v_upd + 1;
          continue;
        end if;
      end if;
    end if;

    -- A record that DID carry a source_key but found no existing row above
    -- (a new class column, or the undated "Clubs and clans" column, which
    -- legitimately has no subject and no date) goes straight to a fresh
    -- import. Only a record with NO source_key needs the legacy
    -- subject+date session match below.
    if v_key is null and (v_subject is null or v_date is null) then
      v_skip := v_skip + 1;
      continue;
    end if;

    if v_key is not null then
      -- e) fresh import (with or without subject/date)
      insert into public.attendance
        (user_id, subject_id, class_date, status, slot_id,
         class_number, class_kind, source_key,
         source, source_file, source_row, imported_at, is_demo)
      values
        (p_user_id, v_subject, v_date, v_status, v_slot,
         v_cnum, v_ckind, v_key,
         'excel_sync', p_source_file, v_row, now(), false);
      v_ins := v_ins + 1;
      continue;
    end if;

    -- Fallback for records with no source_key: match the session as before.

    select * into v_existing from public.attendance a
     where a.user_id = p_user_id
       and a.source_key is null
       and a.subject_id = v_subject
       and a.class_date = v_date
       and a.slot_id is not distinct from v_slot
       and a.source = 'excel_sync'
     order by a.id
     limit 1;
    if found then
      if v_existing.status is distinct from v_status then
        update public.attendance
           set status = v_status,
               source_file = p_source_file,
               source_row = v_row,
               imported_at = now(),
               updated_at = now()
         where id = v_existing.id;
        v_upd := v_upd + 1;
      else
        v_skip := v_skip + 1;
      end if;
      continue;
    end if;

    -- c) manual row for the same subject+date without a slot: the
    --    Excel session claims it (no duplicate, manual UI still works).
    select * into v_existing from public.attendance a
     where a.user_id = p_user_id
       and a.source_key is null
       and a.subject_id = v_subject
       and a.class_date = v_date
       and a.slot_id is null
       and a.source <> 'excel_sync'
     order by a.id
     limit 1;
    if found then
      update public.attendance
         set status = v_status,
             slot_id = v_slot,
             source = 'excel_sync',
             source_key = v_key,
             class_number = v_cnum,
             class_kind = v_ckind,
             source_file = p_source_file,
             source_row = v_row,
             imported_at = now(),
             updated_at = now()
       where id = v_existing.id;
      v_upd := v_upd + 1;
      continue;
    end if;

    -- d) any other occupant of this key (manual row WITH a slot, demo
    --    data, …): never overwrite manual attendance — skip.
    select 1 into v_existing from public.attendance a
     where a.user_id = p_user_id
       and a.subject_id = v_subject
       and a.class_date = v_date
       and a.slot_id is not distinct from v_slot
     limit 1;
    if found then
      v_skip := v_skip + 1;
      continue;
    end if;

    -- e) fresh import
    insert into public.attendance
      (user_id, subject_id, class_date, status, slot_id,
       class_number, class_kind, source_key,
       source, source_file, source_row, imported_at, is_demo)
    values
      (p_user_id, v_subject, v_date, v_status, v_slot,
       v_cnum, v_ckind, v_key,
       'excel_sync', p_source_file, v_row, now(), false);
    v_ins := v_ins + 1;
  end loop;

  -- ---- stale removal ------------------------------------------
  -- The sheet is the source of truth: a class column that no longer
  -- exists upstream must not linger here. Only this user's
  -- excel_sync rows with a source_key are eligible; manual and demo
  -- rows are never touched. Never runs on an empty incoming set,
  -- because a truncated or failed parse must not wipe the table.
  if p_prune and array_length(v_keys, 1) is not null then
    delete from public.attendance a
     where a.user_id = p_user_id
       and a.source = 'excel_sync'
       and a.source_key is not null
       and not (a.source_key = any(v_keys));
    get diagnostics v_del = row_count;
  end if;

  return jsonb_build_object(
    'inserted', v_ins, 'updated', v_upd, 'skipped', v_skip, 'pruned', v_del);
end $$;

revoke all on function public.orbit_sync_attendance(uuid, jsonb, text, boolean) from public;
grant execute on function public.orbit_sync_attendance(uuid, jsonb, text, boolean)
  to authenticated, service_role;

-- ------------------------------------------------------------
-- 4) Recurring schedule — pg_cron + pg_net POST the edge function
--    every 2 hours. Requires secrets (set via Dashboard/Management API):
--      ATTENDANCE_SOURCE_URL  — the Google Sheets URL (Anyone with link)
--      SYNC_CRON_SECRET       — shared key, echoed in x-sync-key
--    Replace <SYNC_CRON_SECRET> below before running section 4.
-- ------------------------------------------------------------
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- do $$
-- begin
--   if exists (select 1 from cron.job where jobname = 'orbit-attendance-sync') then
--     perform cron.unschedule('orbit-attendance-sync');
--   end if;
--   perform cron.schedule(
--     'orbit-attendance-sync',
--     '0 */2 * * *',
--     $job$
--     select net.http_post(
--       url := 'https://aqcuhfcedygmuemybarh.supabase.co/functions/v1/attendance-sync',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-sync-key', '<SYNC_CRON_SECRET>'
--       ),
--       body := '{"trigger":"cron"}'::jsonb
--     );
--     $job$
--   );
-- end $$;
