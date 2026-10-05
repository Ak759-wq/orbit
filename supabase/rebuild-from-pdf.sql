-- ============================================================
-- Orbit — attendance REBUILD from yulu.pdf (source of truth)
-- Target: Aditya kumar, USN 2392608071
--   user 0f9c7c2b-1782-4d3e-94fc-3428e74b5832
--
-- Rules implemented here:
--   • Old imported dataset (source='excel_sync') is archived to
--     public.attendance_rebuild_archive, then removed. Manual rows
--     (source <> 'excel_sync') are NEVER touched. Other users
--     (e.g. 2392608094) are NEVER touched.
--   • The 15 PDF columns on 31 Aug / 1-4 / 7 Sep whose class digits
--     are physically absent from the PDF (export clipped them) are
--     NOT invented: they are reconstructed from the 1:1 verified
--     match with the previous import (same date, same mark, and
--     the DB-only slots are exactly the Monday-only slots that
--     exist on those weekdays). source_row = -1 marks them.
--   • The duplicate PDF column (23 Sep class 3, printed twice —
--     first P, corrected A) follows the established LAST-WINS
--     convention → 'absent'.
--   • Result: 70 rows from 2026-08-25 through 2026-09-30,
--     68 present / 2 absent = 97.14%. 36 pre-cutoff columns exist
--     in the PDF and are ignored (never imported), as before.
-- ============================================================

-- 0) Archive the old imported dataset (excel_sync only).
create table if not exists public.attendance_rebuild_archive (
  like public.attendance including defaults,
  archived_at timestamptz not null default now()
);
-- the copied bigint identity column arrives as NOT NULL without its
-- sequence default; the archive does not need it.
alter table public.attendance_rebuild_archive drop column if exists id;

insert into public.attendance_rebuild_archive (user_id, subject_id, class_date, status, slot_id,
  source, source_file, source_row, imported_at, is_demo, created_at, updated_at)
select user_id, subject_id, class_date, status, slot_id,
  source, source_file, source_row, imported_at, is_demo, created_at, updated_at
from public.attendance
where user_id = '0f9c7c2b-1782-4d3e-94fc-3428e74b5832'
  and source = 'excel_sync';

-- 1) Remove the old imported rows (excel_sync only, this user only).
delete from public.attendance
where user_id = '0f9c7c2b-1782-4d3e-94fc-3428e74b5832'
  and source = 'excel_sync';

-- 1.5) subject_id becomes nullable: the PDF's own class digits are the
--      identity; a subject is attached only when the timetable maps the
--      date/class confidently. Never invent a subject.
alter table public.attendance alter column subject_id drop not null;

-- 2) RPC v2: PDF-source upsert (USN + date + class identity).
--    Same ownership guard + per-user advisory lock; match order:
--      a) same pdf_sync session (slot match, or NULL slot when the
--         PDF class digit was unreadable) → update on change
--      b) pdf_sync row same date with NULL slot + NULL subject →
--         claims a real slot when this run resolved one
--      c) any other occupant of the key → skip (never overwrite
--         manual attendance)
--      d) else insert
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
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'orbit_sync_attendance: cannot sync attendance for another user';
  end if;

  perform pg_advisory_xact_lock(hashtext('orbit_att_sync:' || p_user_id::text));

  for r in select * from jsonb_array_elements(p_records) loop
    v_subject := nullif(r->>'subject_id', '')::bigint;
    v_slot    := nullif(r->>'slot_id', '')::bigint;
    v_date    := nullif(r->>'class_date', '')::date;
    v_status  := r->>'status';
    v_row     := coalesce(nullif(r->>'source_row', '')::integer, 0);

    if v_date is null or v_status not in ('present','absent','late','excused') then
      v_skip := v_skip + 1;
      continue;
    end if;

    -- a) same imported session already present? (pipeline-owned rows:
    --    pdf_sync and the legacy excel_sync imports)
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

    -- b) unresolved-slot pdf row (slot NULL): claim it if a real
    --    slot for this date has not been imported yet.
    if v_slot is null then
      select * into v_existing from public.attendance a
       where a.user_id = p_user_id
         and a.class_date = v_date
         and a.slot_id is null
         and a.source = 'pdf_sync'
         and a.subject_id is null
       order by a.id
       limit 1;
      if found then
        update public.attendance
           set status = v_status,
               subject_id = coalesce(v_subject, v_existing.subject_id),
               source_file = p_source_file,
               source_row = v_row,
               imported_at = now(),
               updated_at = now()
         where id = v_existing.id;
        v_upd := v_upd + 1;
      else
        insert into public.attendance
          (user_id, subject_id, class_date, status, slot_id,
           source, source_file, source_row, imported_at, is_demo)
        values
          (p_user_id, v_subject, v_date, v_status, null,
           'pdf_sync', p_source_file, v_row, now(), false);
        v_ins := v_ins + 1;
      end if;
      continue;
    end if;

    -- b2) resolved slot: adopt a slotless pdf row for this date.
    select * into v_existing from public.attendance a
     where a.user_id = p_user_id
       and a.class_date = v_date
       and a.slot_id is null
       and a.source = 'pdf_sync'
       and a.subject_id is null
     order by a.id
     limit 1;
    if found then
      update public.attendance
         set status = v_status,
             subject_id = v_subject,
             slot_id = v_slot,
             source_file = p_source_file,
             source_row = v_row,
             imported_at = now(),
             updated_at = now()
       where id = v_existing.id;
      v_upd := v_upd + 1;
      continue;
    end if;

    -- c) any other occupant of this key (manual rows, old imports):
    --    never overwrite — skip.
    select 1 into v_existing from public.attendance a
     where a.user_id = p_user_id
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
       'pdf_sync', p_source_file, v_row, now(), false);
    v_ins := v_ins + 1;
  end loop;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'skipped', v_skip);
end $$;

revoke all on function public.orbit_sync_attendance(uuid, jsonb, text) from public;
grant execute on function public.orbit_sync_attendance(uuid, jsonb, text)
  to authenticated, service_role;
