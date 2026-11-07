# Classroom Survey Web App

Instructors create quick multiple-choice and true/false surveys, activate one in class, and project a
QR code. Students scan it, answer on their phones without logging in, and the instructor sees live
counts, percentages and charts, and can export everything as CSV.

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, React Router, Recharts, `qrcode`
- **Backend / database:** Supabase (PostgreSQL, Auth, auto-generated REST API, Row Level Security)
- **Hosting:** Cloudflare Workers static assets (Pages also works); the database stays on Supabase

| | |
|---|---|
| Live app | `https://poll-app.<your-subdomain>.workers.dev` ← fill in after deploying |
| Specifications | [Classroom_Survey_Web_App_Specification.md](Classroom_Survey_Web_App_Specification.md), [DATABASE.md](DATABASE.md), [API.md](API.md), [UI.md](UI.md), [TODO.md](TODO.md) |
| Design decisions | [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) |
| Test plan & results | [docs/TESTING.md](docs/TESTING.md) |
| Database schema | [supabase/migrations/20261105000000_initial_schema.sql](supabase/migrations/20261105000000_initial_schema.sql) |

---

## Features

**Instructor** (`/login`, `/dashboard`)
- Email/password login (Supabase Auth); every instructor page is protected
- Dashboard with status badges, response counts, search by title, status filter, created-date range filter
- Create / edit drafts: title, description, multiple-choice and true/false questions, add / delete /
  reorder questions and choices, inline validation, unsaved-changes warning
- Activate (only one survey can be active, so the previous one closes automatically), close, reopen,
  duplicate ("Copy of …"), archive / restore, delete (with a stronger, type-to-confirm warning when
  responses exist)
- Present page for the projector: large QR code, readable URL, live response count, full-screen,
  copy link, download QR as PNG, close survey
- Results: total responses, per-question counts and percentages, Recharts bar charts with numeric labels
  plus a data table, auto-refresh while active, "Export CSV" (one row per response) and
  "Export Summary CSV" (survey metadata + per-choice totals)

**Student** (`/s/:slug`)
- No account, no menu: title, description, questions, large touch targets, one-column layout
- Validation for unanswered questions, "Submitting..." state, "Thank you!" confirmation
- Friendly messages for closed survey, unknown link, already submitted, and network errors
- Duplicate protection: random per-browser token in `localStorage` plus a unique index in the database

## How it works

```
 Browser (React SPA served by Cloudflare)
   │  supabase-js over HTTPS, publishable key + instructor JWT
   ▼
 Supabase
   ├─ Auth (GoTrue)  → instructor login, issues JWT with role "authenticated"
   ├─ REST (PostgREST) → tables + RPC functions
   └─ PostgreSQL       → surveys ─< questions ─< choices
                          surveys ─< responses ─< answers >─ questions / choices
```

- There is no custom server. The browser talks to Supabase directly with the **public**
  publishable key, which maps to the Postgres role `anon`. Security comes from PostgreSQL
  **Row Level Security** and table/function grants, not from hiding that key.
- `anon` (students) can read only the **active** survey with its questions and choices, and can only
  submit through `submit_survey_response()`. That function validates everything and inserts the
  response and its answers in one transaction. Students cannot read `responses` or `answers` at all.
- `authenticated` (the instructor) has full access. Public sign-ups are disabled, so the only
  authenticated users are accounts you create.
- Multi-step operations are database functions (RPCs) so they are atomic: `save_survey`,
  `activate_survey`, `close_survey`, `duplicate_survey`, `get_public_survey`, `get_survey_results`.

## Project structure

```
src/
  pages/         Landing, Login, Dashboard, SurveyEditor, Present, Results, StudentSurvey, NotFound
  components/    auth (provider, protected route), layout, ui (buttons, dialogs, badges), QrCode, ResultsChart
  lib/           api.ts (all Supabase calls), supabase.ts, csv.ts, errors.ts, editorModel.ts,
                 anonymousToken.ts, types.ts, format.ts, hooks.ts  (+ *.test.ts unit tests)
supabase/
  migrations/    the complete schema, RLS policies and RPC functions (one SQL file)
  seed.sql       optional demo survey
  config.toml    settings for the Supabase CLI local stack (optional)
scripts/
  test-db.mjs    83 database tests (schema, RLS, RPCs) on an embedded PostgreSQL (PGlite)
docs/            design decisions, testing, development summary, AI interaction history, screenshots
```

---

## 1. Run it locally

Requirements: Node.js 20.19+ (22 recommended), npm, and a Supabase project (step 2).

```bash
npm install
```

```bash
cp .env.example .env.local
```

Edit `.env.local` and set the two values. In your Supabase project, click **Connect** at the top
of the dashboard (or open **Project Settings → API Keys**):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

You need the **Project URL** (not the `postgresql://` database connection string) and the
**publishable key**. The database password is never used by the app. The legacy `anon` key also
works (`VITE_SUPABASE_ANON_KEY` is still read), but Supabase is retiring legacy keys at the end of
2026, so use the publishable key.

```bash
npm run dev
```

Open http://localhost:5173. Without the env vars the app shows a "Supabase is not configured" page.

> To try the student page on your phone during development, run `npm run dev -- --host` and open
> the Network URL. The QR code uses the address you opened the app with, so open the instructor pages
> through that same Network URL.

## 2. Set up Supabase (free tier)

1. Create a project at https://supabase.com/dashboard and pick a region close to you. Save the
   database password somewhere private. The app never needs it.
2. **Create the schema:** open **SQL Editor → New query**, paste the entire contents of
   [`supabase/migrations/20261105000000_initial_schema.sql`](supabase/migrations/20261105000000_initial_schema.sql),
   and click **Run**. The file is re-runnable. Optionally run [`supabase/seed.sql`](supabase/seed.sql)
   for a demo survey.
   *(CLI alternative: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)*
