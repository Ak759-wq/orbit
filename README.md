# ScholarOS — Personal Academic Operating System

One connected system for a student's entire academic life: profile, subjects, weekly class schedule, academic calendar, tests & marks, assignments, attendance, study planner, goals, notes & resources, analytics, dynamic reminders, an auto-generated weekly summary, and an AI assistant that answers **only from your own data**.

Built with React 19 + Vite + Tailwind 4 + Supabase (Postgres, Auth, Row Level Security, Edge Functions). Follows the neobrutalist design language used elsewhere in this repo.

---

## Features

| Module | What it does |
|---|---|
| **Student Profile** | Name, college, program, branch, academic year, batch, semester, roll number — used across the app |
| **Dashboard** | Today's classes with live upcoming/ongoing/completed status, today's tasks (assignments due, tests, study sessions, events), upcoming events, performance strip — all derived from real data |
| **Class Schedule** | Recurring weekly timetable; add / edit / delete / duplicate classes; today + week views; filter by subject and day |
| **Academic Calendar** | 13 event types with priority, subject link, multi-day support; auto countdowns ("5 days remaining"); month grid; CSV/JSON import with row-level validation |
| **Tests & Marks** | Record tests; percentage auto-calculated (`marks / max × 100`); filter by subject/type/date; export |
| **Analytics** | Overall average, subject-wise averages, highest/lowest/latest, trend direction with first→latest deltas ("62% → 78% = +16 pts"), best/worst subject insights |
| **Assignments** | 7 task types, 3 statuses; overdue / today / this-week buckets; completion %; one-click status cycling; submission links |
| **Attendance** | Per-subject + overall percentages; quick "mark today's classes"; **what-if projections** (attend vs miss next class); **classes-to-target calculator** with configurable requirement |
| **Study Planner** | Sessions with goals; planned vs completed hours; weekly hours; subject-wise time |
| **Goals** | Manual goals (+1/+5 buttons) and **auto-linked goals** — attendance %, test average, assignments completed, study hours update themselves from your data |
| **Subjects** | The single database every module references; per-subject target % and attendance requirement |
| **Notes & Resources** | Notes, links, documents, videos, practice sets — filterable by subject and type |
| **Reminders** | Dynamically generated from your data: upcoming tests, deadlines, overdue work, exams, low attendance, today's sessions, events; enable/disable per type; day-window setting |
| **Weekly Summary** | Auto-written sentences ("Last week you completed 3 tests with an average score of 76%…") — never invented |
| **AI Assistant** | Grounded in a server-side snapshot of *your* records; says "not added yet" when data is missing |
| **Search** | ⌘K / Ctrl+K global search across subjects, tests, assignments, events, notes, sessions, classes |
| **Demo Data** | One click loads a full sample semester (tagged `is_demo`, dates relative to today); clear it anytime in Settings |

Everything is calculated from stored data — no hardcoded stats, no fake numbers, safe division everywhere (you will never see `NaN` or `Infinity`).

---

## Quick start

### 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a project (free tier is fine).
2. Note the **Project URL** and **anon key** (Settings → API).

### 2. Create the database schema

Open the Supabase **SQL Editor** and paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), then run it.

This creates:

- `profiles`, `subjects`, `class_schedule`, `academic_events`, `tests`, `assignments`, `attendance`, `study_sessions`, `goals`, `resources`, `notification_settings`, `notification_dismissals`
- Normalized foreign keys (`tests.subject_id → subjects.id`, etc.)
- `CHECK` constraints as a backend to app validation (marks ≤ max, end > start, dates valid, percentages 0–100)
- A signup trigger that auto-creates the profile + default notification settings
- **Row Level Security on every table** so each account can only ever read and write its own rows

### 3. Configure environment

```bash
cd scholar-os
cp .env.example .env
```

Fill in:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run

```bash
npm install
npm run dev
```

Sign up → the onboarding wizard walks you through profile → subjects → weekly classes. Or click **Explore with demo data** to load a sample semester immediately.

### 5. (Optional) Enable the AI assistant

The assistant runs as a Supabase Edge Function so your API key never reaches the browser, and the data snapshot is built **server-side** with the caller's own JWT (RLS-scoped).

