# Torq Desk — Step Progress

## Current step
**Step 0b — real CI evidence and narrowly scoped syntax/auth fixes.**

## Status
- [x] Re-read `AGENTS.md` and this file before Step 0b.
- [x] Added GitHub Actions workflow with `workflow_dispatch`, push, and pull-request triggers.
- [x] Checked every repository JavaScript source/test file with `node --check`.
- [x] Ran secret-free tests and new password-change tests.
- [x] Fixed the missing array closure in `js/garage-workspace.js`.
- [x] Fixed dollar quoting in `supabase/ws_001_core.sql` (`as $$ ... $$;`).
- [x] Parsed every SQL file under `supabase/` using pglast, normalizing psql meta-directives and test variables for syntax-only parsing.
- [x] Added isolated password verification and sign-out-other-sessions behavior with unit tests.
- [x] Recorded private-fixture/secret-dependent items as NOT RUN.
- [ ] Fix and rerun garage workspace browser regression; current run is still in progress after a prior run exposed a customer-delete acceptance failure.
- [ ] Public home responsive screenshot/browser run (queued after garage regression in CI).
- [ ] Authenticated dashboard smoke test; conditional on dedicated staging secrets being configured.
- [ ] Authenticated browser end-to-end Change Password test.
- [ ] Final report and wait for explicit user approval before Step 1.

## Latest CI evidence
- Follow-up CI: [run 38913351195](https://github.com/rdxburia/Carmy/actions/runs/38913351195), head commit `08167a8c08f87ad34c0e2f0d3fb194ea6b8909cb`; syntax, unit tests, and SQL parser steps passed; browser regression is currently running. A prior browser run failed at `Delete customer failed`; the regression script was changed to capture the confirmation and report table state for diagnosis. Do not treat browser acceptance as passed until this run concludes.
- CI workflow now installs Playwright/Chromium, serves an isolated local static preview, runs the garage workspace acceptance script and public home screenshot checks, and runs the authenticated dashboard smoke test only if dedicated staging secrets are configured.
- Workflow: [Step 0b verification](https://github.com/rdxburia/Carmy/actions/runs/38912525016)
- Run ID: `38912525016`; commit: `212f075174b85fb4557ad7fb176bbebf61f1a6ca`.
- Conclusion: **PASS**.
- JavaScript syntax: `JavaScript files checked: 54`; `PASS: all JavaScript syntax checks`.
- Tests: `# tests 64`, `# pass 64`, `# fail 0`, `# skipped 0`, duration `1012.849933 ms`.
- SQL parser: `SQL files discovered: 22`; all 22 printed `PASS`, followed by `PASS: all Supabase SQL files parse`.
- The SQL parser ignores psql backslash directives and replaces psql `:'variable'` placeholders with a dummy UUID strictly for parse validation. It does not execute SQL or validate live database behavior.

## Test cases covered
- New `tests/password-change.test.mjs`: weak password, mismatched confirmation, wrong current password (no update), and successful update followed by `signOut({ scope: 'others' })`.
- Existing secret-free tests and fleet scalability test were included in the same Node test run.

## Explicit NOT RUN
- `tests/document-classifier-real-files.test.cjs`: private PDFs in `tests/fixtures/local` are not committed.
- `tests/insurance-real-files.test.cjs`: private insurance PDFs in `tests/fixtures/local` are not committed.
- `tests/smoke.js`: requires `CARMY_URL`, `CARMY_TEST_EMAIL`, `CARMY_TEST_PASSWORD` and a provisioned authenticated account.
- `scripts/test-garage-workspace.mjs`, `scripts/capture-home-screenshots.mjs`: now invoked in CI using a local static preview and Playwright; garage acceptance has exposed a customer-delete failure and remains under investigation.
- `scripts/debug-document-classifier.cjs`, `scripts/debug-insurance-extraction.cjs`: require private PDF fixtures.
- `scripts/preserve_and_recover.py`: recovery operation; not run without an approved target.
- `scripts/bump-build.cjs`: mutates build metadata; no requested version tag.
- Authenticated browser verification of the password change and actual revocation of other live sessions: **NOT RUN**; no test account/session credentials were supplied to this workflow.

## Commits on the Step 0b branch
- `c9da45c` — close garage workspace field configuration array (initial attempt; syntax evidence caught remaining imbalance).
- `9f652e9` — balance/reformat the garage workspace field configuration; confirmed by repository-wide syntax PASS.
- `cf4715d` — correct workshop owner function dollar quoting; confirmed by pglast PASS.
- `4eb9658`, `03d4f5f` — add isolated password-change helper and correct its argument handling.
- `606d617` — add tests for weak password, mismatch, wrong current password, and success/session revocation.
- `1466ba6`, `67b4a1c` — integrate helper into Account & Security and load it before app.js.
- `df35759`, `0d85519`, `1e98fd4`, `e649dd6`, `a9d8bb2`, `212f075` — add/repair CI workflow, lockfile-less dependency install, psql normalization, and parser checks.
- Draft review: [PR #137](https://github.com/rdxburia/Carmy/pull/137); not merged.

## Files changed in Step 0b
- `.github/workflows/step0b-verification.yml`
- `js/garage-workspace.js`
- `supabase/ws_001_core.sql`
- `js/password-change.js`
- `js/app.js`
- `index.html`
- `tests/password-change.test.mjs`
- `PROGRESS.md`

## Migrations / production
- No new migration files created.
- No migrations applied.
- No production data or authentication records changed.
- Existing dashboard UI/navigation was preserved; no redesign was performed.

## Risks / unknowns
- CI proves syntax, unit behavior with mocks, and PostgreSQL parser acceptance only. It does not prove the password change against a real Supabase account or verify live session revocation.
- `npm install --no-package-lock` reported 8 dependency audit vulnerabilities (7 high, 1 critical); dependency updates were outside this step and were not performed.
- Authenticated smoke/password tests remain dependent on dedicated staging credentials; private PDF fixtures are still absent and were not synthesized or committed.

## Next action
Step 0b report is ready for review. **Do not start Step 1 until the user explicitly says "go".**
