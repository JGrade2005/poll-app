# Classroom Survey Web App — TODO

## Purpose

This roadmap breaks the implementation into small, testable phases ordered from foundational work to advanced features.

**Status legend:** `[x]` done and verified · `[ ]` not done yet. Items marked **(you)** need the project
owner's own accounts (Supabase, GitHub, Cloudflare) or physical devices. "Verified locally" means
checked with `npm run test:db` (real migration, Supabase roles, RLS) and the browser end-to-end run
described in [docs/TESTING.md](docs/TESTING.md).

---

# Phase 1 — Project Setup

- [x] Create a new React + TypeScript project with Vite.
- [x] Add Tailwind CSS.
- [x] Add React Router.
- [x] Add Supabase JavaScript client.
- [x] Add Recharts.
- [x] Add QR code generation package.
- [x] Create the initial project folder structure.
- [x] Add `.env.example` with Supabase environment variable names.
- [x] Configure ESLint and formatting.
- [x] Create a basic home page.
- [x] Verify the project builds successfully.

---

# Phase 2 — Supabase Project and Database

- [ ] Create a Supabase project. **(you)** See README, section 2.
- [x] Create the `surveys` table.
- [x] Create the `questions` table.
- [x] Create the `choices` table.
- [x] Create the `responses` table.
- [x] Create the `answers` table.
- [x] Add foreign-key constraints.
- [x] Add database indexes.
- [x] Add timestamps.
- [x] Add survey-status validation.
- [x] Create Row Level Security policies.
- [x] Verify students cannot read survey results. (verified locally; re-check in your project)
- [x] Verify anonymous students can read active surveys. (verified locally)
- [x] Verify anonymous students can submit responses. (verified locally, through the RPC)
- [x] Verify authenticated instructors have full access. (verified locally)

All of the above (except creating the project) is in
`supabase/migrations/20261105000000_initial_schema.sql`.

---

# Phase 3 — Instructor Authentication

- [x] Create the instructor login page.
- [x] Connect login to Supabase Auth.
- [x] Add logout.
- [x] Create an authentication context/provider.
- [x] Create a protected-route component.
- [x] Redirect unauthenticated users to login.
- [x] Show the logged-in instructor in the dashboard.

---

# Phase 4 — Instructor Dashboard

- [x] Create the dashboard layout.
- [x] Load surveys from Supabase.
- [x] Display survey title, status, and creation date.
- [x] Add status badges for Draft, Active, Closed, and Archived.
- [x] Add a New Survey button.
- [x] Add Edit action.
- [x] Add Duplicate action.
- [x] Add Delete action.
- [x] Add Archive action.
- [x] Add View Results action.
- [x] Add Activate action.
- [x] Add Close action.
- [x] Add search by survey title.
- [x] Add filtering by status.

---

# Phase 5 — Survey Editor

- [x] Create a survey editor page.
- [x] Add survey title field.
- [x] Add optional description field.
- [x] Add questions dynamically.
- [x] Support Multiple Choice questions.
- [x] Support True / False questions.
- [x] Add answer choices dynamically.
- [x] Reorder questions.
- [x] Reorder choices.
- [x] Delete questions.
- [x] Delete choices.
- [x] Validate required fields.
- [x] Save a survey as Draft.
- [x] Load an existing survey for editing.
- [x] Prevent editing an active survey unless it is first closed. (Surveys that already have responses are also locked; duplicate them instead. See docs/DESIGN_DECISIONS.md D5.)

---

# Phase 6 — Survey Activation

- [x] Add activation logic.
- [x] Ensure at most one survey is Active.
- [x] Automatically close the previously active survey.
- [x] Generate a public survey slug or identifier.
- [x] Generate the public survey URL.
- [x] Generate a QR code from the public URL.
- [x] Create a Present Survey page.
- [x] Display survey title and QR code.
- [x] Display a readable fallback URL.
- [x] Add a Close Survey button.
- [x] Add a Download QR Code button.

---

# Phase 7 — Student Survey Page

- [x] Create the public route `/s/:surveyId`. (Implemented as `/s/:slug` per UI.md; a survey UUID also works.)
- [x] Load the requested active survey.
- [x] Show an error if the survey does not exist.
- [x] Show a message if the survey is closed.
- [x] Render survey title and description.
- [x] Render Multiple Choice questions.
- [x] Render True / False questions.
- [x] Validate required answers.
- [x] Add Submit button.
- [x] Store response and answers in Supabase.
- [x] Show a submission confirmation page.
- [x] Make the entire experience mobile friendly.

