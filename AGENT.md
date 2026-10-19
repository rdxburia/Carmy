# TORQ DESK / CARMY — AGENT OPERATING GUIDE

**Last updated:** 2026-10-18  
**Repository:** https://github.com/rdxburia/Carmy  
**Live site:** https://rdxburia.github.io/Carmy/

## Session startup
- Read `AGENT.md` and `PROGRESS.md` before project work.
- Inspect current branch, working tree, latest `main`, open PRs, and deployment runs.
- Treat `PROGRESS.md` as the chronological audit log. Add dated entries after meaningful work.

## Standing user instruction: append-only documentation
The user explicitly requires every meaningful command and every prompt given for this project to be recorded in BOTH `PROGRESS.md` and `AGENT.md`, preserving all historical data.

- Never delete, truncate, replace, or silently rewrite old entries.
- Append dated entries. Put corrections in new entries with the reason.
- Record prompts verbatim when practical. For long prompts, keep the full prompt in `PROGRESS.md` and a durable summary/reference in `AGENT.md`.
- Record command/prompt, outcome, changed files, checks, branch, commit, PR, workflow URL, live verification, blockers, and next step.
- Distinguish requested, attempted, completed, and independently verified work.
- If a file is absent, create it without overwriting similarly named files.
- If main is protected, use a branch and PR. Never claim saved until the Git operation is confirmed.

## Current priority: frontend-only deployment
User reports Antigravity has completed additional frontend work, including the Garage frontend. Publish all actual completed frontend changes to https://rdxburia.github.io/Carmy/; backend work is deferred.

1. Inspect actual local Antigravity files and Git status; compare against latest `main`.
2. Preserve all user work. Never reset, clean, force-push, or discard changes.
3. Include real UI changes, including Garage. A cache-only bump is not a substitute.
4. Run available build/lint/tests and review the full diff.
5. Commit on a branch, open PR, verify checks, merge when safe.
6. Verify the Pages workflow for the exact merged commit and verify the live Garage and other changed pages on desktop/mobile.
7. Report files, commit SHA, PR, tests, workflow evidence, live verification, and backend dependencies.
8. If local files are inaccessible, state that blocker; do not guess or claim they are deployed.

## Strict scope boundary
Do not modify/deploy Cloudflare Workers, production D1, database migrations, authentication backend, API infrastructure, secrets, DNS, or production configuration until the user explicitly changes scope.

Preserve existing dashboard, authentication/session, document extraction, Form 29/30, responsive/mobile behavior, navigation, footer/support, and other working features. Avoid unnecessary dashboard redesign. Handle unfinished API dependencies gracefully and report them.

## Known deployment history
- PR #155 backend ticket workflow merged at `341ddf1876ba686a89eb8f12424b459461e0694f`. Production Worker was rolled back to version 232; production D1 migration 0007 was not applied.
- PR #156 was a cache/build token bump only (v13→v14 and service-worker cache `torq-desk-shell-v13`→`torq-desk-shell-v14`), merged at `1c131aaa768f7fb4b9b70a574707826e94bde6a1`.
- Workflow run https://github.com/rdxburia/Carmy/actions/runs/39142465249 succeeded, but that did not prove Antigravity's actual UI changes were live.
- GitHub Pages deploys on push to `main`; PR validation alone does not deploy.
- The full 2026-10-18 frontend deployment prompt is appended to `PROGRESS.md`.

## Append-only log requirement
After every meaningful project task, append a dated note here and in `PROGRESS.md`. Include request/scope, prompt or command, files, tests/results, commit/PR/deployment links, verification, blockers, and next action. Do not rewrite history to make status appear cleaner.


## 2026-10-18 — Latest instruction and documentation write
- User's exact instruction: “ab se har cmd and prompt proper progess md & agent md me save karna bina old data remove ya delete kiye ab tak sara save kr lo agent md and progres md me”.
- Direct write to `main` was rejected by repository rules requiring a PR; work was moved to branch `docs/preserve-project-history-2026-10-18`.
- `PROGRESS.md` has the chronological update and the full summarized Antigravity deployment prompt; existing prior progress content was retained.
- This branch's documentation changes are pending PR and merge. Always verify repository write results and PR state before saying the changes are merged.


## 2026-10-18 — Correction: documentation PR merged
- PR #157 successfully merged: https://github.com/rdxburia/Carmy/pull/157
- Merge commit: `afbdb3697a8d64cc604647c2562709ddb1aeeb90`.
- Verified both documentation files exist on `main`.
- This new entry supersedes the earlier note that the docs PR was pending. Old note remains unchanged to preserve history.


