# Orbit — Google Sign-In & Supabase Setup Guide

This walks you through enabling **real Google authentication** for Orbit.
Time: ~10 minutes. Everything below is free tier.

---

## Part 1 — Create the Supabase project

1. Go to <https://supabase.com> → **Sign in** (GitHub or email works).
2. Click **New project**.
   - Name: `orbit` (anything works)
   - Database password: generate one and save it (you won't need it daily)
   - Region: pick the one closest to you
3. Wait ~2 minutes for provisioning.

## Part 2 — Run the database schema

1. In the Supabase dashboard open **SQL Editor** → **New query**.
2. Open `scholar-os/supabase/schema.sql`, copy **the entire file**, paste it, and click **Run**.
3. You should see `Success. No rows returned`. This creates all tables
   (`profiles`, `subjects`, `class_schedule`, `academic_events`, `tests`,
   `assignments`, `attendance`, `study_sessions`, `goals`, `resources`, …)
   with **Row Level Security** on every table — each user can only ever
   read/write rows whose `user_id` matches their own session.

## Part 3 — Get the project credentials

1. Go to **Project Settings** (gear icon) → **API**.
2. Copy:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public key** — a long `eyJ...` string (safe to be public)

## Part 4 — Configure Google OAuth

### 4a. Google Cloud Console

1. Go to <https://console.cloud.google.com> → create a project (or reuse one).
2. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - App name: `Orbit`, support email: yours
   - Scopes: add `email`, `profile`, `openid`
   - Test users: add your own Gmail while in "Testing" mode
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URIs** — add exactly:
     ```
     https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
     ```
     (Replace `YOUR-PROJECT-REF` with the ref from your Supabase URL, e.g.
     `abcdefgh` in `https://abcdefgh.supabase.co`.)
   - For local dev also add: `http://localhost:5173/` is *not* needed —
     Supabase's callback handles it.
4. Copy the **Client ID** and **Client secret**.

### 4b. Enable the provider in Supabase

1. Supabase dashboard → **Authentication → Sign In / Up**.
2. Expand **Google**, toggle **Enable**, paste the Client ID + Secret, **Save**.
3. While there, set **URL Configuration**:
   - **Site URL**: `https://orbit-scholar-os.vercel.app` (or `http://localhost:5173` for dev)
   - **Redirect URLs** — add:
     - `https://orbit-scholar-os.vercel.app/**`
     - `http://localhost:5173/**`

## Part 5 — Give the credentials to the app

Pick whichever you prefer:

### Option A — I do it for you
Paste the **Project URL** and **anon key** into the chat. I'll set the
Vercel environment variables and redeploy.

### Option B — Do it yourself (Vercel dashboard)
1. <https://vercel.com> → your `orbit-scholar-os` project → **Settings → Environment Variables**.
2. Add for **Production, Preview, Development**:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
3. **Deployments → ⋯ → Redeploy** (env vars only apply to new builds).

### Option C — Do it yourself (CLI)
```bash
cd scholar-os
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel deploy --prod
```

### Local development
Create `scholar-os/.env` (already gitignored):
```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
Then `npm run dev` — sign-in, onboarding and all modules work locally.

---

## How the flow works afterwards

```
/ (public landing — hero untouched)
   → "Sign in" or "Get started"
      → /signin ("Welcome to Orbit", Continue with Google)
         → Google OAuth → /auth/callback
            → first login → /onboarding (name, college, subjects,
                             one-click BST timetable + 2026–27 calendar)
            → /app (dashboard, schedule, calendar, tests, assignments,
                    attendance, study, goals, analytics, resources,
                    assistant, settings)
   Sign out → back to the landing page
```

Every academic record is stored with your `user_id` and guarded by
Supabase RLS — user A can never read user B's data, even by tampering
with requests.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `redirect_uri_mismatch` on Google | The redirect URI in Google Console must be exactly `https://PROJECT-REF.supabase.co/auth/v1/callback` |
| `Error: 403: access_denied` | Your Google OAuth consent screen is in Testing — add the account as a Test user |
| Sign-in works but data fails to load | Re-run the whole `schema.sql`; check for policy errors |
| "Connect Orbit to Supabase" screen | Env vars missing on that deployment — add them and redeploy |
| Email sign-up says "confirm your email" | Disable email confirmation in Supabase → Authentication → Providers → Email, or confirm via the emailed link |