3. **Disable public sign-ups (required for security):** **Authentication → Sign In / Providers**, then
   turn off **Allow new users to sign up**. Leave the **Email** provider enabled.
4. **Create the instructor account:** **Authentication → Users → Add user → Create new user**, enter
   an email and a strong password, and tick **Auto Confirm User**.
5. **Check the tables:** **Table Editor** should list `surveys`, `questions`, `choices`, `responses`,
   `answers`, each marked RLS enabled. **Database → Functions** lists the RPC functions.
6. Click **Connect** (or **Project Settings → API Keys**) and copy the **Project URL** and the
   **publishable key** (`sb_publishable_…`) into `.env.local`. If no publishable key is listed, create
   one on the API Keys page. **Never** put a secret key (`sb_secret_…`), the legacy `service_role`
   key, or the database password in the app, the repository, or Cloudflare.

## 3. Deploy to Cloudflare

The app is a static site, so Cloudflare only needs to build it and serve `dist/`. The database stays
on Supabase. Cloudflare's **Workers & Pages → Create** flow now creates a **Worker** by default; this
repo is set up for that, with a Worker named `poll-app`.

1. Push this repository to GitHub (`.env.local` is git-ignored; only `.env.example` is committed).
2. Cloudflare Dashboard → **Workers & Pages → Create → Import a repository**, then pick the repo.
3. Build settings (**Settings → Build** on the Worker):
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy` (the default)
   - Root directory: leave empty
4. **The Worker's name must match `"name"` in [`wrangler.jsonc`](wrangler.jsonc)** (currently
   `poll-app`). If you name the Worker something else, change that line to match.
5. **Variables for the build.** Vite bakes these into the JavaScript at **build** time, so add them as
   *build* variables (Settings → Build → **Variables and secrets**), not only as runtime variables:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = your publishable key (`sb_publishable_…`)
   - optional `VITE_PUBLIC_SITE_URL` = your public URL (QR base URL; defaults to the address the app
     is opened from)

   After adding or changing them, trigger a new build (push a commit, or **Deployments → Retry build**).
   If the live site shows "Supabase is not configured", the build did not see these variables.
6. Routing needs no extra setup: `wrangler.jsonc` sets `not_found_handling: "single-page-application"`,
   so `/s/abc123` and `/dashboard` work when opened directly or refreshed.
7. In Supabase **Authentication → URL Configuration**, set **Site URL** to your `*.workers.dev`
   (or custom) URL.
8. Production checks: log in, activate a survey, scan the QR with a phone on mobile data (not your
   Wi-Fi), submit, and confirm the response count and results update.

**Using Cloudflare Pages instead?** Create → **Pages** → Connect to Git, build command
`npm run build`, output directory `dist`, and the same two variables under the Pages project's
environment variables. Pages ignores `wrangler.jsonc` and serves `index.html` for unknown paths by
default.

**"This project is disconnected from your Git account"** means Cloudflare lost access to the GitHub
repo, so pushes stop deploying. Fix it on Cloudflare: the Worker's **Settings → Build → Git
repository → Manage**. Or on GitHub: https://github.com/settings/installations → **Cloudflare
Workers and Pages** → **Configure**, then make sure the repo is allowed under *Repository access*. If
that doesn't help, uninstall the app there and reconnect the repository from Cloudflare (**Connect**
under Git repository), which reinstalls it.

### Giving the grader instructor access (without committing credentials)

Create a separate instructor account for the grader (step 2.4, e.g. `grader@<anything>`), and submit
its email and password **privately through HuskyCT** together with the deployed URL. Nothing secret
is stored in this repository. To revoke access afterwards, delete that user in
**Authentication → Users**.

---

## Testing

```bash
npm run test:all
```

That command runs `npm run lint` (ESLint), `npm run typecheck` (TypeScript), `npm test` (33 Vitest unit
tests: CSV escaping, error mapping, editor validation), and `npm run test:db` (83 database tests).

`npm run test:db` executes the real migration in PGlite (PostgreSQL 17 in WebAssembly) with
Supabase's `anon` / `authenticated` roles and default grants recreated. It verifies the foreign keys
and cascades, the one-active-survey rule, slug generation, every RPC and error code, the results math,
and Row Level Security: students can't see drafts, can't read responses, and can't modify anything.
No Docker or Supabase account is needed.

The full manual end-to-end checklist and its results are in [docs/TESTING.md](docs/TESTING.md).

## Security notes

- Only public values (`VITE_*`) are used by the frontend; `.env*` files are git-ignored.
- RLS is enabled on all five tables; `anon` has `SELECT` only on survey content, filtered to the active
  survey, and no privileges at all on `responses` / `answers`.
- `SECURITY DEFINER` functions (`submit_survey_response`, `get_public_survey`) pin
  `search_path = ''`, validate all input, and return only what students need.
- Instructor-only functions are not executable by `anon`.
- Because policies trust every authenticated user (single-instructor design from DATABASE.md),
  **sign-ups must stay disabled** (step 2.3).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Supabase is not configured" | `.env.local` missing, or Cloudflare env vars not set before the build. Redeploy. |
| Login says "Invalid email or password" | User not created / not confirmed (tick *Auto Confirm User*), or a typo. |
| Dashboard: "Authentication required" | Session expired. Log in again. |
| Student sees "Survey not found" | Survey is still a Draft (activate it) or the link is mistyped. |
| QR opens `localhost` on the phone | You presented from `localhost`. Use the deployed URL or set `VITE_PUBLIC_SITE_URL`. |
| `permission denied for function …` | The migration wasn't run completely. Re-run the whole SQL file. |
