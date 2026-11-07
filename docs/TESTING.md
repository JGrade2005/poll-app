# Testing

## Automated tests

```bash
npm run test:all     # lint + typecheck + unit tests + database tests
```

| Suite | Command | What it covers | Result |
|---|---|---|---|
| Lint | `npm run lint` | ESLint (TypeScript, React Hooks rules) | 0 problems |
| Types | `npm run typecheck` | `tsc -b`, strict mode | 0 errors |
| Unit | `npm test` | 33 Vitest tests: CSV escaping (RFC 4180, formula injection, ordering), error-code mapping (never leaks raw DB text), editor validation, reordering, payload building | 33 passed |
| Database | `npm run test:db` | 83 checks running the real migration on PostgreSQL 17 (PGlite) with Supabase's `anon` / `authenticated` roles and default grants recreated | 83 passed |
| Build | `npm run build` | Production bundle with route-level code splitting | OK |

### Database checks (`scripts/test-db.mjs`)

- **Schema:** five tables with RLS enabled; foreign keys and `ON DELETE` rules exactly as in
  DATABASE.md; status check constraint; migration re-runnable.
- **Instructor:** `save_survey` creates and edits drafts atomically (a failed save leaves nothing
  behind); positions are stored in order; True/False always gets True/False; validation codes;
  the `updated_at` trigger fires.
- **Activation:** an 8-character slug; activating another survey closes the previous one; the database
  rejects a second active survey even without the RPC; reopening keeps the slug; a survey with no
  questions can't be activated.
- **Students (anon):** cannot see drafts; see only the active survey and its questions/choices;
  `get_public_survey` returns ordered questions with no response data and reports `closed` /
  `not_found`; cannot insert, update or delete anything; **cannot read `responses` or `answers`**;
  cannot call instructor RPCs.
- **Submissions:** valid submissions are stored; same token → `DUPLICATE_RESPONSE`; missing answer,
  null choice, choice from another question, question from another survey, malformed id, a question
  answered twice, a non-array payload, and closed or draft surveys are all rejected, and rejected
  submissions store nothing.
- **Results:** totals, per-choice counts and percentages (75/25 split verified); a survey with no
  responses gives 0%.
- **Lifecycle:** submissions fail immediately after closing; closed surveys with responses can't be
  edited; results survive closing and archiving; duplicate copies questions and choices but not
  responses; delete cascades to questions, choices, responses and answers.

## Manual end-to-end test (browser)

Run on 2026-11-05 against a local stand-in for Supabase. The real migration and seed ran in
PostgreSQL (PGlite) and each request executed under the `anon` or `authenticated` role, so RLS was
enforced by Postgres. The app ran in Chromium at desktop (1024×768) and mobile (375×812) sizes. The
student was tested on a separate origin, with no instructor session.

| # | Scenario | Result |
|---|---|---|
| 1 | Landing page renders; no console errors | ✅ |
| 2 | `/dashboard` while logged out redirects to `/login` | ✅ |
| 3 | Wrong password shows "Invalid email or password." | ✅ |
| 4 | Correct login redirects back to the dashboard; seed survey listed with status badge, date, response count | ✅ |
| 5 | Save an empty new survey: errors appear beside title, question and each choice; focus moves to the first error | ✅ |
| 6 | Build a survey: add a choice, reorder choices, add a question, switch to True/False, move the question up; content preserved | ✅ (after fix, see Bug 1) |
| 7 | Leaving with unsaved changes shows "Leave without saving?"; Cancel stays on the page | ✅ |
| 8 | Save Draft: URL becomes `/surveys/<id>/edit`, shows "Saved at …" | ✅ |
| 9 | Activate from the editor opens the Present page: large QR, `…/s/<slug>`, "Responses: 0" | ✅ |
| 10 | Student (phone size): one column, large tap targets, full-width Submit | ✅ |
| 11 | Submitting with a question unanswered highlights it, "Please choose an answer.", focus moves to it | ✅ |
| 12 | Complete submission shows "Thank you! Your response has been recorded." | ✅ |
| 13 | Reload shows "You have already submitted a response to this survey." (local check) | ✅ |
| 14 | Local flag removed, token kept: resubmit is rejected by the **database** with the same friendly message | ✅ |
| 15 | Present page counter updates by polling (0 → 6) | ✅ |
| 16 | Results: 6 responses; counts and percentages exactly as expected (33.3/66.7, 66.7/16.7/16.7); charts labelled with counts and % | ✅ |
| 17 | Export CSV: header uses question text, one row per response, commas quoted; Summary CSV includes metadata and totals | ✅ |
| 18 | Activating another survey warns "… will be closed", then closes it; old link shows "no longer accepting responses" | ✅ |
| 19 | Unknown slug shows "Survey not found." | ✅ |
| 20 | Editing a survey with responses is blocked, offering Duplicate / View Results | ✅ |
| 21 | Duplicate creates "Copy of …" as a Draft with all questions and choices, opened in the editor | ✅ |
| 22 | Delete on a survey with responses: stronger warning; Delete disabled until "DELETE" is typed; Esc cancels | ✅ |
| 23 | Archive confirm: card shows Archived with Results / Duplicate / Restore / Delete | ✅ |
| 24 | Search "pointer" + status filter; "No surveys match your search." empty state | ✅ |
| 25 | Mobile dashboard: cards stack, no horizontal scrolling | ✅ |
| 26 | Present page fits a 1024×768 projector without scrolling | ✅ (after fix, see Bug 3) |
| 27 | Logout clears the session; protected pages redirect to login | ✅ |

### Problems found and fixed during testing

1. **Focus after "Add Choice" / "Add Question" could land in the wrong field.** The editor moved focus
   to the new input with `requestAnimationFrame`, which browsers pause in background tabs, so typed
   text went into the previously focused field. Fixed by requesting focus through React state and
   focusing in an effect after the new input is rendered.
2. **Polling waited a full interval after a hidden tab became visible** (count stayed at 0 until the next
   tick). `useInterval` now also refreshes immediately on `visibilitychange`.
3. **Present page overflowed a 768px-high projector** by 19px. The QR size now derives from the
   viewport height (`100dvh − 400px`, up to 640px).
4. **CSV file names used the UTC date** (it showed the next day in the evening). They now use the local date.
5. **React Hooks lint errors** ("setState synchronously within an effect") on four pages. Initial loads
   were rewritten as cancellable promise chains, which also prevents stale responses from overwriting
   newer state after navigation.
6. **A DB test failed after editing a draft:** the test held question ids from before the edit (saving
   replaces the questions). This was a test bug; the test now reloads ids, and the behavior is documented
   (design decision D5).

## Still to verify on the real deployment (needs your accounts)

- [ ] Run the migration in your Supabase project; confirm 5 tables and RLS in Table Editor
- [ ] Production login with the instructor account
- [ ] QR code on the projector opens the deployed (`workers.dev`) URL on a phone using **mobile data**
- [ ] Student submission in production; response visible in Table Editor (`responses`, `answers`)
- [ ] Results and CSV in production; open the CSV in Excel / Google Sheets
- [ ] A second browser (Firefox or Safari) and a real phone
- [ ] Take the screenshots listed in [docs/screenshots/README.md](screenshots/README.md)
