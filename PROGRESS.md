# Torq Desk — Step Progress

## Current step
**Step 0 — Repository review, baseline verification, and persistent instructions.**

## Status
- [x] Created `AGENTS.md` on branch `chore/step0-project-governance`.
- [ ] Complete repository-wide JavaScript syntax checks.
- [ ] Run existing test suite.
- [ ] Verify Change Password end-to-end, including signing out other sessions.
- [ ] Complete Step 0 report and wait for user approval before Step 1.

## Evidence gathered so far
- Repository: `rdxburia/Carmy`.
- `package.json` blob SHA: `0765121a7013172980c9767b7aab3a91caf88638`.
- `js/app.js` blob SHA at inspection: `b61b48be5110f1ca73156526fe325ac15ad9cd60`.
- `supabase/ws_001_core.sql` blob SHA at inspection: `5220210469978189ae5f98d0cb1e5eb23386858e`.
- `AGENTS.md` and `PROGRESS.md` were absent from the default branch when checked.
- Package scripts define the main test suite as:
  `node --test tests/customer-portal-regression.test.mjs tests/idle-session-auth.test.mjs tests/session-guard.test.mjs tests/r2-file-validation.test.mjs tests/workshop-m0-contract.test.mjs tests/support-tickets-worker.test.mjs`.
- `npm run build` runs `wrangler deploy --dry-run`; this is not a production deployment.

## Change Password audit (code inspection only; NOT end-to-end verified)
Current `ownerProfileView()` renders Current Password, New Password, Confirm New Password, and an Update Password action. Its handler:
- requires current password;
- requires new password length >= 8 and both letters and numbers;
- requires confirmation match and a different password;
- calls `db.auth.signInWithPassword({ email: user.email, password: cur })` to verify current credentials;
- calls `db.auth.updateUser({ password: neu })` to update the password.

**Known gap:** inspected code does not sign out other sessions after password update. It also reauthenticates using the shared Supabase client, which may replace the active session during verification; this behavior needs a safe browser/auth test before deciding the smallest fix. Do not claim Change Password is fully compliant until verified and this gap is addressed.

## Known issue to investigate in Step 1
`supabase/ws_001_core.sql` contains a PL/pgSQL function with `as $` and closing `$;` instead of `as $$` / `$$;`. This is a known SQL dollar-quoting defect. Do not modify it during Step 0.

## Verification ledger
| Check | Status | Evidence / notes |
|---|---|---|
| Read package scripts | PASS | `package.json` fetched from GitHub; blob SHA above |
| Read Change Password handler | PASS (inspection only) | `js/app.js` current default-branch content inspected |
| `node --check` for every JS file and test | NOT RUN | GitHub file connector does not provide a Node execution environment; local container execution was unavailable in this session |
| Existing `npm test` suite | NOT RUN | No execution environment available yet |
| Browser end-to-end Change Password | NOT RUN | Requires authenticated browser/session and controlled test account |
| Sign-out-other-sessions behavior | FAIL (code gap) | No sign-out-other-sessions call after successful password update found in inspected handler |
| SQL parse validation | NOT RUN | Step 1 task; no migration/schema changes made in Step 0 |

## Files changed
- `AGENTS.md` — added persistent project instructions and step plan.
- `PROGRESS.md` — this evidence-based progress log.

## Migrations
- None created.
- None applied.

## Pending for Step 0
1. Run repository-wide JavaScript syntax checks and all existing tests in a real Node environment.
2. Test Change Password with a controlled test account in a browser: correct current password, incorrect current password, weak password, mismatch, successful update, continued session, and other-session revocation.
3. Fix the Change Password gap only after confirming the intended Supabase auth behavior and smallest safe implementation; do not touch unrelated UI.
4. Update this file with exact command output and proof.
5. Stop and wait for the user's explicit "go" before Step 1.

## Risks / unknowns
- Current code inspection is not equivalent to end-to-end verification.
- The GitHub connector allowed repository reads/writes but did not execute Node tests or browser flows.
- No database migrations have been applied; production data has not been touched.
