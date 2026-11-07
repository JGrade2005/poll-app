# AI Development History

**Agent:** Claude Code (Anthropic) in the Claude desktop app, Code tab
**Session date:** 2026-11-05
**Project folder:** `C:\pollApp`

This is a Markdown summary of how the agent was guided through the implementation. The complete
transcript can also be exported from the Claude desktop app if the full conversation is required.
✏️ *Append any later sessions (Supabase setup, deployment, fixes) below.*

---

## Session 1: Build, test and document from the specifications

### Prompt

> Using the files given in the project folder, read all specifications, and also the
> assignment.txt, and can you complete this assignment?

### 1. Reading the requirements

- The agent read `assignment.txt` and all five specification files before writing code.
- It noted that the folder contained only documents (no code), and that `TODO.md` already had boxes
  ticked despite no implementation existing, so it planned to re-verify and update that list honestly.
- It identified which parts it could do itself (code, schema, tests, docs) and which need the
  student's accounts (Supabase project, GitHub, Cloudflare, screenshots, credentials for the grader).

### 2. Project setup

- Created a Vite + React 19 + TypeScript project by hand (Tailwind CSS v4, React Router 7, supabase-js,
  Recharts, qrcode), with ESLint, Prettier and Vitest.
- Chose TypeScript 6.0 because the current `typescript-eslint` does not yet support TypeScript 7.
- Added `.env.example`, a `.gitignore` that excludes every `.env*` file except the example, and SPA
  routing notes for Cloudflare.

### 3. Database

- Wrote `supabase/migrations/20261105000000_initial_schema.sql` from DATABASE.md and API.md: tables,
  foreign keys, indexes, the one-active-survey index, the duplicate-submission index, the `updated_at`
  trigger, RLS policies, explicit grants, and the RPCs `activate_survey`, `close_survey`,
  `get_public_survey`, `submit_survey_response`, `get_survey_results`, `save_survey`,
  `duplicate_survey`.
- Self-review before testing found and fixed three issues: a UUID cast that could throw for normal
  slugs (Postgres doesn't guarantee `OR` short-circuiting), a missing execute grant on the slug
  generator, and a race between two simultaneous activations (fixed with an advisory lock).
- Wrote `scripts/test-db.mjs`: it runs the real migration in PGlite (PostgreSQL 17 in WebAssembly),
  recreates Supabase's `anon` / `authenticated` roles and default grants, and checks RLS and every
  RPC.
- **First run:** 44 passed, then a failure. Investigation showed a test bug (stale question ids after
  editing a draft, because `save_survey` replaces questions), not a schema bug. **Second run:** 82/83;
  the expected survey count was wrong (a rejected save was correctly rolled back). **Final: 83/83.**

### 4. Frontend

- Implemented the data layer (`src/lib/api.ts`), error mapping, the anonymous token, CSV export, the
  editor model and validation, then the auth provider and protected routes, then all pages: Landing,
  Login, Dashboard, Survey Editor, Present, Results, Student Survey, Not Found.
- Lint flagged `setState` inside effects on four pages; the agent rewrote initial loads as cancellable
  promise chains. Typecheck, lint and 33 unit tests passed; the production build succeeded with
  route-level code splitting.

### 5. End-to-end testing

- Tried to run a local Supabase stack with Docker, but Docker Desktop crashed at startup on this
  machine. The agent did not try to repair it.
- Tried to download the PostgREST server binary; this was **blocked by the permission policy**, and
  the agent did not work around it.
- Instead it wrote a small throwaway stand-in for the Supabase HTTP API in its scratchpad (not part
  of the project). It runs the real migration in PGlite and executes each request as `anon` or
  `authenticated`, so Postgres enforces RLS. The agent then drove the app in the built-in browser,
  using a throwaway local test account.
- Ran 27 scenarios (see `docs/TESTING.md`), including a phone-size student flow and a separate origin
  to make sure the student had no instructor session.
- **Bugs found and fixed:** editor focus via `requestAnimationFrame` sent typing to the wrong field;
  polling didn't refresh immediately when a tab became visible; the Present page overflowed a
  768px-high projector; CSV file names used the UTC date.
- Re-ran everything after the fixes: lint, typecheck, 33 unit tests, 83 database tests, and the build all pass.

### 6. Documentation and hand-off

- Wrote `README.md` (local setup, Supabase setup including **disabling public sign-ups**, Cloudflare
  Pages deployment, private grader access through HuskyCT), `docs/DESIGN_DECISIONS.md`,
  `docs/TESTING.md`, `docs/screenshots/README.md`, and drafts of the development summary and this
  history.
- Updated `TODO.md` so ticked boxes reflect what was actually implemented and verified, with
  account-dependent items left open.
- Removed temporary test files (`.env.e2e.local`) and stopped the test servers.

### 7. Follow-up questions in the same session

- **"Give me the git commit commands … as project phases."** The agent mapped every file to a TODO
  phase and dry-ran the 16 commits on a throwaway copy (70 files, nothing left over) before handing
  over the commands.
- **"Make one big commit message with all the commits listed."** The agent wrote a single multi-line
  message listing every phase to `.git/COMMIT_MSG_PHASES.txt`, for use with `git commit -F`, so it
  works in both PowerShell and Git Bash. It dry-ran this too and re-ran all checks.
- **"Where is .env.local?"** It doesn't exist until you create it (only `.env.example` is committed).
  The agent created it with blank values and confirmed git ignores it.
- **"Where do I get the database URL and the other thing?"** Before answering, the agent read
  Supabase's current API-keys documentation and found its earlier instructions were outdated. Legacy
  `anon` keys are being retired at the end of 2026 in favour of **publishable keys**
  (`sb_publishable_…`), and keys are now found under **Connect** or **Project Settings → API Keys**.
  It renamed the setting to `VITE_SUPABASE_PUBLISHABLE_KEY` (still accepting the old name), and
  updated `.env.example`, `.env.local`, the README and the docs.

- **Cloudflare warnings** (pasted from the dashboard): "This project is disconnected from your Git
  account" and "Update wrangler.jsonc … `"name": "poll-app"`". The agent read Cloudflare's Workers
  Builds docs. The project had been created as a **Worker** (Cloudflare's new default), and Workers
  Builds requires the `name` in `wrangler.jsonc` to match the dashboard name. The agent renamed it
  from `classroom-survey` to `poll-app`, and pinned `packageManager` to the local npm version so
  `npm ci` on Cloudflare doesn't reject the lockfile. It rewrote README section 3 for Workers (build
  variables must be set for the *build*) and documented how to reconnect the GitHub app.

### Steps left for the student

1. Create the Supabase project, run the migration, disable sign-ups, create instructor + grader users.
2. Create the GitHub repository and push.
3. Reconnect the Cloudflare Worker to GitHub, set the two build variables, deploy.
4. Test in production from a phone; take the database screenshots.
5. Personalize `docs/DEVELOPMENT_SUMMARY.md`; submit the URLs and grader credentials via HuskyCT.
