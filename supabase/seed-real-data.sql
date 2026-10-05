-- ============================================================
-- Orbit — REAL DATA INSERTION for the authenticated student.
-- Inserts the actual BST Section A subjects, weekly timetable and
-- the official S-VYASA 2026–27 academic calendar as real rows in the
-- existing user-owned tables, scoped to a target user_id (never global).
--
-- IDEMPOTENT: safe to run again — existing BST rows are replaced,
-- user-created rows (tests, attendance, personal events…) untouched.
--
-- Run with the target user's id:
--   psql … -v uid="0f9c7c2b-1782-4d3e-94fc-3428e74b5832" -f seed-real-data.sql
-- (The Management API path executes the same file with :uid replaced.)
-- ============================================================

-- ------------------------------------------------------------
-- Security-definer helper: the ONLY server-side path allowed to
-- target a user_id explicitly. Refuses to act on non-existent users.
-- Safe to re-run (create or replace).
-- ------------------------------------------------------------
create or replace function public.orbit_seed_real_data(target_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_java bigint; v_agents bigint; v_web bigint; v_math bigint;
  v_contest bigint; v_ebc bigint; v_env bigint; v_yoga bigint;
  v_mentor bigint; v_club bigint;
  v_uid uuid := coalesce(target_user, auth.uid());
begin
  if v_uid is null then
    raise exception 'orbit_seed_real_data: no target user and no authenticated caller';
  end if;
  -- Serialize per-user: the delete-then-insert is only idempotent when
  -- runs are ordered, so concurrent auto-seed calls queue behind the lock.
  perform pg_advisory_xact_lock(hashtext('orbit_seed_real_data:' || v_uid::text));
  if not exists (select 1 from auth.users where id = v_uid) then
    raise exception 'orbit_seed_real_data: unknown user %', v_uid;
  end if;

  -- ------------------------------------------------------------
  -- 0) Replace previous BST-seeded rows only (identified by marker
  --    text), never user-created records.
  -- ------------------------------------------------------------
  delete from public.class_schedule
   where user_id = v_uid
     and (notes like '%source: BST Section A timetable%'
          or notes like '%BST-SEED%');
  delete from public.academic_events
   where user_id = v_uid
     and description like '%Source: Official Academic Calendar 2026-27%';

  -- Subjects: match the 10 BST names directly (the schedule rows that
  -- referenced them were removed above). Subjects carrying real user
  -- work (tests / assignments / attendance / sessions) are preserved.
  delete from public.subjects
   where user_id = v_uid
     and name in (
       'Programming for Problem Solving Using Java',
       'AI Foundation - Introduction to Agents',
       'Programming for Web Development - I',
       'Mathematics - I for Data Science',
       'Programming/DSA Contest',
       'Entrepreneurship and Business Communication',
       'Environmental Science',
       'Foundations of Yoga',
       'Mentorship / Doubt Session',
       'Club Activities')
     and not exists (select 1 from public.tests t           where t.subject_id = subjects.id and t.user_id = v_uid)
     and not exists (select 1 from public.assignments a     where a.subject_id = subjects.id and a.user_id = v_uid)
     and not exists (select 1 from public.attendance at     where at.subject_id = subjects.id and at.user_id = v_uid)
     and not exists (select 1 from public.study_sessions ss where ss.subject_id = subjects.id and ss.user_id = v_uid);

  -- ------------------------------------------------------------
  -- 1) SUBJECTS — the 10 BST Section A courses (verbatim).
  -- ------------------------------------------------------------
  insert into public.subjects (user_id, name, code, faculty, credits, semester, description, target_percentage, attendance_required_pct, color)
  values (v_uid, 'Programming for Problem Solving Using Java', 'BTBC121', '', 4, 'Odd Semester 2026-27', 'Lecture / Laboratory · code BTBC121 (laboratory BTBC122)', 85, 75, '#a78bfa')
  returning id into v_java;
  insert into public.subjects (user_id, name, code, faculty, credits, semester, description, target_percentage, attendance_required_pct, color)
  values (v_uid, 'AI Foundation - Introduction to Agents', '', '', 3, 'Odd Semester 2026-27', 'Lecture', 85, 75, '#67e8f9')
  returning id into v_agents;
  insert into public.subjects (user_id, name, code, faculty, credits, semester, description, target_percentage, attendance_required_pct, color)
  values (v_uid, 'Programming for Web Development - I', 'BTBC123', '', 4, 'Odd Semester 2026-27', 'Lecture/Laboratory', 85, 75, '#6ee7b7')
  returning id into v_web;
  insert into public.subjects (user_id, name, code, faculty, credits, semester, description, target_percentage, attendance_required_pct, color)
  values (v_uid, 'Mathematics - I for Data Science', 'BTBC112', '', 4, 'Odd Semester 2026-27', 'Lecture/Tutorial', 85, 75, '#fbbf24')
  returning id into v_math;
  insert into public.subjects (user_id, name, code, faculty, credits, semester, description, target_percentage, attendance_required_pct, color)
  values (v_uid, 'Programming/DSA Contest', '', '', 2, 'Odd Semester 2026-27', 'Contest', 85, 75, '#f472b6')
  returning id into v_contest;
  insert into public.subjects (user_id, name, code, faculty, credits, semester, description, target_percentage, attendance_required_pct, color)
  values (v_uid, 'Entrepreneurship and Business Communication', 'BTBC111', '', 3, 'Odd Semester 2026-27', 'Lecture / Practical', 85, 75, '#93c5fd')
  returning id into v_ebc;
  insert into public.subjects (user_id, name, code, faculty, credits, semester, description, target_percentage, attendance_required_pct, color)
  values (v_uid, 'Environmental Science', 'BTCH112', '', 2, 'Odd Semester 2026-27', 'Lecture', 85, 75, '#86efac')
  returning id into v_env;
  insert into public.subjects (user_id, name, code, faculty, credits, semester, description, target_percentage, attendance_required_pct, color)
  values (v_uid, 'Foundations of Yoga', 'YOGA102', '', 2, 'Odd Semester 2026-27', 'Lecture / Practical', 85, 75, '#c4b5fd')
  returning id into v_yoga;
  insert into public.subjects (user_id, name, code, faculty, credits, semester, description, target_percentage, attendance_required_pct, color)
  values (v_uid, 'Mentorship / Doubt Session', '', '', 1, 'Odd Semester 2026-27', '', 85, 75, '#94a3b8')
  returning id into v_mentor;
  insert into public.subjects (user_id, name, code, faculty, credits, semester, description, target_percentage, attendance_required_pct, color)
  values (v_uid, 'Club Activities', '', '', 1, 'Odd Semester 2026-27', '', 85, 75, '#7dd3fc')
  returning id into v_club;

  -- ------------------------------------------------------------
  -- 2) WEEKLY TIMETABLE — Section A · Ground Floor, Classroom 5.
  --    22 slots, Mon–Fri. Thursday & Friday 2:00–3:20 PM are TWO real
  --    40-minute classes (2:00–2:40 and 2:40–3:20) per the official
  --    timetable — never merged into one block. Lunch 13:00–14:00 is
  --    NOT a class.
  -- ------------------------------------------------------------
  insert into public.class_schedule (user_id, subject_id, faculty, room, day_of_week, start_time, end_time, semester, academic_year, notes) values
  -- Monday
  (v_uid, v_java,   '', 'Ground Floor, Classroom 5', 1, '09:00', '10:50', 'Odd Semester 2026-27', '2026-27', 'Lecture · BTBC121 · source: BST Section A timetable'),
  (v_uid, v_agents, '', 'Ground Floor, Classroom 5', 1, '11:00', '13:00', 'Odd Semester 2026-27', '2026-27', 'Lecture · source: BST Section A timetable'),
  (v_uid, v_java,   '', 'Ground Floor, Classroom 5', 1, '14:00', '15:20', 'Odd Semester 2026-27', '2026-27', 'Laboratory · BTBC122 · source: BST Section A timetable'),
  (v_uid, v_web,    '', 'Ground Floor, Classroom 5', 1, '15:30', '17:00', 'Odd Semester 2026-27', '2026-27', 'Lecture/Laboratory · BTBC123 · source: BST Section A timetable'),
  -- Tuesday
  (v_uid, v_math,    '', 'Ground Floor, Classroom 5', 2, '09:00', '10:50', 'Odd Semester 2026-27', '2026-27', 'Lecture/Tutorial · BTBC112 · source: BST Section A timetable'),
  (v_uid, v_contest, '', 'Ground Floor, Classroom 5', 2, '11:00', '13:00', 'Odd Semester 2026-27', '2026-27', 'Contest · source: BST Section A timetable'),
  (v_uid, v_ebc,     '', 'Ground Floor, Classroom 5', 2, '14:00', '15:20', 'Odd Semester 2026-27', '2026-27', 'Lecture · BTBC111 · source: BST Section A timetable'),
  (v_uid, v_ebc,     '', 'Ground Floor, Classroom 5', 2, '15:30', '17:00', 'Odd Semester 2026-27', '2026-27', 'Practical · BTBC111 · source: BST Section A timetable'),
  -- Wednesday
  (v_uid, v_java,   '', 'Ground Floor, Classroom 5', 3, '09:00', '10:50', 'Odd Semester 2026-27', '2026-27', 'Lecture · BTBC121 · source: BST Section A timetable'),
  (v_uid, v_agents, '', 'Ground Floor, Classroom 5', 3, '11:00', '13:00', 'Odd Semester 2026-27', '2026-27', 'Lecture · source: BST Section A timetable'),
  (v_uid, v_java,   '', 'Ground Floor, Classroom 5', 3, '14:00', '15:20', 'Odd Semester 2026-27', '2026-27', 'Laboratory · BTBC122 · source: BST Section A timetable'),
  (v_uid, v_web,    '', 'Ground Floor, Classroom 5', 3, '15:30', '17:00', 'Odd Semester 2026-27', '2026-27', 'Lecture/Laboratory · BTBC123 · source: BST Section A timetable'),
  -- Thursday — two separate 40-minute classes: 2:00–2:40 Env Sci, 2:40–3:20 Yoga
  (v_uid, v_math,    '', 'Ground Floor, Classroom 5', 4, '09:00', '10:50', 'Odd Semester 2026-27', '2026-27', 'Lecture/Tutorial · BTBC112 · source: BST Section A timetable'),
  (v_uid, v_contest, '', 'Ground Floor, Classroom 5', 4, '11:00', '13:00', 'Odd Semester 2026-27', '2026-27', 'Contest · source: BST Section A timetable'),
  (v_uid, v_env,     '', 'Ground Floor, Classroom 5', 4, '14:00', '14:40', 'Odd Semester 2026-27', '2026-27', 'Lecture · BTCH112 · source: BST Section A timetable'),
  (v_uid, v_yoga,    '', 'Ground Floor, Classroom 5', 4, '14:40', '15:20', 'Odd Semester 2026-27', '2026-27', 'Lecture · YOGA102 · source: BST Section A timetable'),
  (v_uid, v_club,    '', 'Ground Floor, Classroom 5', 4, '15:30', '17:00', 'Odd Semester 2026-27', '2026-27', 'Club Activities / Doubt Session · source: BST Section A timetable'),
  -- Friday — two separate 40-minute classes: 2:00–2:40 Mentorship, 2:40–3:20 Env Sci
  (v_uid, v_yoga,    '', 'Ground Floor, Classroom 5', 5, '09:00', '10:50', 'Odd Semester 2026-27', '2026-27', 'Practical · YOGA102 · source: BST Section A timetable'),
  (v_uid, v_mentor,  '', 'Ground Floor, Classroom 5', 5, '11:00', '13:00', 'Odd Semester 2026-27', '2026-27', 'Mentorship / Doubt Session · source: BST Section A timetable'),
  (v_uid, v_mentor,  '', 'Ground Floor, Classroom 5', 5, '14:00', '14:40', 'Odd Semester 2026-27', '2026-27', 'Mentorship · source: BST Section A timetable'),
  (v_uid, v_env,     '', 'Ground Floor, Classroom 5', 5, '14:40', '15:20', 'Odd Semester 2026-27', '2026-27', 'Lecture · BTCH112 · source: BST Section A timetable'),
  (v_uid, v_club,    '', 'Ground Floor, Classroom 5', 5, '15:30', '17:00', 'Odd Semester 2026-27', '2026-27', 'Club Activities · source: BST Section A timetable');

  -- ------------------------------------------------------------
  -- 3) ACADEMIC CALENDAR — official S-VYASA × BST 2026–27.
  --    Titles verbatim. Tentative labels preserved. The two
  --    week-relative events (Results / Summer Term) get NO invented
  --    date: start_date = end_date = 9999-12-31 + relative text kept
  --    in the description, exactly as published.
  -- ------------------------------------------------------------
  insert into public.academic_events (user_id, title, event_type, start_date, end_date, priority, description) values
  -- ODD SEMESTER
  (v_uid, 'Commencement of Odd Semester (BST)', 'semester_start', '2026-08-03', '2026-08-03', 'normal', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Ganesh Chaturthi', 'holiday', '2026-09-14', '2026-09-14', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of Marks CIA - 1', 'assignment', '2026-09-28', '2026-09-28', 'normal', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Gandhi Jayanthi', 'holiday', '2026-10-02', '2026-10-02', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Class Committee Meeting - 1', 'college_event', '2026-10-13', '2026-10-13', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Mahanavami & Ayudha Pooja', 'holiday', '2026-10-20', '2026-10-20', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Vijayadashami', 'holiday', '2026-10-21', '2026-10-21', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Internal Assessment - 1', 'internal', '2026-10-26', '2026-10-26', 'high', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of Marks IA - 1', 'assignment', '2026-11-04', '2026-11-04', 'normal', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Parent Teacher Meeting (only for UG)', 'college_event', '2026-11-06', '2026-11-06', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Balipadyami / Deepavali', 'holiday', '2026-11-10', '2026-11-10', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of Marks CIA - 2', 'assignment', '2026-11-17', '2026-11-17', 'normal', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Class Committee Meeting - 2', 'college_event', '2026-11-20', '2026-11-20', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Internal Assessment - 2', 'internal', '2026-12-07', '2026-12-07', 'high', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of Marks IA - 2', 'assignment', '2026-12-16', '2026-12-16', 'normal', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Christmas Day', 'holiday', '2026-12-25', '2026-12-25', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Commemoration Day - Kalpatharu Day', 'college_event', '2027-01-01', '2027-01-01', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of Marks CIA - 3/P', 'assignment', '2027-01-05', '2027-01-05', 'normal', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Semester End Practical Exams', 'practical', '2027-01-11', '2027-01-14', 'high', 'Odd Semester · Duration: 4 days · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Convocation', 'college_event', '2027-01-12', '2027-01-12', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Makar Sankranti', 'holiday', '2027-01-15', '2027-01-15', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Announcement of Consolidated IA + CIA Marks', 'assignment', '2027-01-18', '2027-01-18', 'normal', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of SEE Practical Marks', 'assignment', '2027-01-20', '2027-01-20', 'normal', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Republic Day', 'holiday', '2027-01-26', '2027-01-26', 'low', 'Odd Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Commencement of Semester End Examination - Jan 2027', 'endsem', '2027-01-27', '2027-01-27', 'high', 'Odd Semester · Duration: 1 day · Date marked tentative in the official calendar · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Announcement of Results (Odd Semester)', 'other', '9999-12-31', '9999-12-31', 'low', 'Odd Semester · 10 days from the last day of examination · Date marked tentative in the official calendar · no exact date published · Source: Official Academic Calendar 2026-27'),
  -- EVEN SEMESTER
  (v_uid, 'Commencement of Even Semester', 'semester_start', '2027-02-19', '2027-02-19', 'normal', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of course registration in ERP', 'assignment', '2027-03-12', '2027-03-12', 'normal', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of Marks CIA - 1', 'assignment', '2027-03-22', '2027-03-22', 'normal', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Good Friday', 'holiday', '2027-03-26', '2027-03-26', 'low', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Class Committee Meeting - 1', 'college_event', '2027-03-31', '2027-03-31', 'low', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Internal Assessment - 1', 'internal', '2027-04-05', '2027-04-07', 'high', 'Even Semester · Duration: 3 days · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Ugadi', 'holiday', '2027-04-08', '2027-04-08', 'low', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - Ambedkar Jayanthi', 'holiday', '2027-04-14', '2027-04-14', 'low', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of Marks IA - 1', 'assignment', '2027-04-16', '2027-04-16', 'normal', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Parents Teacher Meeting (only for UG)', 'college_event', '2027-04-23', '2027-04-23', 'low', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Government Holiday - May Day', 'holiday', '2027-05-01', '2027-05-01', 'low', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of Marks CIA - 2', 'assignment', '2027-05-07', '2027-05-07', 'normal', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Class Committee Meeting - 2', 'college_event', '2027-05-20', '2027-05-20', 'low', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Internal Assessment - 2', 'internal', '2027-06-07', '2027-06-09', 'high', 'Even Semester · Duration: 3 days · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of Marks IA - 2', 'assignment', '2027-06-16', '2027-06-16', 'normal', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'International Day of Yoga', 'college_event', '2027-06-21', '2027-06-21', 'low', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Freezing of Marks CIA - 3/P', 'assignment', '2027-06-23', '2027-06-23', 'normal', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Announcement of Consolidated IA + CIA Marks', 'assignment', '2027-06-29', '2027-06-29', 'normal', 'Even Semester · Duration: 1 day · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Commencement of Semester End Examination - July 2027', 'endsem', '2027-07-07', '2027-07-07', 'high', 'Even Semester · Duration: 1 day · Date marked tentative in the official calendar · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Announcement of Results (SEE - July 2027)', 'other', '9999-12-31', '9999-12-31', 'low', 'Even Semester · 10 days from the last day of examination · Date marked tentative in the official calendar · no exact date published · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Summer Term (Optional)', 'other', '9999-12-31', '9999-12-31', 'low', 'Even Semester · 1st week of August 2027 · Date marked tentative in the official calendar · no exact date published · Source: Official Academic Calendar 2026-27'),
  (v_uid, 'Commencement of Academic Year 2027–28', 'semester_start', '2027-08-02', '2027-08-02', 'normal', 'Even Semester · Duration: 1 day · Date marked tentative in the official calendar · Source: Official Academic Calendar 2026-27');

  -- ------------------------------------------------------------
  -- 4) Enrich the student profile with the real academic identity.
  -- ------------------------------------------------------------
  update public.profiles
     set full_name = coalesce(nullif(full_name, ''), 'Aditya Kumar'),
         college = 'Bosscoder School of Technology (S-VYASA University)',
         program = coalesce(nullif(program, ''), 'B.Tech'),
         branch = coalesce(nullif(branch, ''), 'Section A'),
         academic_year = coalesce(nullif(academic_year, ''), '2026-27')
   where id = v_uid;
end $$;

comment on function public.orbit_seed_real_data(uuid) is
  'Admin-only real-data seeding for Orbit: BST Section A subjects, weekly timetable and the official S-VYASA 2026-27 academic calendar. Idempotent; refuses unknown users; respects RLS for all normal callers.';
