-- ============================================================
-- Orbit — attendance is EXCEL-ONLY and READ-ONLY
--
-- The connected Google Sheet ("BST Section A attendance sheet")
-- is the single source of truth for attendance. This migration
-- closes the three write paths that let a student invent, edit or
-- delete their own attendance without ever touching the sheet:
--
--   1. public.attendance had `attendance_owner_all ... for all`,
--      so a signed-in student could INSERT/UPDATE/DELETE their own
--      rows straight through PostgREST, no UI required.
--   2. orbit_sync_attendance was granted to `authenticated`, so it
--      could be called from the browser console with invented
--      records and stamped source='excel_sync' on them.
--   3. Any row could carry a hand-written status that the next sync
--      did not overwrite, quietly disagreeing with the sheet.
--
-- After this migration the ONLY write path to public.attendance is
-- orbit_sync_attendance, called by the attendance-sync edge
-- function with the service role. Students keep SELECT, Sync Now
-- and Export; they lose create/edit/delete entirely.
--
-- HARD BUSINESS RULES kept intact (see attendance-sync.sql):
--   • attendance period starts 2026-08-25; earlier rows never count
--   • blank cells are not attendance and are never turned into 'absent'
--   • one record per source cell, keyed deterministically by
--     source_key, so re-syncing can never duplicate
--   • P <-> A flips in the sheet are applied on the next sync
--   • a failed sync preserves the last known good data
--
-- Run once in the Supabase SQL editor (or via Management API).
-- Idempotent: safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1) The undated session gets a name.
--
-- The sheet has one real class column with no date and no subject
-- ("Clubs and clans"). The sync already sends its header as
-- class_label in the record JSON, but there was nowhere to store
-- it, so the Attendance page had to print "—" for a genuine class.
-- Backfill the existing rows from their deterministic key so the
-- record shows the name the sheet gave it.
-- ------------------------------------------------------------
alter table public.attendance
  add column if not exists class_label text;

update public.attendance
   set class_label = 'Clubs and clans'
 where class_label is null
   and class_kind = 'undated'
   and source_key is not null
   and source_key like '%_clubs_and_clans';

-- ------------------------------------------------------------
-- 2) Drop every row that did not come from the sheet.
--
-- Anything with source <> 'excel_sync' was created by a human
-- (or an old demo seed), so it is not attendance and must not be
-- counted against the student. On the live database this is a
-- no-op — the data is already 77 records, 77 from Excel — and the
-- next sync re-imports the authoritative set anyway, so nothing
-- real is lost.
--
-- Demo rows are listed first so the removal is auditable.
-- ------------------------------------------------------------
do $$
declare
  v_manual bigint;
  v_demo   bigint;
begin
  select count(*) into v_manual
    from public.attendance
   where user_id is not null and (source is null or source <> 'excel_sync');
  select count(*) into v_demo
    from public.attendance
   where user_id is not null and is_demo;
  raise notice 'attendance: removing % non-Excel row(s) (% demo)', v_manual, v_demo;
end $$;

delete from public.attendance
 where source is null or source <> 'excel_sync';

-- ------------------------------------------------------------
-- 3) Provenance becomes an invariant, not a convention.
--
-- NOT VALID on purpose: the constraint is enforced for every future
-- INSERT/UPDATE (so neither the student nor a future code path can
-- write a non-sheet row) without failing on any row that predates
-- it. The table above is already clean, so validation is optional;
-- run it separately when convenient:
--   alter table public.attendance validate constraint attendance_excel_only;
-- ------------------------------------------------------------
alter table public.attendance drop constraint if exists attendance_excel_only;
alter table public.attendance
  add constraint attendance_excel_only
  check (source = 'excel_sync' and source_key is not null) not valid;

-- ------------------------------------------------------------
-- 4) RLS: the student may READ their attendance. Nothing else.
--
-- attendance_owner_all (for all) is dropped. Subject deletion still
-- removes attendance because FK cascade actions run as the table
-- owner and bypass RLS.
-- ------------------------------------------------------------
drop policy if exists "attendance_owner_all" on public.attendance;
drop policy if exists "attendance_select_own" on public.attendance;

create policy "attendance_select_own" on public.attendance
  for select using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5) The sync RPC is service-role only.
