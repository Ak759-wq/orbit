-- ============================================================
-- Orbit — attendance REVERT to the live Excel (Google Sheets) source
--
-- The yulu.pdf pipeline is removed. The live Google Sheet (Section A)
-- is the single source of truth again:
--   https://docs.google.com/spreadsheets/d/12bLuQ3Ds-VoQVoNsKYP8XZLTjeIjdjKKcF-poKZ1W2U
--   (tab "Section A", gid 1002611357)
--
-- What this script does:
--   1) Re-labels rows imported while the PDF was the source
--      (source='pdf_sync') as Excel-source rows — same data, correct
--      provenance. Manual rows are never touched.
--   2) Replaces the sync RPC with the Excel-source version:
--        a) existing pipeline row (pdf_sync or excel_sync) for the
--           same session (class_date + slot_id) → update on change
--        b) manual row same subject+date without a slot → claimed by
--           the Excel session (Excel wins for its sessions)
--        c) any other occupant of the key → skip (never overwrite
--           manual attendance)
--        d) else insert fresh with source='excel_sync'
--      The per-user advisory lock, ownership guard and grants are kept.
--
-- Idempotent: safe to run more than once.
-- ============================================================

-- 1) Re-label PDF-era imported rows as Excel-source rows.
update public.attendance
   set source = 'excel_sync',
       source_file = 'BST Section A attendance (Google Sheets)'
 where source = 'pdf_sync';

-- 2) Sync RPC v3 — Excel-source upsert.
create or replace function public.orbit_sync_attendance(
  p_user_id uuid,
  p_records jsonb,
  p_source_file text default 'attendance.xlsx'
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
  v_subject bigint;
  v_slot bigint;
  v_date date;
  v_status text;
  v_row integer;
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

    if v_subject is null or v_date is null
       or v_status not in ('present','absent','late','excused') then
      v_skip := v_skip + 1;
      continue;
    end if;

    -- a) same imported session already present? (pipeline-owned rows)
    select * into v_existing from public.attendance a
     where a.user_id = p_user_id
       and a.class_date = v_date
       and a.slot_id is not distinct from v_slot
       and a.source in ('pdf_sync', 'excel_sync')
     order by a.id
     limit 1;
    if found then
      if v_existing.status is distinct from v_status then
        update public.attendance
           set status = v_status,
               subject_id = coalesce(v_subject, v_existing.subject_id),
               source = 'excel_sync',
               source_file = p_source_file,
               source_row = v_row,
               imported_at = now(),
               updated_at = now()
         where id = v_existing.id;
        v_upd := v_upd + 1;
      else
        -- unchanged mark: no write at all, so re-runs are true no-ops
        v_skip := v_skip + 1;
      end if;
      continue;
    end if;

    -- b) manual row for the same subject+date without a slot: the
    --    Excel session claims it (no duplicate, manual UI still works).
    select * into v_existing from public.attendance a
     where a.user_id = p_user_id
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
             source_file = p_source_file,
             source_row = v_row,
             imported_at = now(),
             updated_at = now()
       where id = v_existing.id;
      v_upd := v_upd + 1;
      continue;
    end if;

    -- c) any other occupant of this key (manual row WITH a slot, demo
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

    -- d) fresh import
    insert into public.attendance
      (user_id, subject_id, class_date, status, slot_id,
       source, source_file, source_row, imported_at, is_demo)
    values
      (p_user_id, v_subject, v_date, v_status, v_slot,
       'excel_sync', p_source_file, v_row, now(), false);
    v_ins := v_ins + 1;
  end loop;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'skipped', v_skip);
end $$;

revoke all on function public.orbit_sync_attendance(uuid, jsonb, text) from public;
grant execute on function public.orbit_sync_attendance(uuid, jsonb, text)
  to authenticated, service_role;
