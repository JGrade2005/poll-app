# Development Summary: Classroom Survey Web App

*CSE 4095, Agentic Programming. Draft prepared with the AI agent: review it, edit it into your own
words, and fill in the items marked ✏️ before submitting.*

## 1. Using the specification documents to guide the AI agent

I used **Claude Code** (Anthropic's coding agent, in the Claude desktop app) as my AI coding agent. I
placed the five provided specifications (`Classroom_Survey_Web_App_Specification.md`, `TODO.md`,
`DATABASE.md`, `API.md`, `UI.md`) and `assignment.txt` in the project folder and asked the agent to
read all of them and complete the assignment. The agent treated the documents as the source of
truth:

- **DATABASE.md** → the SQL migration: tables, keys, indexes, the one-active-survey partial index, the
  duplicate-submission unique index, and the RLS policies, copied almost verbatim.
- **API.md** → the data-access layer (`src/lib/api.ts`) and the database functions (`activate_survey`,
  `close_survey`, `submit_survey_response` with the exact error codes, results in the documented JSON
  shape).
- **UI.md** → routes, page layouts, the exact user-facing messages ("This survey is no longer accepting
  responses.", "Thank you! …"), confirmation dialogs, empty states, accessibility rules.
- **TODO.md** → the phase order, and the checklist I updated at the end.

Where the specs were silent or disagreed (e.g. `/s/:slug` in UI.md vs `/s/:surveyId` in TODO.md,
whether questions are required, how percentages are computed, when editing must be blocked), the
decisions are recorded in `docs/DESIGN_DECISIONS.md`.

## 2. What the AI agent generated

The agent generated essentially all of the code and documentation:

- Project scaffolding (Vite, TypeScript, Tailwind CSS v4, ESLint, Prettier, Vitest config).
- `supabase/migrations/…_initial_schema.sql`: schema, RLS, grants, and seven RPC functions.
- All React pages and components, the auth provider and protected routes, CSV export, QR code
  generation, Recharts charts.
- Tests: 33 unit tests and an 83-check database test suite.
- README, design decisions, testing notes, and this draft.

My role: ✏️ *describe what you did yourself, e.g. reviewing the plan, creating the Supabase project
and running the migration, creating the instructor accounts, configuring Cloudflare, testing on your
phone, asking for changes, checking the agent's claims.*

## 3. Database configuration

The database is PostgreSQL on Supabase. I created a project and ran the migration file in the
SQL Editor. ✏️ *confirm / adjust.* It creates five tables:

- `surveys` (status `draft | active | closed | archived`, unique `public_slug`)
- `questions` → `surveys`
- `choices` → `questions`
- `responses` → `surveys`
- `answers` → `responses`, `questions`, `choices`

Primary keys are UUIDs. Foreign keys cascade on delete, except `answers.choice_id`, which is set to null.
A **partial unique index** guarantees only one active survey; another unique index on
`(survey_id, anonymous_token)` blocks duplicate submissions from the same browser.

**Row Level Security** is enabled on every table. Anonymous students can only `SELECT` the active
survey and its questions/choices; they have no access to `responses`/`answers` and can submit only
through `submit_survey_response`, which validates the survey, questions and choices and inserts
everything in one transaction. The authenticated instructor has full access. I disabled public
sign-ups so the only authenticated users are accounts I created.

## 4. How the frontend communicates with the database

There is no custom backend server. The React app uses the **supabase-js** client with the project URL
and the public publishable key (from `VITE_*` environment variables). Instructor requests carry the logged-in
user's JWT, so PostgreSQL evaluates them as the `authenticated` role; student requests are evaluated as
`anon`. Simple reads and updates use the auto-generated REST API (e.g.
`from('surveys').select('*, responses(count)')`). Multi-step operations call database functions over
RPC (`save_survey`, `activate_survey`, `submit_survey_response`, `get_survey_results`, …) so they are
atomic. Errors raised by those functions (e.g. `DUPLICATE_RESPONSE`) are mapped to friendly messages
in `src/lib/errors.ts`.

## 5. Problems encountered and how they were resolved

1. **Wrong field received typed text in the survey editor.** During browser testing, text typed right
   after clicking "+ Add Choice" ended up in the previous field. The cause was focusing the new input
   with `requestAnimationFrame`, which browsers pause in background tabs. It was fixed by moving focus
   through React state and an effect that runs after the new input renders. Re-tested in the browser.
2. **Local Supabase could not run.** The plan was to test against a local Supabase stack in Docker, but
   Docker Desktop crashed on startup on my machine. The agent instead tested the real SQL in an
   embedded PostgreSQL (PGlite) with Supabase's roles recreated, and used a small local stand-in for
   the Supabase API to click through the whole app in a browser.
3. **React lint rule violations** (`setState` inside effects) were fixed by restructuring data loading
   into cancellable promise chains, which also avoids stale data after navigation.
4. **Outdated Supabase key instructions.** The first version of the setup docs told me to copy the
   "anon" key from a "Project Settings → API" page. When I asked where to find the values, the agent
   checked Supabase's current documentation. It found that legacy `anon` keys are being retired at the
   end of 2026 in favour of publishable keys (`sb_publishable_…`), and that the page had moved to the
   **Connect** dialog / **API Keys**. The app now reads `VITE_SUPABASE_PUBLISHABLE_KEY` (and still
   accepts the old name), and the README was corrected.
5. ✏️ *Add anything you hit yourself during Supabase setup or deployment (e.g. forgot to set the
   Cloudflare env vars before the first build → "Supabase is not configured"; redeploy fixed it).*

## 6. Deployment

✏️ *Fill in after deploying.* The code is on GitHub at `https://github.com/JGrade2005/poll-app`. A
Cloudflare Worker named `poll-app` is connected to the repository (Workers Builds) with build command
`npm run build` and deploy command `npx wrangler deploy`; `wrangler.jsonc` serves the built `dist/`
folder as static assets. The build
variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set. Single-page-application
mode serves `index.html` for every route, so deep links like `/s/<slug>` work. The app is live at
`<https://poll-app.….workers.dev>`; the
database stays on Supabase. I verified it from a phone on mobile data by scanning the projected QR code.

## 7. What I learned about full-stack development

✏️ *Write this in your own words.* Points you may want to touch on:

- The browser can talk to the database directly when security lives **in the database** (RLS and
  grants) instead of in a server, and why the publishable key can be public while a secret key can't.
- How primary/foreign keys and cascades keep related data consistent, and why multi-step writes
  belong in a transaction.
- How an AI agent speeds up implementation, and why its output still has to be verified: the
  agent's own browser testing found a real bug that compiled and passed lint.