--
-- The edge function calls it with the service role client, so
-- revoking `authenticated` costs nothing: "Sync Now" still works
-- through attendance-sync. It only removes the console path where a
-- student could hand-write records and have them stamped as
-- Excel-sourced. The RPC's own ownership guard stays as defence in
-- depth.
-- ------------------------------------------------------------
revoke execute on function public.orbit_sync_attendance(uuid, jsonb, text, boolean) from authenticated;

-- ------------------------------------------------------------
-- 6) Owner-scoped purge, so "Clear demo data" / "Delete all
--    academic data" still work without a student write policy.
--
-- Security definer, hard-scoped to auth.uid(): a caller can only
-- ever delete their OWN attendance, and cannot name another user.
-- ------------------------------------------------------------
create or replace function public.orbit_purge_attendance(p_scope text default 'demo')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'orbit_purge_attendance: sign-in required';
  end if;
  if p_scope not in ('demo', 'all') then
    raise exception 'orbit_purge_attendance: p_scope must be ''demo'' or ''all''';
  end if;

  if p_scope = 'demo' then
    delete from public.attendance a
     where a.user_id = auth.uid() and a.is_demo;
  else
    delete from public.attendance a
     where a.user_id = auth.uid();
  end if;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

revoke all on function public.orbit_purge_attendance(text) from public;
grant execute on function public.orbit_purge_attendance(text) to authenticated;

-- ------------------------------------------------------------
-- 7) Sync RPC, Excel-only edition.
--
-- Same contract as before — deterministic source_key identity,
-- status-change-only UPDATE (so a re-run is a true no-op), per-user
-- advisory lock, prune of sheet rows that vanished upstream, and an
-- empty incoming set that never wipes the table. What is gone is
-- every branch that existed to accommodate manually entered rows:
-- a manual row can no longer be claimed, skipped around or left to
-- disagree with the sheet. If the sheet says P/A, that is the row.
--
-- A record's identity is its source cell:
--   source_key = "<usn>_<date>_class<n>"  for dated columns
--              = "<usn>_<label_slug>"     for undated columns
--
-- Drop the previous 3-argument signature first: PostgREST cannot
-- resolve an overloaded RPC unambiguously, so leaving it behind
-- makes every call ambiguous and the sync silently stops writing.
-- ------------------------------------------------------------
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
  v_label text;
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
    v_label   := nullif(r->>'class_label', '');
    v_row     := coalesce(nullif(r->>'source_row', '')::integer, 0);
    v_key     := nullif(r->>'source_key', '');
    v_cnum    := nullif(r->>'class_number', '')::integer;
    v_ckind   := nullif(r->>'class_kind', '');

    -- Identity is the source cell, not the timetable. subject_id and
    -- class_date are deliberately NOT required: the sheet's undated
    -- "Clubs and clans" column has neither and is still a real class.
    -- Without a key there is no deterministic identity, so the record
    -- cannot be safely upserted — skip it rather than duplicate it.
    if v_key is null
       or v_status not in ('present','absent','late','excused') then
      v_skip := v_skip + 1;
      continue;
    end if;

    v_keys := array_append(v_keys, v_key);

    -- The sheet's own session, already imported: update only when the
    -- mark actually changed, so re-running is a true no-op.
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
               class_label = v_label,
               class_number = v_cnum,
               class_kind = v_ckind,
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

    -- A pre-migration sheet row (source_key IS NULL) matching the old
    -- subject+date+slot shape: claim it and backfill the key, so the
    -- first sync after adding source_key does not double every record.
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
               class_label = v_label,
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

    -- New class column (or the undated one): import it fresh.
    insert into public.attendance
      (user_id, subject_id, class_date, status, slot_id,
       class_number, class_kind, class_label, source_key,
       source, source_file, source_row, imported_at, is_demo)
    values
      (p_user_id, v_subject, v_date, v_status, v_slot,
       v_cnum, v_ckind, v_label, v_key,
       'excel_sync', p_source_file, v_row, now(), false);
    v_ins := v_ins + 1;
  end loop;

  -- ---- stale removal ------------------------------------------
  -- The sheet is the source of truth: a class column that no longer
  -- exists upstream must not linger here. Only this user's sheet rows
  -- with a source_key are eligible. Never runs on an empty incoming
  -- set, because a truncated or failed parse must not wipe the table.
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
  to service_role;