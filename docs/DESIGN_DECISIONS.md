# Design decisions

The assignment asks to document decisions the specifications leave open. Each entry gives the
decision, the reason, and where it lives in the code.

## Data and database

| # | Decision | Why | Where |
|---|---|---|---|
| D1 | **Students submit only through the `submit_survey_response` RPC.** `anon` gets no INSERT privilege on `responses` / `answers`. | DATABASE.md §9 prefers the RPC "for production"; direct anonymous inserts could create answers for closed surveys or wrong questions. The RPC validates everything and inserts atomically. | migration §8 |
| D2 | **Every question is required** in Version 1. | Keeps percentages comparable across questions and matches `MISSING_REQUIRED_ANSWER` in API.md. | RPC + student page |
| D3 | **Percentages are relative to the number of responses that answered the question**, rounded to 1 decimal. | Matches the API.md example (45/52 = 86.5%). Unanswered counts are shown separately. | `get_survey_results` |
| D4 | **Public slug = 8 random characters** from `abcdefghjkmnpqrstuvwxyz23456789` (no look-alikes like 0/o, 1/l/i), about 40 bits. Generated on first activation and kept on reopen. A survey UUID also works as `/s/<uuid>`. | DATABASE.md §6: unique, non-sequential, hard to guess, readable from a projector. | `generate_public_slug`, `activate_survey` |
| D5 | **Editing is allowed only while a survey is not active and has no responses.** Saving replaces the question set atomically (`save_survey`). Surveys with responses must be duplicated. | Changing questions after responses exist would silently corrupt results (answers cascade). TODO Phase 5 asks to block editing active surveys. | `save_survey`, editor page |
| D6 | **`activate_survey` refuses surveys with no questions**, and serializes concurrent activations with an advisory lock. The partial unique index still guarantees one active survey. | An empty active survey is useless to students; the lock prevents a race between two clicks. | migration §6 |
| D7 | **Closing takes effect immediately.** `submit_survey_response` takes a `FOR SHARE` lock on the survey row, so `close_survey` waits for in-flight submissions, and any submission after the close sees `closed`. | API.md §8: "Student submissions must fail immediately after closing." | migration §8 |
| D8 | **Closed and archived surveys tell students "no longer accepting responses"**, while drafts and unknown slugs say "Survey not found". | UI.md §8 distinguishes the two messages; drafts must stay invisible to students. | `get_public_survey` |
| D9 | **True/False questions always store the choices "True", "False"** (positions 1, 2), regardless of client input. | Consistent results and CSV; no way to create a broken T/F question. | `save_survey` |
| D10 | **Archive keeps all data**; Restore returns an archived survey to `closed` (or `draft` if it was never activated). Delete needs confirmation, and **typing DELETE** when responses exist. | DATABASE.md §13 / UI.md §11: strongly encourage Archive over Delete. | dashboard |

## Security

| # | Decision | Why |
|---|---|---|
| S1 | Single-instructor model: every `authenticated` user has full access (DATABASE.md §10). **Public sign-up is disabled** in Supabase Auth, so only accounts created by the owner exist. | Without this, anyone could sign up with the public publishable key and become an "instructor". |
| S2 | The migration explicitly **revokes** Supabase's default `anon` grants and re-grants only `SELECT` on survey tables, in addition to RLS. | Defense in depth: even a mistaken policy cannot expose responses to students. |
| S3 | `SECURITY DEFINER` functions set `search_path = ''` and fully qualify every name. Instructor-only functions are `SECURITY INVOKER` and not executable by `anon`. | Standard hardening against search-path hijacking; RLS stays in force for instructor calls. |
| S4 | Students never see raw database errors; RPC error codes are mapped to friendly text (`src/lib/errors.ts`). | API.md §13. |
| S5 | CSV cells beginning with `= + - @` are prefixed with `'` (except plain numbers). | Prevents spreadsheet formula injection from survey text. |

## Frontend

| # | Decision | Why |
|---|---|---|
| F1 | Route `/s/:slug` (UI.md), not `/s/:surveyId` (TODO.md). UUIDs still resolve. | UI.md is the more specific document; both forms work. |
| F2 | **Polling instead of Realtime** for live counts: Present page every 3 s, Results every 5 s, only while the survey is active and the tab is visible. | Realtime is listed as post-MVP; polling one cheap count query is enough for one instructor and keeps the free tier simple. |
| F3 | **Route-level code splitting.** Students download only the survey page and the Supabase client; charts (Recharts) and the QR generator load only on instructor pages. | Average page load under 2 s on phones (spec §5). |
| F4 | Duplicate protection = random browser token (`localStorage`) + database unique index + a local "submitted" flag for an instant message on reload. Falls back to `crypto.getRandomValues` where `crypto.randomUUID` is unavailable (plain-http LAN testing). | "Reasonable protection against accidental duplicate submissions" without student accounts. A determined student can clear storage, which is acceptable for anonymous classroom polls. |
| F5 | Two CSV exports: **responses** (one row per response, columns per question, the layout recommended in API.md) and **summary** (survey metadata + per-choice counts and percentages). | Covers both "export all results" and TODO "export survey metadata" without breaking the rectangular response file. |
| F6 | QR codes use the URL the instructor opened the app from, unless `VITE_PUBLIC_SITE_URL` is set. | Works automatically in production while allowing an override. |
| F7 | Editor reordering uses ↑/↓ buttons instead of drag and drop. | Keyboard accessible and reliable on touch screens (UI.md §13). |