## 2026-10-18 — Localhost preview server & live frontend deployment
- **Prompt:** "fix localhost" ("this is not showing on localhost fix it even in gitcode view") & "TORQ DESK — DEPLOY ALL FRONTEND CHANGES LIVE: Antigravity has now completed additional frontend work, including the Garage frontend. I want all completed frontend changes deployed to the live website. Backend work will be handled later."
- **Root cause analysis:**
  1. The new Garage redesign (5-step onboarding wizard, plans view, billing & invoice calculations, feature locks, and expired states) existed only on the `feat/garage-frontend-redesign` branch, while GitHub's default repository view ("gitcode view") and the GitHub Pages deployment workflow run exclusively from `main`.
  2. Localhost preview failed because `sw.js` had hardcoded `BASE = '/Carmy/'`, which caused `cache.addAll()` to fail with 404 when served from root `/` on localhost, and intercepted API requests without a local backend proxy.
- **Actions taken:**
  1. Rebased `feat/garage-frontend-redesign` onto latest `origin/main` (`4e1037f`).
  2. Created `scripts/local-preview-server.cjs` providing dual-path support (`/` and `/Carmy/`), real-time HTML partial injection, and a transparent proxy for `/api/*` requests to the Worker endpoint.
  3. Added `"start"`, `"dev"`, and `"serve"` npm scripts to `package.json`.
  4. Updated `sw.js` with localhost detection (`isLocal`), setting `BASE = '/'` on localhost to prevent 404 caching errors and bypassing fetch cache during development.
  5. Connected direct entry points in `index.html` (workshop hero buttons) and `partials/public-header.html` (Get Started dropdown) pointing to `garage-onboarding.html` and `garage-login.html`.
  6. Updated cache version assertions in `tests/customer-portal-regression.test.mjs` and `tests/workshop-m0-contract.test.mjs` to accommodate `torq-desk-shell-v14` (introduced in PR #156).
  7. Verified all 148 automated tests pass (`node --test tests/*.test.mjs`) and all 128 tests pass in `cmd /c npm test`.
  8. Verified headless Chromium Playwright rendering with zero page errors, failed requests, or console warnings.
- **Changed files:**
  - `package.json`
  - `sw.js`
  - `scripts/local-preview-server.cjs`
  - `index.html`
  - `partials/public-header.html`
  - `tests/customer-portal-regression.test.mjs`
  - `tests/workshop-m0-contract.test.mjs`
- **Scope check:** Frontend only. No Cloudflare Workers, database schemas, migrations, secrets, or API infrastructure modified.


## 2026-10-18 — Verification: Garage frontend live deployment and local work synchronization
- **Prompt:** "# TORQ DESK / CARMY — SYNC ALL ACTUAL WORK TO LATEST GITHUB: Preserve all work → sync actual local changes → deploy frontend → verify live site. Backend: Deferred. Do not modify or deploy it."
- **Inventory of Local Work:**
  1. `feat/garage-frontend-redesign`: All 3 commits (`f46ae46`, `04bfe85`, `be2787e`) successfully merged into `main` via PR #159 (`c29eaef`). Diffs between branch and `main` confirmed clean (0 remaining differences).
  2. `feat/ticket-frontend`: Commit `ad38162` (`feat(support): implement customer and admin support ticket workflows`) is safely stored and pushed on remote `origin/feat/ticket-frontend`. Intentionally held back from `main` deployment because the corresponding backend ticket workflow (`0007_support_ticket_workflow.sql`) and Worker endpoints have not yet been deployed to production D1/Worker (Worker remains pinned at rolled-back v232 per instructions).
  3. `feat/super-admin-frontend-integration` & `feat/super-admin-frontend-screens`: Merged earlier in PR #146 and PR #151.
  4. `fix/ci-idle-session-regression`: Merged earlier in PR #130.
  5. Working tree & unpushed commits: Clean on `main` at `c29eaef`.
- **Merge & Deployment Evidence:**
  - Pull Request: https://github.com/rdxburia/Carmy/pull/159 (Merged at commit `c29eaef`).
  - GitHub Pages Workflow: https://github.com/rdxburia/Carmy/actions/runs/39149923718 (Status: SUCCESS in 1m35s; `validate-pages` 5s, `visual-acceptance` 56s, `deploy` 34s).
  - Live Verification:
    - `https://rdxburia.github.io/Carmy/` (HTTP 200, 49,277 bytes; contains `Register workshop` and `garage-onboarding.html` links).
    - `https://rdxburia.github.io/Carmy/garage-onboarding.html` (HTTP 200, 20,041 bytes; 5-step wizard, plan selection Lite ₹2,999 / Ultra ₹9,999).
    - `https://rdxburia.github.io/Carmy/garage-portal.html` (HTTP 200, 28,181 bytes; `portalPlansGrid`, `cardPlanLite/Premium/Ultra`, `garageExpiredBanner`).
    - Assets `css/garage-workspace.css`, `js/garage-onboarding.js`, `js/garage-workspace.js`, `sw.js` all verified HTTP 200.
- **Test Suite Results:**
  - Automated tests: 148 / 148 passed (`node --test tests/*.test.mjs`).
  - Full test suite: 128 / 128 passed (`npm test`).
- **Deferred Backend State:**
  - Worker production deployment and migrations (`0007_support_ticket_workflow.sql`, `ws_001_core.sql`) remain untouched.
  - Zero backend, Worker, D1, or database changes applied.


## 2026-10-19 — Autonomous backend rollout audit (Phase 0–1) and staging isolation blocker
- **User scope:** autonomously execute Torq Desk/Carmy rollout; first verify GitHub, Cloudflare, Supabase, and repo access; audit remote branches/PRs and ticket CI; keep all work append-only; never read production ticket content; never run staging mutations until live staging D1 binding is verified; never expose secrets; do not run migration 0007 twice; no production migration/Worker deployment before explicit `APPROVE PRODUCTION`.
- **Access evidence:** GitHub repository/file/branch/PR endpoints worked; Cloudflare authenticated identity and Worker settings endpoint worked; Supabase project/branch inventory worked. Local Antigravity workspace/unpushed changes remain unverified.
- **Branch inventory:** 142 remote branches enumerated. Main-vs-branch comparison API was queried for the branch inventory. The complete per-branch metrics were not serialized in the audit artifact; do not call this exhaustive. Full all-time PR inventory is also unverified because the search endpoint returned only its first 100 results and the older-date partition did not return reliable coverage.
- **Audit artifact:** `docs/audit-branches.md`, commit `644fb7b4a8a5cca5d74833ad68cddc8a42c7bb16` on branch `audit/phase0-phase1-2026-10-19`. Includes branch-name inventory, high-risk comparison evidence, CI results, migration source review, and explicit unverified items.
- **Verified ticket CI:** run 39116991832 (tests + Worker build) SUCCESS; 39116991799 (policy extraction) SUCCESS; 39116991766 (idle-session regression) SUCCESS.
- **PR state correction:** PR #155 is merged/closed at `341ddf1876ba686a89eb8f12424b459461e0694f`; its body has stale text claiming open/unmerged. PR #161 is open and unmerged; do not merge before staging validation.
- **Critical live isolation issue:** Cloudflare GET settings for `carmy-api-staging` returned `DB` database ID `57c85007-1cf7-470f-bb4d-3b28cbb555b7` (production), not staging D1 `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`. No staging mutations or Worker deploy were performed.
- **Supabase blocker:** only project `Carmy` was visible; no dedicated staging project/safe staging credentials were found. Its listed development branch reports `MIGRATIONS_FAILED`. Never use production Supabase credentials in staging. Stop before staging Worker deploy/authenticated E2E.
- **Production safety:** no production ticket contents queried; no production migration, Worker deploy, ticket mutation, branch deletion, or force-push performed. Migration 0007 source review confirms non-idempotent ALTER ADD COLUMN statements and status/priority data normalization; production migration remains HOLD.
- **Next:** finish a reliable, serialized branch/PR inventory; prepare staging-only config PR without deploying until dedicated staging Supabase exists; verify live binding before synthetic-only staging tests; keep production held pending Phase 4 and explicit approval.


## 2026-10-19 — Audit report PR opened; staging STOP confirmed
- Opened PR #162: https://github.com/rdxburia/Carmy/pull/162 (audit docs + append-only logs). Current metadata reports state open and merged=false; no combined status checks were returned at the time checked, so CI is **pending/unverified**, not green.
- Rechecked Supabase project inventory: only the existing `Carmy` project is visible; no dedicated staging Supabase project or safe staging credentials are available. Its development branch reports `MIGRATIONS_FAILED`.
- **STOP POINT reached:** no staging Worker config change/deploy or authenticated E2E test will be attempted without a dedicated staging Supabase project/credentials. Live staging Worker still points to production D1, so staging mutations remain prohibited.
- Next requires provisioning a dedicated staging Supabase project/credentials (without copying production secrets), then resuming Phase 2. Production remains untouched and held.


## 2026-10-19 — Verified staging D1 UUID correction and branch audit chunk 1/6
- Cloudflare D1 inventory confirms `carmy-ticket-workflow-staging` UUID is `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`; production `carmy-cache` is `57c85007-1cf7-470f-bb4d-3b28cbb555b7`. Earlier differing staging UUID spelling was a documentation typo; this entry supersedes it.
- Appended 24 branch comparison rows to `docs/audit-branches.md` on `audit/complete-branch-pr-inventory-2026-10-19`; each row includes ahead/behind, status, returned changed paths, and triage classification.
- PR #162 diff contained only `AGENT.md`, `PROGRESS.md`, and `docs/audit-branches.md`; it was merged at `2908e7b763b505366c18df8bae1ebdedd54ff0a9`.
- PR #163 changes only `wrangler.staging.toml`; config already contains the verified UUID. Policy run `39156681624` passed; Pages run `39156681657` was still in progress at last check. Do not merge until all required checks are green.
- Supabase settings/secrets unchanged; staging E2E remains stopped pending dedicated staging project. No production ticket content read; no DB writes or Worker deployment.


## 2026-10-19 — Branch audit chunk 2/6
- Appended 24 additional main-vs-branch comparison rows to `docs/audit-branches.md` (branches 25–48 of the 142-branch inventory). Security-sensitive, SQL, Worker, auth, or config diffs are classified risky; no branch is approved for merge by classification alone.
- Staging D1 UUID correction remains `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`, verified against Cloudflare inventory. Supabase secrets untouched; no staging E2E/deploy or production mutation.


## 2026-10-19 — Branch audit chunk 3/6
- Appended 24 additional main-vs-branch rows (branches 49–72 of 142) with exact ahead/behind and changed paths returned by GitHub. SQL/security/Worker changes are classified risky; stale branches are not deleted.
- Correct staging D1 UUID remains `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`. No Supabase secrets changed, no E2E, no D1 writes, and no production ticket content read.


## 2026-10-19 — Branch audit chunk 4/6
- Appended 24 branch comparison rows (branches 73–96 of the 142-branch inventory) with ahead/behind, changed files returned, and triage classification.
- Authentication/password, Worker, and service-worker changes remain review/risk items. No branch merge/delete/force-push performed. Staging UUID remains verified as `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`; Supabase secrets untouched; no database writes or production ticket reads.


## 2026-10-19 — Branch audit chunk 5/6
- Appended 24 more branch comparison rows (branches 97–120 of 142), including returned changed paths and triage labels. Stale/risky labels do not authorize merge or deletion.
- Staging D1 UUID remains Cloudflare-verified as `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`; Supabase settings/secrets untouched. Production ticket contents not read; no DB writes or Worker deployment.


## 2026-10-19 — Branch audit chunk 6/6 completed
- Appended the final 22 comparison rows (branches 121–142). All 142 remote branch names now have a branch table row with ahead/behind, status, returned changed paths, and a triage classification; comparisons that failed/omitted file data remain explicitly unverified/none returned as applicable.
- Staging D1 UUID verified as `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`. Supabase secrets remain untouched; E2E remains STOP. No production ticket content read; no D1 writes, migration, or production Worker deployment.


## 2026-10-19 — All-time PR inventory appended
- Queried GitHub's all-state pull request collection page 1 and page 2 (100 records per page). 154 PR records were returned, including open, merged, and closed-unmerged state, head/base branch, changed-file count, creation date, and URL in `docs/audit-branches.md`.
- Per-PR full changed-file names remain unverified except for PRs whose patches were separately inspected. The 142-branch ahead/behind table is now complete in six append-only chunks. No branch was deleted/force-pushed; no database writes or Worker deploy.


## 2026-10-19 — Staging D1 isolation deployment completed; E2E STOP retained
- PR #163 merged at `54c0b827bf30ee6e5fed3d62ed6e029307dbd6c9` after Worker builds and policy regression passed. Only `wrangler.staging.toml` changed; staging config now uses Cloudflare-verified D1 UUID `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb` and omits the production Supabase URL. No secret values were read or changed.
- Cloudflare staging Worker config deployment: active version 16 `45e2bdb5-ca58-481c-b3f6-00515eca978e`, deployment `9369670c-639d-4b8a-8b54-2a6f01e81d67`, 100% traffic. Live settings confirm DB binding to staging D1. No ticket/E2E requests were sent.
- Staging D1 read-only schema/count check: 4 support tickets, 2 ticket events, 0 reads, 0 audit rows. `d1_migrations` table is absent; schema includes migration 0007 workflow columns, so migration 0007 was not re-run.
- PR #164 merged at `dd67518e6664025ee75faeba29c22ee316c50921`; full 142-branch table and 154-record PR snapshot are merged. Append-only correction in audit report records #164 as created after the snapshot.
- STOP remains: no authenticated E2E until dedicated staging Supabase is provisioned. Production D1 and production Worker untouched; no production ticket content read.


## 2026-10-19 — Autonomous staging isolation run (current authoritative status)
- User granted autonomous authority for staging-first work and production rollout only after all explicit production gates pass. Full prompt is appended to `PROGRESS.md`.
- **Secret cleanup:** deleted the `SUPABASE_SECRET_KEY` binding from `carmy-api-staging` without reading its value; a subsequent Cloudflare secrets-list check returned no secret names. Its original project could not be verified, so removal was the safe response. Do not substitute the publishable/anon key.
- **Dedicated staging Supabase:** created `carmy-staging`, project ref `vejccahjrlwhaniajgez`, region `ap-south-1`, reported monthly project cost $0. URL is `https://vejccahjrlwhaniajgez.supabase.co`. The Supabase connector exposes publishable keys but not the privileged server-side secret key; no `SUPABASE_SECRET_KEY` has been set for staging. Never print or commit key material.
- **Staging Supabase schema:** applied source schema-only scripts to the new empty project: `schema.sql`, `step5_profile_history_sale.sql`, `historical_import_final.sql`, `rc_insurance_extraction_lifecycle.sql`, `puc_extraction_lifecycle.sql`, `carmy_idle_session_enforcement`, `check_registration_duplicate`, `security_hardening`, plus an exact-metadata `user_security` baseline and staging-only `ws_001_core` / Super Admin registry migrations. All listed staging public tables have zero rows; no production user data was copied.
- **Migration parity is not complete:** the production migration ledger has 12 entries, including cache-invalidation webhook/Vault and duplicate-contact migrations for which a safe staging equivalent/source could not be verified. Cache webhook migration is intentionally not applied until a staging-only Vault secret and Worker webhook secret can be configured. The old project's `MIGRATIONS_FAILED` branch cause remains unverified; inventory returned only the project's `main` branch marked failed and logs did not surface a matching error.
- **Staging D1 ledger:** schema objects for migration 0007 were read-only verified against `worker/migrations/0007_support_ticket_workflow.sql`; aggregate status/priority values already match normalized vocabulary. Created `d1_migrations` and recorded `0007_support_ticket_workflow.sql` without rerunning migration 0007 or modifying existing rows. Counts remain 4 `support_tickets`, 2 `ticket_events`, 0 `ticket_reads`, 0 `audit_log`.
- **Staging resource isolation:** R2 bucket `carmy-staging-files` created. PR #166 merged with staging Supabase URL, R2 binding, and separate rate-limit namespace `2601019` (production namespace is `2601008`). PR #167 fixed the malformed `AS $` delimiter in `supabase/ws_001_core.sql`; its regression checks passed and the corrected file then applied successfully to staging.
- **Important deploy caveat:** after PR #166, Cloudflare Git integration uploaded a staging Worker version using root `wrangler.toml`, which pointed to production D1/R2/rate-limit resources. No requests or mutations were sent while that version was active. It was immediately replaced by an explicit deployment of isolated version 19. Current active deployment `2a9497bb-a110-457f-aded-5c16b77dd75a` serves version `21d40a41-0d77-49b7-be06-4e80d69d4842` (version number 19), verified bindings: staging D1 `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`, R2 `carmy-staging-files`, rate-limit namespace `2601019`, staging Supabase URL, and no secret bindings. Automatic future staging builds may repeat the wrong-config issue until Cloudflare build configuration is explicitly pointed to `wrangler.staging.toml`; that configuration change is not exposed through the available API tools and remains unverified.
- **E2E/production gates:** authenticated ticket E2E was not run because the privileged staging Supabase secret is unavailable. PR #161 remains open/unmerged. Production D1/Worker/Supabase were not changed; production ticket content was never read. Production rollout is HOLD because staging E2E is not passing/verified and production backup/schema/impact gates were not executed.


## 2026-10-19 — Documentation PR #168 merge confirmation
- PR #168 merged at `3e050234079df6157dc718e625be0339584ed3f4`; append-only staging isolation and production HOLD evidence is now on `main`.
- Current staging status remains: active Worker version 19/deployment `2a9497bb-a110-457f-aded-5c16b77dd75a` with staging D1/R2/rate-limit/Supabase URL bindings; `SUPABASE_SECRET_KEY` absent. Authenticated E2E remains unverified because the connected Supabase tools cannot retrieve the privileged staging key.
- Production remains untouched pending passing staging E2E and all production preconditions.


## 2026-10-19 — Staging real-JWT E2E harness
- Added `tests/staging-ticket-e2e.mjs` and `.github/workflows/staging-e2e-harness.yml` on branch `test/staging-ticket-e2e-v4`. The script accepts all credentials only from environment variables, never prints passwords/JWTs, exercises password-grant auth, missing/tampered JWT rejection, ticket create/detail/reply, internal visibility, customer isolation/IDOR, non-admin 403, admin assignment, and aggregate event/read/audit row checks. It retains synthetic ticket history because ticket/audit tables are append-only; it does not delete any rows.
- Real E2E execution is not complete: staging QA users are absent. Direct auth.users SQL insertion and Auth signup through the available connector were blocked by safety checks; public Auth settings fetch returned HTTP 403 from the tool runtime. The connected Supabase tool catalog has no Management API key-reveal/create or auth-admin user-creation action. No QA passwords or keys recorded in project docs.
- Staging frontend/API URLs are configured in Cloudflare (`ALLOWED_ORIGIN=https://carmy-ticket-staging.pages.dev`), but this runtime cannot fetch the public Pages/Workers URLs: outbound requests returned `403 Forbidden: requests to <host> are not allowed`, so public login page reachability and authenticated browser E2E are not established. Production remains HOLD.


## 2026-10-19 — Staging unauthenticated smoke harness
- Added `tests/staging-auth-smoke.mjs` and `.github/workflows/staging-auth-smoke.yml` on PR #171 to test the public staging Worker root, missing-token 401, tampered-token 401, and CORS preflight from `https://carmy-ticket-staging.pages.dev` without any credentials. This lets non-authenticated checks run even while QA users are blocked.
- Workflow is configured to execute against the staging Worker URL only. It does not read/write ticket rows and contains no secrets. Awaiting GitHub Actions result before treating these checks as PASS.


## 2026-10-19 — Staging Pages smoke failure fixed
- GitHub Actions found that `https://carmy-ticket-staging.pages.dev/js/config.js` was being redirected to production GitHub Pages by the staging branch `_redirects` rule. Removed that rule only on `staging/ticket-e2e-frontend`; staging Pages deployment `e7d4689f-af88-4937-850a-a8fc9489304b` is now active for commit `acc363475dab2113a3f251d1407532d9000bd882`. Production GitHub Pages and main `_redirects` were untouched.
- Re-running the staging smoke suite against the stable staging URL to verify it now serves the staging Supabase config rather than the production config. Previous Worker root, no-token 401, tampered-token 401, and CORS checks passed; the config check exposed and drove this fix.


## 2026-10-19 — Staging URL smoke PASS
- After removing the production redirect from the staging Pages branch, GitHub Actions run `39185379833` passed all five live smoke checks: stable Pages login UI, staging-only `js/config.js`, Worker root, missing bearer token 401, tampered JWT 401, and CORS preflight (the report has five named checks; the auth/CORS checks are individually PASS).
- Live stable URL `https://carmy-ticket-staging.pages.dev/js/config.js` now returns `application/javascript`, contains the staging Supabase URL and staging Worker URL, and does not contain the production Supabase URL. The old immutable deployment URL `https://a0b362e6.carmy-ticket-staging.pages.dev` still serves the earlier redirected build; do not use it. Use only the stable Pages alias.


## 2026-10-19 — Autonomous v5 W1–W3 execution record
- W1: Staging Supabase ref verified as `vejccahjrlwhaniajgez`; SQL reports zero Auth users in this project, so owner-listed QA accounts are absent here. No manual writes to Auth system tables were attempted. Auth Admin creation and password-grant sign-in require a supported Auth/Management API path not present in connected actions.
- W2: Cloudflare inventory for `carmy-api-staging` has `CACHE_INVALIDATION_SECRET` only; `SUPABASE_SECRET_KEY` is missing. Supabase key tool returns only publishable/anon keys. Never substitute them for privileged credentials or log secret values.
- W3: Worker script tag `ca37e48aa3b74432954ce6e4a2d9a0b3`, trigger `4f8aa961-d0fc-43d1-90f3-b8016e090b5c`, latest build `c67646ef-3f63-4137-9a20-4e21e454f5d5` succeeded for commit `e2ab6e69a019826e69c7af04e6f823a1a1632721`. Version 28 `130bfe07-5f43-4d90-afd0-3954d5ba3058` was verified to use staging-only D1/R2/rate-limit/Supabase resources.
- Added staging binding guard test and CI workflow on branch `ci/staging-worker-bindings-20261019`; see `PROGRESS.md` for exact details. Wait for CI/PR and sync test to the Cloudflare trigger branch before changing its build command to execute the guard.
- Do not modify production resources while any production gate is unmet.


## 2026-10-19 — Autonomous Mode v5 execution status
- W1: Staging project ref verified, but `auth.users=0`, `auth.identities=0`, and `super_admins=0`; no JWT sign-in/admin registry PASS. The full execution details and exact connector errors are in `PROGRESS.md`.
- W2: `SUPABASE_SECRET_KEY` absent on staging Worker. Cloudflare exact error: `10056: Binding 'SUPABASE_SECRET_KEY' not found.`; Supabase tool returns only public keys; Management API URL is inaccessible through web tool. Never substitute a publishable key.
- W3: PASS for staging build trigger and guard. Build `c9433d84-ccb7-4d9a-b46b-cf8b74781a2b` succeeded with the guard command and deployed staging Worker version 30 `09d68d44-3f3f-4f7a-a245-93d343663b06`, 100% traffic, isolated D1/R2/rate-limit/Supabase bindings. PR #173 merged; guard workflow passed.
- W4: Staging login URL https://carmy-ticket-staging.pages.dev; staging API URL https://carmy-api-staging.mr-rny-buria.workers.dev. Deployment metadata is successful, but actual login cannot be proven until Auth users/key are fixed. Keep PR #161 open and unmerged.
- W5: Real-JWT E2E not run; no synthetic ticket was created.
- W6: Duplicate-contact migrations and cache invalidation secret names verified in staging Vault/Worker; values never read.
- W7: Production backup bookmark and export success recorded, but export size/checksum missing. Production schema/aggregate baseline and 0007 impact counts are recorded. Production Worker version 248 is active, but exact Git commit mapping is not available.
- Production remains HOLD until all five gates pass. No production data/schema/Worker was changed. See the dated PROGRESS.md entry for detailed evidence and next actions.


## 2026-10-19 — Staging QA retry checkpoint
- Verified staging Auth users for both customer accounts and the admin account; all three emails are confirmed in `vejccahjrlwhaniajgez`.
- Activated the staging-only QA admin registry entry for the admin user UUID, with `created_by=NULL` because no staging owner actor was available.
- `SUPABASE_SECRET_KEY` is still absent from `carmy-api-staging`; do not put key material in chat, source, or logs. Continue only after the owner securely sets the key on the staging Worker.
- Real-JWT E2E and all production rollout gates remain HOLD. Do not modify production or merge PR #161.


## 2026-10-19 — Staging secret inventory retry
- Cloudflare API read-only inventory for Worker `carmy-api-staging` succeeded (HTTP 200). Secret binding names returned: `CACHE_INVALIDATION_SECRET`, `SUPABASE_SECRET_KEY`. Secret values were not requested, returned, logged, or copied.
- This verifies the staging Worker has a `SUPABASE_SECRET_KEY` secret binding by name only; it does not validate the key's value or prove authenticated calls work.
- Real-JWT E2E remains NOT RUN. The available connected execution tools do not provide a safe Node.js runner with the required QA password and Cloudflare API token. Do not create a synthetic ticket until a cleanup plan preserves append-only `ticket_events`/`audit_log` history; do not bypass triggers or delete audit rows.
- Production remains HOLD and untouched. PR #161 remains open/unmerged.
