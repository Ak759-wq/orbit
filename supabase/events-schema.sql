-- ============================================================
-- Orbit — Upcoming Events (hackathons, competitions, workshops…)
-- Companion to schema.sql. Run in the Supabase SQL editor (or apply
-- via the Management API). Every row is user-owned; RLS guarantees
-- one student can never read or write another student's events.
-- ============================================================

-- ---------- Events database ----------
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null,
  event_type text not null default 'Other'
    check (event_type in ('Hackathon','Competition','Workshop','Webinar','Conference',
                          'College Event','Club Event','Coding Contest','AI Event','Other')),
  organizer text not null default '',
  description text not null default '',
  start_date date,
  end_date date,
  reg_deadline date,
  location text not null default '',
  mode text not null default 'Online'
    check (mode in ('Online','Offline','Hybrid')),
  reg_url text not null default '',
  source_url text not null default '',
  eligibility text not null default '',
  prize text not null default '',
  skills text[] not null default '{}',
  tags text[] not null default '{}',
  image_url text,
  ai_extracted boolean not null default false,
  user_notes text not null default '',
  last_verified date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists events_user_start_idx on public.events (user_id, start_date);

-- ---------- My Events (bookmarks + tracking status) ----------
create table if not exists public.event_bookmarks (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  event_id bigint not null references public.events(id) on delete cascade,
  track_status text not null default 'Interested'
    check (track_status in ('Interested','Registered','Participating','Completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);

-- ---------- updated_at trigger ----------
drop trigger if exists trg_events_db_updated on public.events;
create trigger trg_events_db_updated before update on public.events
for each row execute function public.touch_updated_at();

drop trigger if exists trg_event_bookmarks_updated on public.event_bookmarks;
create trigger trg_event_bookmarks_updated before update on public.event_bookmarks
for each row execute function public.touch_updated_at();

-- ---------- Row Level Security ----------
alter table public.events enable row level security;
alter table public.event_bookmarks enable row level security;

create policy "events_owner_all" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "event_bookmarks_owner_all" on public.event_bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