```bash
# inside the scholar-os folder
supabase login
supabase link --project-ref your-project-ref
supabase secrets set OPENROUTER_API_KEY=…       # required (OpenRouter key — the only AI secret)
supabase secrets set AI_MODEL=gpt-4o-mini           # optional (default gpt-4o-mini)
supabase secrets set AI_BASE_URL=https://api.openai.com/v1  # optional: any OpenAI-compatible endpoint
supabase functions deploy academic-ai
```

Nothing else to configure — the app calls the deployed function with the signed-in user's access token. If the function or key is missing, the chat shows a clear error and the rest of the app works normally.

---

## Scripts

```bash
npm run dev        # Vite dev server
npm run build      # production build → dist/
npm run preview    # preview the production build
npm run test       # vitest (unit tests for calc + datetime engines)
npm run lint       # oxlint
```

---

## Architecture

```
scholar-os/
├── supabase/
│   ├── schema.sql                    # tables, constraints, triggers, RLS
│   └── functions/academic-ai/        # Deno edge function (grounded LLM proxy)
└── src/
    ├── lib/
    │   ├── supabase.js               # client (Supabase-only mode)
    │   ├── db.js                     # typed data-access layer
    │   ├── datetime.js               # ISO date math, recurring weeks, countdowns, month grid
    │   ├── calc.js                   # ★ the shared calculation engine
    │   ├── validate.js               # form + CSV import validation
    │   ├── csv.js                    # CSV parse + export helpers
    │   └── constants.js              # option lists, badge styles
    ├── state/
    │   ├── AppContext.jsx            # auth session + data + actions + memoized analytics
    │   └── demo.js                   # demo semester generator (is_demo tagged)
    └── components/
        ├── Auth.jsx / Onboarding.jsx # signup/login/reset + 3-step wizard
        ├── Shell.jsx                 # sidebar, topbar, ⌘K search, reminder drawer
        ├── AIAssistant.jsx           # grounded chat panel
        ├── ui.jsx                    # neobrutalist primitives
        └── modules/                  # Dashboard, Schedule, Calendar, Tests, Analytics,
                                      # Assignments, Attendance, Planner, Goals, Subjects,
                                      # Notes, Summary, Settings
```

### The connected core: `src/lib/calc.js`

Every derived number in the app — dashboard stats, analytics, attendance projections, goal progress, weekly summary sentences, notification rules — is computed here and memoized once in `AppContext`. That is what makes the system *connected*: mark an attendance record and the dashboard percentage, the attendance alert, the linked goal and the AI's next answer all update from the same source.

Key invariants:

- `safePct(part, total)` returns `null` on zero/invalid denominators → UI renders "—", never NaN.
- Test trend claims are strictly data-backed (first vs latest percentage of each subject).
- Attendance projections solve `(present + n) / (total + n) = target` with infeasibility detection (target 100% when you've already missed classes).
- Weekly-summary and AI statements are generated only from stored rows.

### Data relationships

```
Subjects ─→ Schedule ─→ Dashboard "today's classes" ─→ Attendance quick-mark
   │                                              └→ Attendance % ─→ Low-attendance alerts ─→ Attendance goals
   ├→ Tests ─→ Percentages ─→ Analytics (avg/trend) ─→ Test-average goals
   ├→ Assignments ─→ Due buckets ─→ Dashboard + deadline/overdue reminders ─→ Completion goals
   ├→ Study sessions ─→ Study hours ─→ Weekly summary ─→ Study-hour goals
   └→ Calendar events ─→ Countdowns ─→ Dashboard "Upcoming" + exam reminders
                                    └→ (CSV/JSON import & export)
```

---

## Security notes

- The anon key is public by design; **RLS is the real boundary** — every table's policies are scoped to `auth.uid() = user_id`, enforced server-side.
- The edge function verifies the caller's JWT before touching data and injects no client-supplied filters.
- The LLM only ever sees the student's own snapshot and is instructed to refuse inventing records; it reports missing data honestly.

## Demo data

Demo rows carry `is_demo = true` and are shown nowhere as real achievements. Settings → **Demo data** loads a sample semester or clears all demo rows in one click. "Delete all academic data" (Danger Zone) wipes the account's records but keeps the login.