---

# Phase 8 — Duplicate Submission Protection

- [x] Generate an anonymous browser token.
- [x] Store the token in local storage.
- [x] Save the token with each response.
- [x] Prevent the same token from submitting twice to the same survey.
- [x] Show a friendly message if a duplicate submission is attempted.
- [x] Add a database uniqueness constraint if appropriate.

---

# Phase 9 — Results Dashboard

- [x] Create a results page for each survey.
- [x] Show total response count.
- [x] Aggregate answers by question.
- [x] Show counts for each choice.
- [x] Show percentages for each choice.
- [x] Add bar charts using Recharts.
- [x] Clearly label unanswered questions.
- [x] Add Refresh Results button.
- [x] Add link back to the main dashboard.

---

# Phase 10 — Historical Results

- [x] Allow viewing results for Closed surveys.
- [x] Allow viewing results for Archived surveys.
- [x] Add filtering by date.
- [x] Add filtering by survey title.
- [x] Preserve all historical response data.

---

# Phase 11 — CSV Export

- [x] Add Export CSV button.
- [x] Export survey metadata. ("Export Summary CSV")
- [x] Export one row per response.
- [x] Include submission timestamp.
- [x] Include each question and answer.
- [x] Create safe CSV escaping. (RFC 4180 quoting + formula-injection guard, unit tested)
- [ ] Test export with spreadsheet applications. **(you)** Open both files in Excel or Google Sheets.

---

# Phase 12 — Survey Duplication

- [x] Duplicate survey title and description.
- [x] Duplicate questions.
- [x] Duplicate answer choices.
- [x] Create the copy in Draft state.
- [x] Add "Copy of ..." naming.
- [x] Redirect to the editor after duplication.

---

# Phase 13 — UI Polish

- [x] Add consistent page layouts.
- [x] Improve mobile responsiveness.
- [x] Add loading states.
- [x] Add empty states.
- [x] Add error messages.
- [x] Add confirmation dialogs for destructive actions.
- [x] Improve QR-code presentation for classroom projection.
- [x] Test accessibility and keyboard navigation. (Labels, focus indicators, focus management, Esc in dialogs, keyboard reordering checked; no full screen-reader audit.)
- [x] Improve color contrast.

---

# Phase 14 — Testing

- [x] Test instructor login.
- [x] Test survey creation.
- [x] Test survey editing.
- [x] Test activation.
- [x] Test closing surveys.
- [ ] Test QR-code links. **(you)** The link and route are verified; scan the projected QR with a real phone.
- [x] Test student submissions.
- [x] Test duplicate-submission prevention.
- [x] Test results calculations.
- [x] Test CSV export.
- [x] Test mobile layout. (emulated 375×812; also check on a real phone)
- [ ] Test with at least two browsers. **(you)** Tested in Chromium; try Firefox or Safari.
- [x] Test unauthorized access attempts.
- [x] Test database Row Level Security.

---

# Phase 15 — Deployment

- [x] Push the project to GitHub. (github.com/JGrade2005/poll-app)
- [x] Create the Cloudflare Pages site. (Created as a Cloudflare Worker named `poll-app`, Cloudflare's current default; see README section 3.)
- [ ] Connect Cloudflare Pages to the GitHub repository. **(you)** Cloudflare reports the Git connection as disconnected; reconnect it (README section 3).
- [ ] Configure production environment variables. **(you)** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] Deploy the application. **(you)**
- [x] Configure SPA routing. (`wrangler.jsonc`: `not_found_handling: "single-page-application"`; Pages does this by default.)
- [ ] Verify production login. **(you)**
- [ ] Verify QR codes point to the production URL. **(you)**
- [ ] Test student submissions in production. **(you)**
- [ ] Test instructor results in production. **(you)**

---

# Phase 16 — Post-MVP Enhancements

- [ ] Add live updating results with Supabase Realtime. (MVP uses 3–5 s polling while a survey is active.)
- [ ] Add question bank.
- [ ] Add survey import/export as JSON.
- [ ] Add Markdown import.
- [ ] Add short-answer questions.
- [ ] Add checkbox questions.
- [ ] Add rating-scale questions.
- [ ] Add numeric questions.
- [ ] Add AI-assisted question generation.
- [ ] Add LMS integration.
- [ ] Add multiple instructors.
- [ ] Add course and semester organization.
- [ ] Add analytics across multiple surveys.
