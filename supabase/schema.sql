-- ============================================================
-- ScholarOS — Personal Academic Operating System
-- Supabase schema: normalized tables + Row Level Security.
-- Every student-owned table carries user_id defaulting to the
-- caller's JWT so RLS guarantees one student can never read or
-- write another student's data.
--
-- Run this whole file in the Supabase SQL editor.
-- ============================================================

-- ---------- Updated-at helper ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- 1. Student profile ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  college text,
  program text,
  branch text,
  academic_year text,
  batch_year text,
  semester text,
  roll_number text,
  timezone text not null default 'local',
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 2. Subject database (referenced by every module) ----------
create table if not exists public.subjects (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  code text not null default '',
  faculty text,
  credits numeric not null default 0 check (credits >= 0),
  semester text,
  description text,
  target_percentage numeric not null default 75 check (target_percentage between 0 and 100),
  attendance_required_pct numeric not null default 75 check (attendance_required_pct between 0 and 100),
  color text not null default '#7c63f5',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 3. Weekly recurring class schedule ----------
create table if not exists public.class_schedule (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  faculty text,
  room text not null default '',
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  semester text,
  academic_year text,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 4. Academic calendar events ----------
create table if not exists public.academic_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null,
  event_type text not null default 'other'
    check (event_type in ('semester_start','semester_end','holiday','exam','midsem','endsem',
                          'assignment','project','practical','internal','college_event','break','other')),
  start_date date not null,
  end_date date not null,
  check (end_date >= start_date),
  description text,
  subject_id bigint references public.subjects(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 5. Tests & marks ----------
create table if not exists public.tests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  topic text,
  test_type text not null default 'class_test'
    check (test_type in ('class_test','quiz','internal','midsem','endsem','practical','assignment','other')),
  test_date date not null,
  max_marks numeric not null check (max_marks > 0),
  marks_obtained numeric check (marks_obtained is null or marks_obtained >= 0),
  check (marks_obtained is null or marks_obtained <= max_marks),
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

-- ---------- 6. Assignments / tasks ----------
create table if not exists public.assignments (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  description text,
  task_type text not null default 'assignment'
    check (task_type in ('assignment','homework','project','lab','study_task','submission','other')),
  created_date date not null default current_date,
  due_date date not null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  submission_link text,
  attachment_url text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 7. Attendance records (stats derived by aggregation) ----------
create table if not exists public.attendance (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  class_date date not null,
  status text not null check (status in ('present','absent')),
  slot_id bigint references public.class_schedule(id) on delete set null,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (subject_id, class_date, slot_id)
);

-- ---------- 8. Study planner sessions ----------
create table if not exists public.study_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  topic text not null default '',
  session_date date not null,
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  goal text,
  status text not null default 'planned' check (status in ('planned','in_progress','completed')),
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

-- ---------- 9. Academic goals ----------
create table if not exists public.goals (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  subject_id bigint references public.subjects(id) on delete cascade,
  goal_type text not null default 'manual'
    check (goal_type in ('manual','attendance','test_average','assignments_completed','study_hours')),
  target_value numeric not null check (target_value > 0),
  current_value numeric not null default 0 check (current_value >= 0),
  start_date date not null default current_date,
  deadline date,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

-- ---------- 10. Notes & resources ----------
create table if not exists public.resources (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null,
  resource_type text not null default 'note'
    check (resource_type in ('note','link','document','video','practice','reference')),
  subject_id bigint references public.subjects(id) on delete cascade,
  url text,
  content text,
  description text,
  date_added date not null default current_date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

-- ---------- 11. Notification settings + dismissals ----------
create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled_types text[] not null default array['upcoming_test','assignment_deadline','overdue_assignment','upcoming_exam','low_attendance','study_session','academic_event'],
  days_ahead integer not null default 7 check (days_ahead between 1 and 60),
  attendance_threshold numeric not null default 75 check (attendance_threshold between 0 and 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_dismissals (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dedupe_key text not null,
  dismissed_until date not null,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

-- ============================================================
-- updated_at triggers
-- ============================================================
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
for each row execute function public.touch_updated_at();
drop trigger if exists trg_subjects_updated on public.subjects;
create trigger trg_subjects_updated before update on public.subjects
for each row execute function public.touch_updated_at();
drop trigger if exists trg_schedule_updated on public.class_schedule;
create trigger trg_schedule_updated before update on public.class_schedule
for each row execute function public.touch_updated_at();
drop trigger if exists trg_events_updated on public.academic_events;
create trigger trg_events_updated before update on public.academic_events
for each row execute function public.touch_updated_at();
drop trigger if exists trg_tests_updated on public.tests;
create trigger trg_tests_updated before update on public.tests
for each row execute function public.touch_updated_at();
drop trigger if exists trg_assignments_updated on public.assignments;
create trigger trg_assignments_updated before update on public.assignments
for each row execute function public.touch_updated_at();
drop trigger if exists trg_attendance_updated on public.attendance;
create trigger trg_attendance_updated before update on public.attendance
for each row execute function public.touch_updated_at();
drop trigger if exists trg_sessions_updated on public.study_sessions;
create trigger trg_sessions_updated before update on public.study_sessions
for each row execute function public.touch_updated_at();
drop trigger if exists trg_goals_updated on public.goals;
create trigger trg_goals_updated before update on public.goals
for each row execute function public.touch_updated_at();
drop trigger if exists trg_resources_updated on public.resources;
create trigger trg_resources_updated before update on public.resources
for each row execute function public.touch_updated_at();

-- ============================================================
-- Auto-provision profile + default settings on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.notification_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security: every table scoped to its owner
-- ============================================================
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.class_schedule enable row level security;
alter table public.academic_events enable row level security;
alter table public.tests enable row level security;
alter table public.assignments enable row level security;
alter table public.attendance enable row level security;
alter table public.study_sessions enable row level security;
alter table public.goals enable row level security;
alter table public.resources enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_dismissals enable row level security;

-- profiles: owner reads + updates own, inserts handled by trigger
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- generic per-user tables: full CRUD on own rows only
create policy "subjects_owner_all" on public.subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "class_schedule_owner_all" on public.class_schedule
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "academic_events_owner_all" on public.academic_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tests_owner_all" on public.tests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assignments_owner_all" on public.assignments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- attendance is Excel-only and READ-ONLY for the student: they may
-- read their own synced attendance and nothing else. Every write
-- happens in orbit_sync_attendance (security definer, service role)
-- via the attendance-sync edge function. Run
-- supabase/attendance-readonly.sql for the complete migration
-- (provenance columns, class_label, sync-RPC grant).
create policy "attendance_select_own" on public.attendance
  for select using (auth.uid() = user_id);
create policy "study_sessions_owner_all" on public.study_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_owner_all" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "resources_owner_all" on public.resources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "settings_select_own" on public.notification_settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.notification_settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.notification_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "dismissals_owner_all" on public.notification_dismissals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
