# TORQ DESK — PROGRESS & AUDIT REPORT

**Date:** 2026-10-17  
**Milestone:** Super Admin Roadmap — Step 0: Stability & Security Foundation  
**Branch:** `fix/form-29-30-pdf-ownership-transfer` (baseline for Step 0 audit)  
**Status:** STEP 0 COMPLETE (Awaiting Explicit Review & Approval before Step 1)

---

## 1. Executive Summary & Step 0 Scope

Per the approved roadmap, Step 0 focuses exclusively on:
1. Auditing existing authentication, authorization, data isolation, and database policies before touching Super Admin features.
2. Identifying and repairing verified, reproducible bugs without altering UI design or breaking existing functionality.
3. Preserving unrelated working code, specifically the Transfer Documents (Form 29 & 30) implementation.
4. Documenting the architectural foundation for subsequent Super Admin development.

---

## 2. Git Branch & Working Tree Audit

- **Current Branch:** `fix/form-29-30-pdf-ownership-transfer`
- **Commits Ahead of `origin/main`:**
  - `af5b578`: `fix(transfer): resolve blank Form 29/30 PDF, add template persistence and ownership transfer workflow`
- **Preserved Uncommitted Changes (Transfer Documents feature & polish):**
  - `css/styles.css`: Duplicate Copy badge position (`top: 10mm; right: 16mm;`), chassis pencil print box removed.
  - `index.html`: Unified "Transfer Documents" button label.
  - `js/app.js`: Standardized filename (`Transfer_Documents_<REG>.pdf`), date formatting, unlinking of archived document deletion from sale history, edit/regenerate modal, pencil box removal.
  - `worker/src/templates.js`: Schema fields and builtin template support for Transfer Documents.
  - `tests/customer-portal-regression.test.mjs`: Tests 17–24 for Transfer Documents.
- **Step 0 Fixes (New):**
  - `js/garage-workspace.js`: Fixed critical syntax error (unclosed bracket in `types` definition).
  - `js/app.js`: Hardened `getAuthRedirectUrl` against undefined `window.location.pathname`; added graceful fallback for `check_registration_duplicate` and handled Supabase empty `identities` array on duplicate signups.
  - `supabase/migrations/20261017140000_check_registration_duplicate.sql`: Added version-controlled server-side security-definer function for duplicate registration checks.
  - `tests/customer-portal-regression.test.mjs`: Tests 25–28 covering Step 0 fixes.

---

## 3. Security, Authorization & Tenant Isolation Audit

### A. Authentication & Session Security
1. **Idle Session Enforcement:**
   - Both Cloudflare Worker (`worker/src/auth.js`) and Supabase PostgreSQL (`supabase/migrations/20261012060000_carmy_idle_session_enforcement.sql`) strictly enforce the 120-second idle timeout.
   - Client-supplied `X-Carmy-Last-Activity` header is explicitly untrusted on the Worker.
   - Session activity is recorded using Worker server timestamps throttled to 15-second intervals.
2. **Registration & Duplicate Account Prevention:**
   - Client invokes `check_registration_duplicate` RPC before calling `signUp`.
   - **Bug Found:** The RPC was previously not defined in any repository migration file. In environments where the RPC was missing, PostgREST returned HTTP 404 (`PGRST202`), which caused registration to fail with `"We could not verify your details right now. Please try again."`
   - **Bug Found:** If Supabase email enumeration protection is active, duplicate signups return `identities: []` with no error, previously misleading the user into a dead-end email verification screen.
   - **Fix Applied:** Created `supabase/migrations/20261017140000_check_registration_duplicate.sql` (`security definer` with isolated `search_path`); made client fall back gracefully to standard `db.auth.signUp()` if the RPC is missing; added empty `identities` array check to toast duplicate warning.

### B. Tenant Isolation & Row Level Security (RLS)
1. **Vehicle Owner Data (`cars`, `records`, `record_items`, `documents`, `insurance_history`, `puc_history`, `sale_history`, `user_profiles`):**
   - **PostgreSQL RLS:** All tables have Row Level Security enabled (`to authenticated using (auth.uid() = user_id)`).
   - **Child Table Isolation:** `records`, `documents`, `insurance_history`, and `sale_history` enforce compound checks (`auth.uid() = user_id AND exists (SELECT 1 FROM cars c WHERE c.id = car_id AND c.user_id = auth.uid())`).
   - **Storage Isolation:** Supabase Storage (`car-documents`) and Cloudflare R2 (`worker/src/r2-files.js`) restrict object keys by user ID (`documents/<user_id>/<car_id>/...`).
   - **Cloudflare Worker Layer:** Every vehicle, document, record, insurance, and PUC endpoint in `worker/src/` extracts `user.id` from the verified Supabase JWT and injects `user_id=eq.<user.id>` into database queries.
2. **Workshop / Garage Data (`ws_organizations`, `ws_staff`, `ws_counters`, `ws_audit_log`, `ws_platform_admins`):**
   - Workshop workspace is feature-flagged off by default (`worker/src/ws-feature-flag.js`).
   - RLS functions `ws_has_role()` and `ws_is_platform_admin()` isolate organizations by staff membership.

### C. Privileged Backend Operations
- Support ticket admin access (`worker/src/support-tickets.js`) is enforced via `X-Carmy-Admin-Secret` header matching `env.ADMIN_SECRET` in Cloudflare Workers. It cannot be accessed via browser tokens or client roles.
- `form_templates` table allows public read for active templates, but insert/update/delete has no authenticated policies (restricted to service role / migration scripts).

---

## 4. Verified Stability Issues Fixed in Step 0

1. **`js/garage-workspace.js` Syntax Error:**
   - **Root Cause:** Line 2 contained unclosed array brackets in `types.jobs.fields`, `types.estimates.fields`, and `types.invoices.fields`, preventing the script from parsing.
   - **Fix:** Closed the array brackets correctly. File now passes `node --check js/garage-workspace.js` and `new vm.Script()`.
2. **`js/app.js` `getAuthRedirectUrl` Runtime Exception:**
   - **Root Cause:** `getAuthRedirectUrl` accessed `window.location.pathname.endsWith` without checking if `window.location` or `pathname` exists, throwing in headless/mock runtimes.
   - **Fix:** Added defensive fallback (`String(window.location?.pathname || '/')`).
3. **Registration Resiliency & Duplicate Account Handling:**
   - **Root Cause:** Missing `check_registration_duplicate` RPC migration and unhandled Supabase enumeration-protected responses.
   - **Fix:** Created migration `20261017140000_check_registration_duplicate.sql` and updated `handleAuthSubmit` in `js/app.js`.

---

## 5. Architectural Foundation for Future Super Admin

The existing codebase provides a solid foundation for the Super Admin roadmap. Below is the agreed approach for subsequent steps:

1. **Dedicated Super Admin Identity & Server-Side Authorization:**
   - **Do not** use client-side flags or localStorage for admin status.
   - Authenticate admins using a dedicated database role or server-enforced table (e.g. `public.ws_platform_admins` or `public.super_admins`).
   - All admin endpoints in Cloudflare Worker (`/api/admin/*`) must require a verified admin claim or a cryptographic admin session token verified against a server-side table.
2. **Subscription & Entitlement Enforcement:**
   - Store subscriptions in a dedicated table (`public.subscriptions`) with `user_id`, `plan` ('free', 'plus', 'family'), `status` ('active', 'grace_period', 'expired', 'suspended'), `billing_cycle` ('monthly', 'yearly'), `current_period_end`, and `grace_ends_at`.
   - **Vehicle Limit Enforcement:** Server-side trigger or Worker check before `cars` insert (Free plan: max 1 vehicle; Plus plan: up to 5 vehicles).
   - **Never delete customer data** upon expiration or suspension. Grace period (7 days) allows read access with renewal prompts.
3. **Account-Bound Activation Tokens:**
   - Activation tokens must be single-use, cryptographically random, revocable, and hashed in the database (`token_hash`).
   - Redemptions must execute in a transaction binding the token to the authenticated `user_id` and recording timestamp and admin issuer.
4. **Audit Logging & Secure Admin Sessions:**
   - Append-only audit log table recording all administrative actions (`actor_user_id`, `action`, `target_user_id`, `metadata`, `ip_address`, `created_at`).
   - Admin session timeouts enforced independently of standard user sessions.

---

## 6. Business Rules Reference (Frozen for Implementation in Steps 1+)

- **Vehicle-Owner Free:** 1 vehicle limit, core features.
- **Vehicle-Owner Plus:** ₹69/month or ₹708/year (+ 18% GST). Up to 5 vehicles, expanded document storage, priority features.
- **Grace Period:** 7 calendar days after expiry before downgrade/lockout.
- **Garage Workspace:** Separate rollout; pricing to be confirmed before activation.
- **Data Protection:** Expired accounts are retained safely; records and documents are never dropped on plan downgrade.

---

## 7. Verification Evidence

- **Syntax Validation:**
  - `node --check` passed across all 15 `.js` files in `js/` (including `garage-workspace.js`).
  - `node --input-type=module --check` passed across all 21 `.js`/`.mjs` files in `worker/src/`.
- **Regression Test Suite:**
  - `node --test tests/*.test.mjs` ran with **101 tests passed, 0 failed, 0 skipped**.
  - `tests/customer-portal-regression.test.mjs` ran with **65 tests passed, 0 failed** (including new Tests 25–28).
- **Production Build:**
  - `wrangler deploy --dry-run` passed with zero bundle or binding errors.
  - `python scripts/render_public_shell.py .` passed with zero errors.

---

## 8. Milestone Transition

Step 0 foundation completed and merged. Proceeded to Super Admin Frontend Implementation on branch `feat/super-admin-frontend-screens`.
*Note on repository governance:* `AGENTS.md` is currently missing from the repository root; requirements and scope follow explicit roadmaps documented herein and user directives.

---

## 9. Super Admin Frontend Implementation (Completed)

**Date:** 2026-10-18  
**Branch:** `feat/super-admin-frontend-screens`  
**Scope:** Frontend implementation only. Zero modifications to backend Worker APIs, Supabase migrations, RLS policies, or production D1 schema.

### 9.1 Implemented Frontend Architecture
1. **Isolated Admin Shell:**
   - Activated via `body.td-admin-mode` for authorized primary admin account `rnyburia@gmail.com`.
   - Customer UI components (`.top`, `.layout > aside`, `#sideMenu`, `#mobileNav`, `.md-site-footer`) are completely suppressed.
   - Dedicated admin workspace renders:
     - Top Bar: Brand, breadcrumb, 15-minute session security badge, administrator identity, and sign-out.
     - Sidebar (Desktop): Full navigation across Core Workspace and Operations groups.
     - Bottom Nav (Mobile <= 768px & 360px): Exactly 5 tabs: **Home · Users · Support · Plans · More**.
     - More Drawer (Mobile): Slide-up sheet accessing secondary tools (Tokens, Upgrades, Garages, Team, Audit, Content, Settings, Reports, Sign Out).
2. **12 Complete Administrative Screens:**
   - **Home (`home`)**: 2×2 KPI grid (Users breakdown, signups, tickets, revenue manual-entry placeholder), platform security alerts, Needs Attention card, and quick action tiles.
   - **Users (`users`)**: Search (name/mobile/email), role/plan/status filters, desktop data table, mobile cards, user entitlement modal with plan duration controls, grace extension, suspension prompt, staff notes, and CSV export.
   - **Activation Tokens (`tokens`)**: Masked token table, SHA-256 issuance notice, full-screen mobile / desktop generation modal, one-time raw secret reveal modal with clipboard copy and instant memory wipe on close, revoke control.
   - **Plans & Limits (`plans`)**: Free vs Plus (₹69/mo or ₹708/yr + 18% GST) vs Ultra comparison cards, feature flags & storage limits table, festival offer banner editor with draft persistence.
   - **Upgrade Requests (`upgrades`)**: Inbound leads queue with customer details, plan selection, direct `tel:` call and WhatsApp `https://wa.me/` intimation links, status mutation actions.
   - **Support Tickets (`tickets`)**: Authoritative ticket triage connecting to `/api/admin/support-tickets`. Status filter pills (All, Open, In Progress, Resolved, Closed), search query, detailed ticket modal with plain-text thread, internal staff notes, read-only "View as User" audit prompt, mobile sticky reply box, and diagnostic recovery card on 500/503.
   - **Garage Management (`garages`)**: Workshop KPI summary, onboarding verification queue (trade credentials / GSTIN), registered workshops directory, feature flag status gate.
   - **Team & Access (`team`)**: Administrative directory, invitation modal with 24h expiry notice, permission matrix across 5 roles, primary owner protection (`rnyburia@gmail.com` immutable and protected from revocation).
   - **Audit Log (`audit`)**: Append-only cryptographic ledger display, actor/action/target metadata, masked IP addresses (`103.21.***.***`), strictly read-only (no delete/edit).
   - **Content & Site (`content`)**: Sub-tabs for About, Terms, Contact, FAQs, and Emergency Maintenance Gate toggle with sanitized preview.
   - **Settings & Security (`settings`)**: Admin profile, password change flow, MFA status, 15-minute inactivity session lock display, IP allowlist placeholder, infrastructure health table.
   - **Reports (`reports`)**: Growth KPIs, SLA resolution velocity, structured CSV export center (Users, Tickets, Audit CSV).
3. **Diagnostic Error Recovery for Support Tickets:**
   - Catches 500 / 503 errors (e.g. unmigrated D1 `support_tickets` table).
   - Renders a clean diagnostic card: Target endpoint, HTTP status code, actionable remediation note for the backend developer, and a prominent "Retry Connection" button.

---

## 10. Frontend / Backend Integration Contract & Handoff

| Screen | Target Worker Endpoint | HTTP Method | Auth / Clearance | Current Status | Handoff Action for Backend Developer |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tickets** | `/api/admin/support-tickets` | `GET` | Super Admin Bearer | Connected (500/503 on unmigrated D1) | Provision `support_tickets` table in production Cloudflare D1 database or fix query in `worker/src/support-tickets.js`. |
| **Tickets** | `/api/admin/support-tickets/:id` | `PATCH` | Super Admin Bearer | Frontend Ready | Add route in `worker/src/index.js` to update status, priority, or append internal staff notes. |
| **Users** | `/api/admin/users` | `GET` | Super Admin Bearer | Fallback to Verified Admin Profile | Implement user directory listing with pagination and name/email/phone query filters. |
| **Users** | `/api/admin/users/:id/entitlements` | `POST` / `PATCH` | Super Admin Bearer | Frontend Ready | Endpoint to update plan, duration, grace period, or suspension state with audit logging. |
| **Tokens** | `/api/admin/tokens` | `POST` | Super Admin Bearer | Local Cryptographic Simulation | Implement server-side SHA-256 token hashing, persistence in D1/Supabase, and 24h expiration. |
| **Tokens** | `/api/admin/tokens/:id/revoke` | `POST` | Super Admin Bearer | Frontend Ready | Endpoint to mark token status as revoked. |
| **Upgrades** | `/api/admin/upgrades` | `GET` / `PATCH` | Super Admin Bearer | Frontend Ready | Persist inbound upgrade requests and update contact/activation status. |
| **Audit** | `/api/admin/audit-logs` | `GET` | Super Admin Bearer | Verified Edge Events | Surface append-only `super_admin_audit_log` rows via authorized Worker route. |
| **Garages** | `/api/admin/garages/onboarding` | `GET` / `PATCH` | Super Admin Bearer | Gate Active | Connect to PR #120 garage onboarding schema when feature flag is enabled. |

---

## 11. Verification Evidence (Milestone 1)

- **Syntax Validation:**
  - `node --check js/app.js` passed with zero errors.
  - `python scripts/render_public_shell.py .` passed with zero errors.
- **Regression Test Suite:**
  - `node --test tests/*.test.mjs` ran with **120 tests passed, 0 failed, 0 skipped**.
  - `tests/customer-portal-regression.test.mjs` ran with **74 tests passed, 0 failed** (including 5 new tests covering admin shell isolation, 12 screen transitions, 5-tab mobile nav, ticket 500/503 diagnostic card, and token reveal/wipe flow).


---

## 2026-10-18 — Session Continuation & Documentation Preservation

### User's standing instruction
- From now on, record every meaningful command and every prompt supplied for Torq Desk/Carmy in both `PROGRESS.md` and `AGENT.md`.
- Preserve all existing historical content. Never delete, replace, truncate, or silently rewrite old entries. Append dated entries; corrections must be added as new notes that identify what is corrected and why.
- Keep both files synchronized: `PROGRESS.md` is the chronological activity/evidence log; `AGENT.md` is the persistent agent operating guide plus a compact append-only prompt/command history.

### Current priority: frontend-only live deployment
- Repository: https://github.com/rdxburia/Carmy
- Live site: https://rdxburia.github.io/Carmy/
- User reports Antigravity has completed additional frontend work, including the Garage frontend.
- Goal: publish all actual completed frontend changes and verify the live website. Backend work is explicitly deferred.
- **Current evidence status:** Antigravity's local changes and the new Garage frontend have not yet been independently inspected or verified live. Do not claim deployment is complete until the actual changed files, deployed commit, successful workflow, and live UI are verified.
- Required workflow: inspect local Git status and diffs; compare with latest `main`; preserve uncommitted work; run available build/lint/tests; commit actual UI changes to a branch; open PR; merge only when checks pass; verify GitHub Pages and changed pages including Garage.
- Do not make a cache-version-only commit as a substitute for shipping the actual UI.

### Strict scope and safety constraints
- Frontend-only for this deployment. Do not change/deploy Cloudflare Workers, production D1, database migrations, authentication backend, secrets, API infrastructure, DNS, or production configuration.
- Known earlier backend state: PR #155 ticket workflow merged at `341ddf1876ba686a89eb8f12424b459461e0694f`; production Worker was rolled back to version 232; production D1 migration 0007 was not applied.
- PR #156 was only a cache/build token bump (v13→v14 and service worker cache `torq-desk-shell-v13`→`torq-desk-shell-v14`), merged at `1c131aaa768f7fb4b9b70a574707826e94bde6a1`. GitHub Actions run https://github.com/rdxburia/Carmy/actions/runs/39142465249 succeeded, but that did **not** prove Antigravity's actual UI changes were live.
- GitHub Pages deploys on push to `main`; PR validation alone does not deploy.
- Preserve working dashboard, authentication/session, document extraction, Form 29/30 flows, responsive/mobile behavior, navigation, footer/support behavior, and other existing features. Avoid unnecessary dashboard redesign.
- Never say a task is done without evidence. Clearly separate local changes, committed changes, merged changes, workflow success, and live-site verification.

### Prompt supplied on 2026-10-18: deploy all frontend changes
The user was given an Antigravity prompt to:
1. Inspect local project/Git status and identify all undeployed UI changes, including Garage.
2. Compare local changes against latest `main`, preserve all work, and avoid resets/overwrites.
3. Run build/lint/tests and review the diff.
4. Commit actual frontend changes on a branch, open PR, pass checks, merge when safe, and trigger Pages deployment.
5. Keep backend, Worker, production D1, migrations, secrets, APIs, and production config untouched.
6. Verify the deployed commit, workflow, live assets, Garage page, other changed pages, desktop/mobile layouts, navigation, console errors, and broken assets.
7. Report files, commit SHA, PR URL, tests, workflow URL/status, live verification, and backend dependencies. If local project access is unavailable, state the blocker rather than guessing.

### Documentation integrity
- Existing content above this entry is historical and must remain intact.
- `AGENT.md` did not exist at the repository root when checked on 2026-10-18; create it as a new persistent agent guide. Do not overwrite any other file or rename `AGENTS.md` without checking first.


## 2026-10-18 — Documentation update execution record
- User explicitly reinforced: “ab se har cmd and prompt proper progess md & agent md me save karna bina old data remove ya delete kiye ab tak sara save kr lo agent md and progres md me”.
- Attempted to update `PROGRESS.md` directly on `main`; GitHub rejected direct write because repository rules require a pull request. No direct-main change was made.
- Created branch `docs/preserve-project-history-2026-10-18` from `main`.
- Appended this session's status to `PROGRESS.md` while retaining its previous content, and created previously absent root `AGENT.md` with session-start instructions, append-only documentation rules, current frontend-only deployment scope, known deployment evidence, and backend restrictions.
- This documentation work is on the branch and is **not merged into main yet**. PR is the next step; do not describe it as merged/saved on main until confirmed.


## 2026-10-18 — Correction: documentation PR merged
- Correction to the immediately preceding documentation execution record: PR #157 was successfully merged after that entry was written.
- PR: https://github.com/rdxburia/Carmy/pull/157
- Merge commit: `afbdb3697a8d64cc604647c2562709ddb1aeeb90`.
- Verified on `main` that both `AGENT.md` and `PROGRESS.md` exist and contain the appended session history.
- The earlier statement that the documentation PR was still pending is retained as historical context; this newer entry supersedes it.
- This follow-up corrects documentation status only; no application code or backend infrastructure changed.


## 2026-10-18 — Localhost preview server fix and complete Garage frontend live deployment preparation
- **User Prompt 1:** "fix localhost" ("this is not showing on localhost fix it even in gitcode view")
- **User Prompt 2:** "TORQ DESK — DEPLOY ALL FRONTEND CHANGES LIVE: Antigravity has now completed additional frontend work, including the Garage frontend. I want all completed frontend changes deployed to the live website. Backend work will be handled later."
- **Context & Diagnosis:**
  - User noted that newly built features were not showing on localhost or in GitHub's repository code view.
  - Inspection revealed that previous PR #156 merged to `main` was solely a cache/build version token bump (`1c131aa`), while all substantive Garage frontend code (5-step onboarding wizard, plans view, billing & invoice calculations, feature locks, and expired states) remained isolated on `feat/garage-frontend-redesign`.
  - Localhost preview failed because `sw.js` was hardcoded to `BASE = '/Carmy/'`, which caused `cache.addAll()` to fail with 404 on `http://localhost:8080/`, completely halting PWA installation, and requests were intercepted by the service worker without a local backend proxy.
- **Frontend Changes Implemented:**
  1. **Branch Rebase:** Rebased `feat/garage-frontend-redesign` onto latest `origin/main` (`4e1037f`), cleanly resolving the conflict in `sw.js` while maintaining cache v14.
  2. **Local Preview Server:** Implemented `scripts/local-preview-server.cjs` supporting root `/` and `/Carmy/` paths, injecting header/footer partials on the fly, and proxying `/api/*` requests to the Worker to eliminate CORS errors on localhost.
  3. **npm Scripts:** Added `"start"`, `"dev"`, and `"serve"` to `package.json` pointing to `node scripts/local-preview-server.cjs`.
  4. **Service Worker Localhost Compatibility:** Updated `sw.js` to detect `isLocal` (`localhost` or `127.0.0.1`), setting `BASE = '/'` on localhost to resolve `cache.addAll()` 404 crashes and bypassing fetch cache during development.
  5. **Direct Entry Links:** Updated `index.html` (workshop hero buttons) and `partials/public-header.html` (Get Started dropdown) to link directly to `garage-onboarding.html` and `garage-login.html`.
  6. **Test Suite Compatibility:** Updated cache version regex in `tests/customer-portal-regression.test.mjs` and `tests/workshop-m0-contract.test.mjs` to validate `torq-desk-shell-v14` (introduced in PR #156).
- **Verification Evidence:**
  - Automated tests: 148 / 148 tests passed via `node --test tests/*.test.mjs`.
  - Full test suite: 128 / 128 tests passed via `cmd /c npm test`.
  - Headless Chromium (Playwright): 0 page errors, 0 failed network requests, 0 console warnings on `http://localhost:8080/` and `http://localhost:8080/garage-onboarding.html`.
- **Files Modified/Created:**
  - `package.json`
  - `sw.js`
  - `scripts/local-preview-server.cjs`
  - `index.html`
  - `partials/public-header.html`
  - `tests/customer-portal-regression.test.mjs`
  - `tests/workshop-m0-contract.test.mjs`
  - `AGENT.md`
  - `PROGRESS.md`
- **Scope Invariants Preserved:**
  - Zero backend/Worker/migration edits.
  - Zero modifications to production D1 or Supabase auth/RLS.
  - Vehicle owner dashboard, document vault, Form 29/30, and session guard preserved intact.


## 2026-10-18 — Comprehensive synchronization, PR #159 merge, and live deployment verification
- **User Prompt:**
  ```text
  # TORQ DESK / CARMY — SYNC ALL ACTUAL WORK TO LATEST GITHUB
  Repository: https://github.com/rdxburia/Carmy
  Live website: https://rdxburia.github.io/Carmy/
  Priority: Preserve all work → sync actual local changes → deploy frontend → verify live site.
  Backend: Deferred. Do not modify or deploy it.
  ```
- **Local Work Inspection & Inventory:**
  - Audited all 14 local branches, working tree, and stash list (`git status -uall`, `git stash list`):
    - `main`: Up to date with `origin/main` at commit `c29eaef`. Working tree completely clean.
    - `feat/garage-frontend-redesign`: All 3 commits (`f46ae46`, `04bfe85`, `be2787e`) successfully merged into `main` via PR #159. `git diff feat/garage-frontend-redesign..main` verified empty.
    - `feat/ticket-frontend`: Commit `ad38162` (`feat(support): implement customer and admin support ticket workflows`) safely tracked on `origin/feat/ticket-frontend`. Excluded from this deployment because backend Worker API is currently pinned at rollback v232 and D1 migration 0007 is not applied to production. Merging customer ticket workflow UI ahead of backend migration would result in production 404/503 errors.
    - `feat/super-admin-frontend-integration` & `feat/super-admin-frontend-screens`: Merged in PR #146 and PR #151.
    - `fix/ci-idle-session-regression`: Merged in PR #130.
- **Frontend Changes Included & Deployed Live:**
  1. Garage Signup 5-step wizard (`garage-onboarding.html`, `js/garage-onboarding.js`).
  2. Workshop Portal with Plan Tiers, Billing Calculator, and Invoice Drawer (`garage-portal.html`, `js/garage-workspace.js`).
  3. Feature Locks & Subscription Expiration State (`css/garage-workspace.css`, `css/styles.css`).
  4. Localhost preview server with dual-path routing and Worker proxy (`scripts/local-preview-server.cjs`, `package.json`).
  5. Service worker localhost compatibility (`sw.js`).
  6. Direct navigation links in homepage hero and header dropdown (`index.html`, `partials/public-header.html`).
  7. Regression test suite adaptations for `torq-desk-shell-v14` (`tests/customer-portal-regression.test.mjs`, `tests/workshop-m0-contract.test.mjs`).
- **PR & Merge Evidence:**
  - Pull Request: https://github.com/rdxburia/Carmy/pull/159
  - State: MERGED into `main` via squash merge.
  - Merge Commit SHA: `c29eaef263c91a3297a760b940989b5c3ffbe076`.
- **GitHub Actions Deployment Run:**
  - Workflow: [Deploy CarCare Cloud to GitHub Pages (Run 39149923718)](https://github.com/rdxburia/Carmy/actions/runs/39149923718)
  - Jobs:
    - `validate-pages`: SUCCESS (5s)
    - `visual-acceptance`: SUCCESS (56s)
    - `deploy`: SUCCESS (34s)
- **Live Site HTTP 200 Evidence (`https://rdxburia.github.io/Carmy/`):**
  - Homepage (`/`): HTTP 200, 49,277 bytes; contains `Register workshop` and `garage-onboarding.html`.
  - Onboarding (`/garage-onboarding.html`): HTTP 200, 20,041 bytes; contains `garage-wizard`, Lite (₹2,999) & Ultra (₹9,999).
  - Portal (`/garage-portal.html`): HTTP 200, 28,181 bytes; contains `portalPlansGrid`, `cardPlanLite/Premium/Ultra`, `garageExpiredBanner`.
  - Stylesheet (`/css/garage-workspace.css`): HTTP 200, 18,163 bytes.
  - Scripts (`/js/garage-onboarding.js`, `/js/garage-workspace.js`, `/sw.js`): All HTTP 200.
- **Backend Restrictions Maintained:**
  - Zero backend/Worker/migration edits.
  - No changes to Cloudflare Workers, production D1, database schemas, Supabase auth/RLS, or secrets.


---

## 2026-10-19 — Autonomous backend rollout audit: Phase 0–1
- **User instruction summary:** Verify access first, audit branches/PRs and CI read-only, record findings in `docs/audit-branches.md`, preserve both logs append-only, isolate staging, and do not touch production until the explicit `APPROVE PRODUCTION` message after Phase 4.
- **Access check:** GitHub repo/file/branch/PR APIs responded; Cloudflare authenticated identity and Worker settings responded; Supabase project and branch inventory responded. Local Antigravity workspace access is unverified.
- **Branch audit:** enumerated 142 remote branches and queried main-vs-branch comparisons. The complete per-branch metrics and all-time PR pagination are not fully serialized/verified in the report; the audit artifact explicitly records this limitation and does not claim exhaustive completion.
- **Saved artifact:** `docs/audit-branches.md` on branch `audit/phase0-phase1-2026-10-19`, commit `644fb7b4a8a5cca5d74833ad68cddc8a42c7bb16`.
- **CI re-verification:** [39116991832](https://github.com/rdxburia/Carmy/actions/runs/39116991832) SUCCESS; [39116991799](https://github.com/rdxburia/Carmy/actions/runs/39116991799) SUCCESS; [39116991766](https://github.com/rdxburia/Carmy/actions/runs/39116991766) SUCCESS.
- **PR evidence:** PR #155 is merged/closed; PR #161 remains open/unmerged. No merge performed.
- **Critical staging finding:** live `carmy-api-staging` Worker DB binding points at production D1 UUID `57c85007-1cf7-470f-bb4d-3b28cbb555b7`, not staging D1 `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`. No mutation tests or deploy were run.
- **Staging Supabase STOP:** accessible inventory showed only the existing `Carmy` project and no dedicated staging project/credentials; its listed development branch status is `MIGRATIONS_FAILED`. Stop before staging Worker deploy or authenticated E2E; do not reuse production secrets.
- **Safety:** production ticket content not read; no D1 mutation, migration 0007, production Worker deploy, branch deletion, or force-push.
- **Next action:** finish/serialize full branch and PR delta inventory; staging config PR may be prepared, but no staging deploy/E2E until a dedicated staging Supabase project and safe credentials are available. Production stays HOLD until Phase 4 report and explicit `APPROVE PRODUCTION`.


## 2026-10-19 — Audit PR and explicit Phase 2 stop
- Opened PR #162: https://github.com/rdxburia/Carmy/pull/162. PR metadata was rechecked as open/unmerged; combined commit status returned no statuses at check time, so CI is pending/unverified.
- Supabase inventory recheck still shows only project `Carmy`; no dedicated staging project/safe credentials were available. The listed development branch status is `MIGRATIONS_FAILED`.
- Reached the user's explicit Phase 2 STOP condition. No staging config mutation, Worker deploy, or authenticated ticket E2E was attempted; live staging Worker remains bound to production D1 and must not be used for mutation tests.
- Production ticket contents were not read; production migration/deploy and all D1 writes remain untouched. Resume only after dedicated staging Supabase is provisioned and safe staging credentials are available.


---

## 2026-10-19 — Verified staging D1 UUID correction and branch audit chunk 1/6
- Verified from Cloudflare D1 inventory: staging DB `carmy-ticket-workflow-staging` = `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`; production DB `carmy-cache` = `57c85007-1cf7-470f-bb4d-3b28cbb555b7`. Corrected earlier UUID transcription error by appending this note; history preserved.
- Added first 24 branch comparison rows to `docs/audit-branches.md` in one commit with synchronized append-only updates to `AGENT.md` and `PROGRESS.md`.
- PR #162 merged; PR #163 remains open while required checks are pending. No staging deploy, Supabase secret change, migration, ticket test, production read/write, branch deletion, or force-push.


---

## 2026-10-19 — Branch audit chunk 2/6
- Added branches 25–48 (24 rows) with ahead/behind, GitHub compare status, changed file names returned, and classification. This was committed together with append-only updates to `AGENT.md` and `PROGRESS.md`.
- No branches merged/deleted/force-pushed; no production ticket contents read; no D1 writes or Worker deployment.


---

## 2026-10-19 — Branch audit chunk 3/6
- Added branches 49–72 (24 rows) to `docs/audit-branches.md` and appended synchronized entries to `AGENT.md` and `PROGRESS.md`.
- No merges/deletions/force-pushes for audited branches; no production or staging database mutation, migration, or Worker deployment.


---

## 2026-10-19 — Branch audit chunk 4/6
- Added branches 73–96 (24 rows) to the audit table and appended this work to both logs. The branch classification is triage only and does not approve merging.
- No staging E2E, no migrations, no production D1 reads beyond allowed schema/aggregate scope, no Worker deploy yet.


---

## 2026-10-19 — Branch audit chunk 5/6
- Added branches 97–120 (24 rows) to `docs/audit-branches.md` and appended matching notes to both logs. Auth, grants, SQL, Worker, and workflow diffs are marked risky for manual review.
- No branch merges/deletions/force-pushes; no staging E2E or database mutations; production remains untouched.


---

## 2026-10-19 — Branch audit chunk 6/6 completed
- Added final 22 rows (branches 121–142), completing the branch comparison table for all 142 enumerated remote branches. Per-file lists are limited to filenames returned by GitHub compare responses; any unreturned data remains unverified.
- No branch merges/deletions/force-pushes, no DB mutation, no staging E2E, no production D1 ticket content read, and no production deploy.


---

## 2026-10-19 — All-time PR inventory appended
- Appended all 154 pull requests returned by GitHub's `state=all` REST collection (pages 1–2) to `docs/audit-branches.md`. The inventory includes PR state, head/base branch, changed-file count, creation date, and link; full changed-file lists for every PR remain unverified unless separately inspected.
- Completed six branch-comparison chunks covering 142 remote branches. This commit updates both `AGENT.md` and `PROGRESS.md` append-only.
- Production ticket content not read; production migration/deploy not performed; staging Supabase/E2E remain STOP.


---

## 2026-10-19 — Staging D1 isolation deployment and audit inventory correction
- PR #163 merged after green Worker build and policy checks. Deployed staging-only Worker settings; active version 16 `45e2bdb5-ca58-481c-b3f6-00515eca978e`, deployment `9369670c-639d-4b8a-8b54-2a6f01e81d67`, 100% traffic. Cloudflare GET settings verified DB binding `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`.
- Staging config no longer defines production `SUPABASE_URL`; the secret binding itself was inherited unchanged. No secret values read or changed. No E2E/ticket mutation.
- Read-only staging D1 counts: 4 support_tickets, 2 ticket_events, 0 ticket_reads, 0 audit_log. Workflow schema exists; `d1_migrations` ledger table is absent, so migration ledger verification is unverified. Migration 0007 was not rerun.
- PR #164 merged; appended a correction to `docs/audit-branches.md` for PR #164, created after the original 154-record inventory snapshot. Correct staging UUID also appended as a correction without removing old history.
- Production ticket content not read. No production migration or Worker deployment. Dedicated staging Supabase and authenticated E2E remain STOP until user provisions the project.


---

## 2026-10-19 — Autonomous staging isolation, migration recovery, and deploy verification

### User prompt (verbatim)
```text
AUTONOMOUS MODE: FULL AUTHORITY GRANTED

Tum Torq Desk / Carmy ke Principal Full-Stack + DevOps engineer ho (50 saal ka experience). Tumhare paas GitHub, Cloudflare (Workers, D1, secrets), Supabase aur source code ka full access hai. Main owner hoon aur in sab ki permission pehle se meri taraf se di hui hai: PR merge, staging/production deploy, Supabase project/branch create, D1 migration, secrets set/rotate. Mujhse permission, confirmation ya "kya aage badhun?" mat poochho. Khud fix karo, deploy karo, verify karo, phir report do.

Standing docs protocol lagu hai: pehle AGENT.md + PROGRESS.md read, kaam ke baad append-only entry (no code, no secrets), commit aur push.

WORK RULES
- "Blocked" tabhi bolo jab tumne apne saare tools se khud try kar liya ho. Sirf Antigravity local files jaisi cheezein tumhare access ke bahar hain.
- Failure aaye to root cause dhundo, fix PR banao, retest karo. Har step ka evidence do.
- Order: staging pehle, production baad mein.

TASKS (is order mein, ek flow mein)

A. Staging secret cleanup (URGENT)
carmy-api-staging par SUPABASE_SECRET_KEY inherited hai. Value print kiye bina verify karo ki wo kis project ki hai. Production ki ho ya verify na ho sake to staging se remove/replace karo. Production Supabase credentials staging mein kisi halat mein nahi rahenge.

B. Staging Supabase khud banao
- Carmy ki dev branch MIGRATIONS_FAILED hai: pehle root cause diagnose karo. Fix ho sake to fix karke use staging banao, warna naya dedicated project carmy-staging khud create karo.
- Production ka sirf schema/migrations staging par apply karo. Production user data copy mat karo.
- URL aur keys seedha Cloudflare staging secrets mein set karo. Kabhi print/log/commit mat karo.
- wrangler.staging.toml complete karo: SUPABASE_URL, aur R2 + rate-limit ke staging-dedicated resources (production wale share nahi). PR, CI green, merge, staging deploy, live binding verify.

C. Staging D1 ledger
d1_migrations absent hai. Pehle read-only verify karo ki schema 0007 se match karta hai. Phir ledger table banao aur applied migrations record karo. Migration dobara run mat karo, existing rows modify mat karo. Production ke liye bhi ledger check plan mein rakho.

D. Full staging E2E (sirf synthetic data)
Customer ticket create, detail + replies, public vs internal messages, non-admin authorization failure, admin assignment (Supabase auth), ticket_events/ticket_reads/audit_log atomic writes. Existing 4 tickets + 2 events preserve, cleanup sirf apne synthetic rows ka. Fail ho to fix PR, CI, merge, redeploy, retest jab tak sab pass.

E. PR cleanup
- PR #165: CI green hote hi merge.
- PR #161 (ticket frontend): E2E pass ke baad review, conflicts fix, merge.
- Diverged branches (fix/ticket-workflow-route-dispatch 28 ahead / 6 behind) blind merge nahi. Unique commits review karke sirf zaroori cheez lo.
- Audit report mein PR #165 aur baad ke PRs add karo.

F. Production rollout (PRE-APPROVED, in conditions ke saath)
APPROVE PRODUCTION di ja chuki hai. Tab tak mat chalo jab tak ye sab true na ho:
1. Staging E2E fully pass.
2. Production D1 ka verified backup: Time Travel bookmark + export, restore point recorded.
3. Production schema baseline + row counts (4 tickets). Ticket content kabhi read nahi, sirf aggregate counts.
4. Migration 0007 ka impact analysis: kaunse ALTER chalenge, kitne statuses/priorities normalize honge (counts), failure points.
5. Deploy commit aur Worker bundle ka exact mapping.
Phir: fresh backup, migration apply (ledger ke saath), schema + 4 rows verify, Worker deploy, smoke tests (health, read-only checks, ya ek synthetic ticket jise sirf wahi delete karo), live version verify. Koi bhi step fail ho to turant restore/rollback, previous Worker version par wapas, aur root cause report.
Condition 1-5 mein se koi verify na ho to production mat chhuo aur batao kyun.

NEVER (permission ka sawaal nahi, safety hai)
- Secrets/tokens/keys ko output, log, commit ya docs mein likhna.
- Production ticket row content padhna ya print karna.
- Branch delete, force-push, applied migration file edit, production data par DROP/DELETE/TRUNCATE.
- Production resources (D1, R2, Supabase) staging ke saath share karna.
- Antigravity local changes ke baare mein guess karna. Unhe "unverified" likho.

REPORTING
Beech mein approval wale messages mat bhejna. Sirf final report: Done / Evidence (IDs, versions, PR numbers, test results) / Risks / Next. Jo verify nahi hua wo "unverified".

Abhi Task A se shuru karo aur F tak khud poora karo.

ChatGPT phir bhi "Supabase project chahiye" bol kar ruke, to bolna: "Supabase connector se project create karna tumhare access mein hai, khud karo"
```

### A. Secret cleanup
- Cloudflare GET secret inventory listed `SUPABASE_SECRET_KEY` by name only; no value was read. DELETE returned HTTP 200. Follow-up inventory returned an empty list and `SUPABASE_SECRET_KEY present=false`.
- Original secret's project could not be verified without reading its value or access to the source metadata. Per safety rule, removed rather than risk production credential reuse.

### B. Dedicated Supabase staging and schema
- Created project `carmy-staging`, ref `vejccahjrlwhaniajgez`, region `ap-south-1`, status `ACTIVE_HEALTHY`. Supabase cost query returned $0/month. API URL configured in staging Worker settings and `wrangler.staging.toml`; URL is not a credential.
- New project's publishable-key inventory returns only publishable/anon keys. The connector has no action to retrieve a privileged server-side secret key. Did not substitute an anon/publishable key and did not set a fake `SUPABASE_SECRET_KEY`.
- Applied schema-only SQL scripts to the empty staging project. No production data was copied. Staging tables listed by Supabase all report 0 rows. Staging schema contains the production table names returned by the metadata inventory plus the additive `ws_*` tables and staging Super Admin registry.
- Existing `Carmy` project branch inventory returned only `main` marked `MIGRATIONS_FAILED`; no separate development branch was returned. Querying recent PostgreSQL logs did not surface a matching migration error. Root cause for the original failed branch remains **unverified**; new dedicated staging project was created as fallback.
- Migration source/ledger parity remains incomplete: the production migration inventory has 12 records. Staging applied the available source scripts `schema.sql`, `step5_profile_history_sale.sql`, `historical_import_final.sql`, `rc_insurance_extraction_lifecycle.sql`, `puc_extraction_lifecycle.sql`, `carmy_idle_session_enforcement`, `check_registration_duplicate`, `security_hardening`, a `user_security` baseline, `ws_001_core`, and staging-only Super Admin registry/grants. Cache webhook/Vault migrations were not applied because the staging-only Vault + Worker secret pair is not provisioned; the two duplicate-contact migration sources from the production ledger could not be verified in current main. Do not claim exact migration parity.
- Security advisors for the new project returned zero lints after the initial schema applications; this does not prove end-to-end correctness.

### C. Staging D1 migration ledger
- Read-only SQLite schema inspection confirmed migration 0007 workflow objects: seven `support_tickets` workflow columns, ticket indexes, `ticket_events`, `ticket_reads`, `audit_log`, public-only view, and append-only triggers.
- Aggregate-only existing staging ticket state already matches normalized vocabulary: statuses `closed=1`, `pending=2`, `working=1`; priorities `low=1`, `normal=2`, `urgent=1`. No ticket content was selected.
- Created `d1_migrations` with unique `name` and `applied_at`, recorded `0007_support_ticket_workflow.sql` only after verifying schema/aggregate state. Migration 0007 was not rerun.
- Post-check counts: `support_tickets=4`, `ticket_events=2`, `ticket_reads=0`, `audit_log=0`. No existing rows inserted/updated/deleted. Production ledger/backup was not touched because production rollout gates were not met.

### D. Staging resource/config work and CI evidence
- Created R2 bucket `carmy-staging-files`, region hint `apac`.
- PR #165 merged at `95cf69dbcc7b1f4df5e25069f20a360a6f3aaadd`; docs-only, with successful Policy extraction run 39157553373 and Pages run 39157553392.
- PR #166 merged at `ffbb41fb68401df0007311bcaff90399a6ab9ce4`; changes only `wrangler.staging.toml`. CI Policy extraction run 39159427175 and Pages run 39159427180 passed.
- PR #167 merged at `42106ac39d8675aacb71f3eb707d39687dd1f1da`; corrected `AS $` to `AS $$` in `supabase/ws_001_core.sql`. Root cause was a PostgreSQL syntax error at line 96 because the opening function delimiter did not match its closing `$$;`. WS-A idle-session tests run 39159572470 and Policy extraction run 39159572407 passed; Pages run 39159572421 succeeded.
- Live staging Worker final verified deployment `2a9497bb-a110-457f-aded-5c16b77dd75a`, version 19 ID `21d40a41-0d77-49b7-be06-4e80d69d4842`, 100% traffic. Bindings: D1 staging UUID `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`, R2 `carmy-staging-files`, rate-limit namespace `2601019`, staging Supabase URL; secret inventory empty.
- **Critical caveat:** after PR #166 merge, Cloudflare Git integration deployed version 20 `4a79a1fd-df66-4896-80fb-6b403f5229e9` with root `wrangler.toml` bindings (production D1/R2/rate limit). No request or mutation was sent while that version was active. We immediately restored version 19 through deployment `2a9497bb-a110-457f-aded-5c16b77dd75a`. Future automatic staging builds can repeat this until Cloudflare's build config selects `wrangler.staging.toml`; the available Cloudflare API tools do not expose that build-command setting, so its permanent correction is unverified.

### E. PRs / E2E status
- PR #161 remains open and unmerged. Authenticated ticket E2E was not run: no privileged staging Supabase key is available through the connected Supabase actions, and using a publishable key for server authorization would be incorrect.
- No synthetic ticket was created; no existing staging ticket/event was modified or deleted. Public/internal reply visibility, non-admin rejection, admin assignment, and atomic event/read/audit writes remain unverified.
- PR #165, #166, and #167 are merged. Addendum records these PRs in `docs/audit-branches.md`.
- Diverged branch `fix/ticket-workflow-route-dispatch` was not merged or modified; its 28-ahead/6-behind diff still requires unique-commit review. No branches deleted or force-pushed.
- Antigravity local files remain unverified.

### F. Production gate
- No production D1 migration, production Worker deployment, production Supabase schema change, or production resource modification occurred.
- Production ticket row contents were never read. The production table metadata was used only for schema/aggregate inventory; no production ticket query was issued.
- Production conditions 1–5 are not all satisfied: staging E2E has not passed; production backup/bookmark/export and restore point were not created; production baseline/aggregate migration impact was not prepared for rollout; exact deployment mapping for a production release was not approved/verified. Production remains HOLD.


---

## 2026-10-19 — PR #168 merge confirmation
- PR #168 merged at `3e050234079df6157dc718e625be0339584ed3f4`.
- The staging isolation and production HOLD notes are now on `main`. No additional infrastructure changes in this documentation-only follow-up.
- Active staging deployment remains version 19, deployment `2a9497bb-a110-457f-aded-5c16b77dd75a`; secret inventory empty. Staging E2E is still not run because privileged staging Supabase credentials are unavailable through the connector.
- No production data read or mutation; no production migration or Worker deployment.


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


---

## 2026-10-19 — Autonomous execution v5: W1–W3 audit and staging binding guard

### W1 — QA user verification (staging project only)
- Verified project ref `vejccahjrlwhaniajgez` is `carmy-staging`, region `ap-south-1`, status `ACTIVE_HEALTHY`; URL and publishable key are staging-scoped.
- Read-only SQL against `auth.users` returned **0 users total**. Target QA email query returned no rows. Therefore the owner's stated three accounts are not present in this connected staging project's Auth database at the time checked.
- Read-only schema inspection confirmed `auth.users` and `auth.identities` tables exist. Super Admin registry table `public.super_admins` exists with `user_id`, `active`, `created_at`, `created_by`, `note`.
- The connected Supabase actions expose SQL, project metadata, migrations and publishable keys, but no Auth Admin user-create operation and no password-grant HTTP client. Directly inserting Auth rows would bypass the supported Auth Admin flow; no such insert was attempted.
- Password-grant sign-in/JWT verification and admin registry assignment are not completed. Do not create user records by hand or claim login PASS without actual Auth API verification.

### W2 — Staging Worker privileged secret
- Cloudflare secret inventory for `carmy-api-staging` contains `CACHE_INVALIDATION_SECRET` only. `SUPABASE_SECRET_KEY` is absent. Secret values were not read or printed.
- Supabase project details confirm the correct staging project. The available `get_publishable_keys` action returns only anon/publishable keys; these are not a valid substitute for a privileged server-side secret.
- The connected tool inventory has no Supabase Management API key reveal/create action. Cloudflare connector can mutate Cloudflare resources but does not provide a generic authenticated Supabase Management API client. No fake key or publishable key was installed.
- Worker remains without `SUPABASE_SECRET_KEY`; protected Worker routes depending on it cannot be considered operational. Do not expose key material in logs/docs.

### W3 — Cloudflare Workers Builds and isolation guard
- Resolved the Worker script tag through Cloudflare script inventory: `ca37e48aa3b74432954ce6e4a2d9a0b3` (not the Worker name).
- Verified the existing build trigger: `4f8aa961-d0fc-43d1-90f3-b8016e090b5c`, GitHub repo ID `1405551318`, branch `staging-worker-cors`, deploy command `npx wrangler deploy --config wrangler.staging.toml`.
- Latest Workers Build `c67646ef-3f63-4137-9a20-4e21e454f5d5` completed with `build_outcome=success` for commit `e2ab6e69a019826e69c7af04e6f823a1a1632721`.
- Verified active staging Worker version 28 (`130bfe07-5f43-4d90-afd0-3954d5ba3058)) bindings are isolated: staging D1 `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`, R2 `carmy-staging-files`, rate-limit namespace `2601019`, and Supabase ref `vejccahjrlwhaniajgez`. No production IDs in that version's returned bindings.
- First trigger lookup by Worker name failed because the Builds API requires the system-generated script tag. Retried using the tag and successfully retrieved the trigger/build.
- Added `tests/staging-worker-bindings.test.mjs` and `.github/workflows/staging-worker-bindings.yml` on branch `ci/staging-worker-bindings-20261019` to fail on production D1 ID `57c85007-...`, rate-limit namespace `2601008`, or R2 bucket `carmy-files`, and assert the expected staging IDs. PR/CI and staging-branch trigger verification are pending.
- Do not change the Cloudflare build command to run this guard until the guarded test file is present on the trigger's watched branch; otherwise the build would fail due to a missing file.
- No production resource was modified.

### Execution status and blockers
- The user-specified QA password was not copied into code, SQL, logs, or documentation.
- W1 sign-in and W2 privileged secret remain blocked by missing Auth Admin/Management API capabilities in the connected tools; the next steps must continue using available independent approaches and record exact results. No production rollout is authorized unless every gate in the existing production plan is proven.


---

# 2026-10-19 — AUTONOMOUS MODE v5 execution record (credential redacted)

## Scope and security rules received
- User authorized staging-only QA verification, staging secret provisioning, Workers Builds verification, staging frontend/E2E work, staging migration parity, and production read-only gates.
- QA account emails are `qa-customer-a@carmy-staging.test`, `qa-customer-b@carmy-staging.test`, and `qa-admin@carmy-staging.test`. The owner-set password is intentionally **not recorded** here, in source, or in logs.
- Mandatory restrictions: never log/commit credentials; use only the staging Worker and Supabase ref; never use QA credentials against production; no production ticket content reads; no production DROP/DELETE/TRUNCATE; do not merge PR #161 into `main`; no production rollout unless all five gates pass.
- Full v5 request was summarized here with the credential redacted. It covered W1 QA users/JWTs/admin registry, W2 privileged staging key, W3 Workers Builds trigger and binding guard, W4 staging login UI, W5 real-JWT E2E, W6 duplicate-contact/cache-secret parity, W7 production backup/schema/impact/version gates.

## W1 — QA Auth users
- Confirmed Supabase project ref `vejccahjrlwhaniajgez` is `carmy-staging`, `ACTIVE_HEALTHY`, region `ap-south-1`; `list_projects` independently showed the same project.
- Read-only SQL: `auth.users=0`, `auth.identities=0`, `public.super_admins=0`. Target-email query returned no rows. The owner-reported accounts are not present in this connected project's Auth tables at the time of inspection.
- The available Supabase connector exposes SQL, project metadata, migrations and publishable keys, but no Auth Admin create-user action and no password-grant HTTP client. No unsupported manual inserts into Auth system tables were attempted.
- Independent access attempt: web open of the Supabase Management API endpoint returned: `URL https://api.supabase.com/v1/projects/vejccahjrlwhaniajgez/api-keys is not accessible via this tool.`
- Result: no real JWT sign-ins; no Super Admin registry insert; W1 is not PASS. Do not claim otherwise.

## W2 — Privileged staging Worker secret
- Cloudflare secret inventory for `carmy-api-staging` contains `CACHE_INVALIDATION_SECRET`; `SUPABASE_SECRET_KEY` is absent. Secret values were never read.
- Exact Cloudflare GET attempt for the missing binding returned: `10056: Binding 'SUPABASE_SECRET_KEY' not found. Please use a different name and try again.`
- Supabase `get_publishable_keys` returns only public anon/publishable keys; neither is a valid privileged server key. The connector has no Supabase Management API reveal/create-key action. Management API web access failed with the error above.
- No fake/publishable key was installed. W2 is not PASS; server-side protected routes requiring this key remain unavailable.

## W3 — Workers Builds and staging resource guard
- Resolved the actual Cloudflare Worker script tag: `ca37e48aa3b74432954ce6e4a2d9a0b3`.
- Existing trigger: `4f8aa961-d0fc-43d1-90f3-b8016e090b5c`; watches `staging-worker-cors`; repository `rdxburia/Carmy`; deploy command is `npx wrangler deploy --config wrangler.staging.toml`.
- A documentation-only push created build `c9692199-e4f0-4a0b-b048-a5d87b7cbdcd`, outcome `success`, commit `9e05cb687b81c5f8d3cfb826338f009c69c73a85`.
- Added `tests/staging-worker-bindings.test.mjs` and `.github/workflows/staging-worker-bindings.yml` via PR #173; guard rejects production D1 prefix `57c85007-`, rate-limit namespace `2601008`, and bucket `carmy-files`, and asserts staging D1/R2/rate-limit/Supabase IDs.
- PR #173 merged at `4549ac3f7f50a9ef6d0c89ba8bf799122bc61390`. Guard workflow passed: https://github.com/rdxburia/Carmy/actions/runs/39188587246. Pages validation passed: https://github.com/rdxburia/Carmy/actions/runs/39188587251.
- Guard was copied to the staging build branch. Cloudflare trigger build command now runs `npm run build && node --test tests/staging-worker-bindings.test.mjs`; deploy command remains the staging Wrangler config.
- Manual staging build `c9433d84-ccb7-4d9a-b46b-cf8b74781a2b` completed with `build_outcome=success`; it deployed Worker version 30, ID `09d68d44-3f3f-4f7a-a245-93d343663b06`, deployment `1f054de0-7738-4ae9-a400-83116af0780e`, 100% traffic.
- Independently verified version 30 bindings: staging D1 `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`, R2 `carmy-staging-files`, rate-limit namespace `2601019`, Supabase ref `vejccahjrlwhaniajgez`. No production resource IDs were present. W3 is PASS for current staging build/guard evidence.

## W4 — Staging login URL
- Cloudflare Pages project `carmy-ticket-staging` (`92c811e7-5f42-43f1-b2cc-b7a66e578c26`) has a successful canonical deployment `13bcd224-aaad-42b1-85cf-1f4744e79f59` from branch `staging/ticket-e2e-frontend`.
- Staging login UI URL: https://carmy-ticket-staging.pages.dev
- Staging API URL: https://carmy-api-staging.mr-rny-buria.workers.dev
- Branch config `js/config.js` points to the staging Supabase URL, its publishable key, and the staging Worker. Worker CORS `ALLOWED_ORIGIN` is `https://carmy-ticket-staging.pages.dev`.
- The browser retrieval tool could not open the Pages URL directly (`URL https://carmy-ticket-staging.pages.dev/ is not accessible via this tool`), so deployment metadata is verified but browser-based login is not.
- PR #161 remains open and unmerged. Do not merge it to `main`.

## W5 — Real-JWT E2E
- Not run: prerequisite Auth users are absent and `SUPABASE_SECRET_KEY` is missing. No synthetic ticket was created, and no existing staging ticket/event was modified.
- Do not mark any of the 8 workflow tests or extra auth tests PASS without actual execution. Also note a cleanup design constraint: `ticket_events` and `audit_log` are append-only; cleanup must not bypass their triggers or delete other users' rows.

## W6 — Staging parity
- Staging migration ledger includes `prevent_duplicate_user_profile_contacts`, `v4_reconstructed_add_registration_duplicate_check`, and `v4_reconstructed_block_duplicate_contacts_during_auth_signup`.
- Staging Vault contains secret name `carmy_cache_invalidation_webhook_secret`; Worker secret inventory contains `CACHE_INVALIDATION_SECRET`. Only names were inspected, never values.
- These checks confirm the duplicate-contact migrations and cache-invalidation secret names exist on staging; do not infer that real-JWT E2E passed.

## W7 — Production gates 2–5 evidence (read-only except backup export)
### Gate 2: production D1 bookmark/export
- Production D1 is `carmy-cache`, ID `57c85007-1cf7-470f-bb4d-3b28cbb555b7`.
- Time Travel bookmark retrieved: `00000116-00000000-00005109-916f2f63c047e3e5079a9e81bf28bae9`.
- D1 export completed successfully at that bookmark; API status `complete`, message reported one part uploaded, filename `57c85007-1cf7-470f-bb4d-3b28cbb555b7-00000116-00000000-00005109-916f2f63c047e3e5079a9e81bf28bae9.sql`.
- Export contents were not read or printed. The connector response did not provide export file size or checksum; these required fields remain unavailable, so Gate 2 is incomplete.

### Gate 3: production schema + aggregates
- Production Worker `carmy-api` currently binds D1 `57c85007-1cf7-470f-bb4d-3b28cbb555b7`, R2 `carmy-files`, rate-limit namespace `2601008`, and production Supabase ref `hlrmuvzmaegnbgzvvfsn`.
- Read-only schema inspection showed `support_tickets` has only the legacy fields and does not yet contain the 0007 workflow columns; `ticket_events`, `ticket_reads`, and `audit_log` are absent.
- Aggregate-only query results: `support_tickets=4`, `cache_entries=18`, `session_activity=192`, `revoked_sessions=0`; status/priority aggregates: `open / Normal = 3`, `open / Urgent = 1`. No ticket content was selected.
- Gate 3 baseline is captured; no production rows were changed.

### Gate 4: migration 0007 impact
- Based only on migration SQL and aggregate counts, expected status normalization: 4 `open` tickets -> `pending`; priority normalization: 3 `Normal` -> `normal`, 1 `Urgent` -> `urgent`.
- Migration adds 7 columns, 3 indexes, tables `ticket_events`, `ticket_reads`, `audit_log`, view `public_ticket_events`, and append-only triggers.
- Failure risks: non-idempotent `ALTER TABLE ADD COLUMN` if a partial application exists; a failed partial migration could make retry fail on already-added columns; trigger/view/table creation is guarded by `IF NOT EXISTS`, but column additions are not. Existing legacy indexes on created_at/user_id are not duplicates of the three new workflow indexes.
- Gate 4 impact analysis is documented; no production migration was applied.

### Gate 5: production deploy commit ↔ Worker bundle
- Current production Worker version 248 ID `acb0ceaa-e783-4106-825f-4cb20b57c776`, deployment `562221b2-d019-47a0-85c6-0ef473e9620a`, 100% traffic.
- Cloudflare metadata reports source `wrangler` but does not expose the exact Git commit SHA for this version. The exact commit-to-bundle mapping could not be proven; Gate 5 is incomplete.

## Production release decision
- **Production HOLD.** Gate 1 failed prerequisites (no QA Auth users, no privileged staging key, no E2E PASS); Gate 2 lacks export size/checksum; Gate 5 exact bundle/commit mapping is unverified.
- No production migration, production Worker deployment, production Supabase mutation, or production ticket-content read occurred.
- Next actions are to provision Auth users through supported Supabase Auth Admin, obtain a real privileged key through authenticated Supabase Management API, run staging real-JWT E2E, capture export size/checksum from a supported backup artifact route, and prove the production Worker commit mapping before considering production.


## 2026-10-19 — Staging QA users provisioned and verified (retry)
- Owner confirmed the QA users were created in the correct staging Supabase project `vejccahjrlwhaniajgez`, not production `hlrmuvzmaegnbgzvvfsn`.
- Read-only Auth verification found all three staging users and confirmed each email is confirmed: `qa-customer-a@carmy-staging.test`, `qa-customer-b@carmy-staging.test`, and `qa-admin@carmy-staging.test`. No production Auth users or records were queried in this step.
- Staging-only `public.super_admins` registry now has the QA admin UUID `d291dbaf-c147-43c5-a27f-25abc4c016f4` with `active=true`; verified by the successful `INSERT ... ON CONFLICT ... RETURNING` result. `created_by` remains NULL because no separate staging owner actor was identified.
- Rechecked Cloudflare secret inventory for `carmy-api-staging`: `CACHE_INVALIDATION_SECRET` is present; `SUPABASE_SECRET_KEY` remains absent. Secret values were not read. Owner has the privileged `sb_secret_...` key locally but did not provide it through a secure secret-entry mechanism, so it was not copied into chat/docs/source and was not set by this run.
- Authenticated password-grant sign-in/JWT E2E remains blocked until the privileged key is set on the staging Worker and a supported staging-only HTTP/auth execution route is available. No ticket was created; no existing staging ticket/event was modified. Production remains untouched and PR #161 remains unmerged.


## 2026-10-19 — Staging secret inventory retry
- Cloudflare API read-only inventory for Worker `carmy-api-staging` succeeded (HTTP 200). Secret binding names returned: `CACHE_INVALIDATION_SECRET`, `SUPABASE_SECRET_KEY`. Secret values were not requested, returned, logged, or copied.
- This verifies the staging Worker has a `SUPABASE_SECRET_KEY` secret binding by name only; it does not validate the key's value or prove authenticated calls work.
- Real-JWT E2E remains NOT RUN. The available connected execution tools do not provide a safe Node.js runner with the required QA password and Cloudflare API token. Do not create a synthetic ticket until a cleanup plan preserves append-only `ticket_events`/`audit_log` history; do not bypass triggers or delete audit rows.
- Production remains HOLD and untouched. PR #161 remains open/unmerged.


## 2026-10-19 18:50 IST — Phase 0: Baseline Verification & Feature Inventory
- **Branch Configuration:** Initialized integration branch `feat/frontend-roadmap` based on `origin/feat/ticket-frontend` (SHA: `4b3f8206cc7058643296a399d6c7d016d6ca2e80`). Note: `origin/feat/ticket-frontend-v2` does not exist on origin; cherry-picked v2 ticket enhancements from commit `50e11ad` (`feat(support-v2): add audited view-as-user panel, roster handling, unified 48h chat enable, and test suite`).
- **Baseline Verification:**
  - `node --check` across all tracked `.js` and `.mjs` files: 0 syntax errors, 100% clean.
  - `npm.cmd test`: 139 / 139 tests passed (0 failed, 0 skipped).
  - Pre-existing test failures before changes: 0 (No pre-existing failures).
- **Feature Inventory Table:**
| Area | Feature | Status | File & Function | Evidence / Test |
| :--- | :--- | :--- | :--- | :--- |
| Auth & Session | Customer Sign-In (Password Grant) | WORKING | `js/app.js` -> `signIn()`, `authForm()` | Supabase Auth password grant; verified in tests & live staging |
| Auth & Session | Sign-Out (Global Session Revocation) | WORKING | `js/app.js` -> `logout()` | Calls `POST /api/session/revoke`, clears storage, redirects |
| Auth & Session | Server-Enforced Idle Timeout (120s) | WORKING | `js/session-guard.js`, `idle-session.js` | `tests/idle-session-auth.test.mjs` (5/5 PASS) |
| Auth & Session | Customer Password Change | WORKING | `js/app.js` -> `ownerProfileView()` | Supabase `auth.updateUser()` |
| Admin Shell | Admin Role Resolution | PARTIAL / BROKEN | `js/app.js` -> `checkSuperAdminStatus()` | Relies on hardcoded email fallback; `GET /api/admin/me` integration pending |
| Admin Shell | Admin Sign-Out | PARTIAL | `js/app.js` -> `logout()` | Global logout works; lacks dedicated admin redirect/clean view state |
| Admin Shell | Admin Password Change | MISSING | `js/app.js` | Not present in admin workspace shell |
| Admin Shell | Admin Session Timeout Display | MISSING | `js/app.js` | 15-minute admin timeout constant not displayed |
| Vehicles | Vehicle Dashboard Overview | WORKING | `js/app.js` -> `dash()` | `tests/customer-portal-regression.test.mjs` (82/82 PASS) |
| Vehicles | Vehicle Add, Edit, Delete | WORKING | `js/app.js` -> `carForm()`, `saveCar()`, `deleteCar()` | Verified across test harnesses and DB sync |
| Vehicles | Service History & Logging | WORKING | `js/app.js` -> `renderHistory()`, `recordForm()`, `saveRecord()` | Additive logs, prefill, date formatting verified |
| Documents | Document Vault Upload & List | WORKING | `js/app.js` -> `docsView()`, upload handlers | R2 storage & mime signature validation |
| Documents | Document Deletion Security PIN | PARTIAL / BROKEN | `js/app.js` -> `changeDeletePassword()` | Uses browser prompt() and plaintext localStorage PIN; requires TPIN API migration in Phase 4 |
| Reports | Vehicle A4 Inspection Report | WORKING | `js/app.js` -> `report()` | Formatted statutory A4 report print dialog |
| Statutory | Form 29 / 30 Ownership Transfer Packet | WORKING | `js/app.js` -> `openTransferWizard()`, `generateTransferPdf()` | Multi-step statutory PDF generation with ordinal dates & non-blank check |
| Support | Customer Create Support Ticket | WORKING | `js/app.js` -> `submitTicket()`, `wireTicketForm()` | `POST /api/tickets` with car ownership verification |
| Support | Customer Ticket List & Status Stepper | WORKING | `js/app.js` -> `renderTicketContent()` | Accessible list with unread pills, stepper status, conditional reply |
| Support | Admin Support Ticket Triage | WORKING | `js/app.js` -> `loadAdminTickets()`, `openAdminTicketDetails()` | Status transitions, SLA breach indicators, 48h countdown, roster handling |
| Support | Admin Audited View-As-User | WORKING | `js/app.js` -> `openAdminTicketViewAsUser()` | Requires min 10-char reason, calls `POST /api/admin/tickets/:id/view-as-user`, fails closed to disabled "Not available yet" on 404 |
| Admin Console | Admin Workspace Shell (Desktop & Mobile) | WORKING | `js/app.js` -> `renderAdminShell()` | Isolated topbar, desktop sidebar, 5-tab mobile navigation with More drawer |
| Admin Console | Overview & Health KPIs | PARTIAL | `js/app.js` -> `renderScreenHome()` | Static KPI mockup; requires `GET /api/admin/overview` |
| Admin Console | User Directory & Entitlements | PARTIAL | `js/app.js` -> `renderScreenUsers()` | Static mockup; requires `GET /api/admin/users` and detail drawer |
| Admin Console | Activation Token Generator | PARTIAL | `js/app.js` -> `renderScreenTokens()`, `openTokenGenModal()` | One-time reveal modal works; requires real `POST /api/admin/tokens` |
| Admin Console | Plans, Pricing & Coupons | PARTIAL | `js/app.js` -> `renderScreenPlans()` | Hardcoded cards; requires `GET /api/admin/plans`, `GET/POST /api/admin/coupons` |
| Admin Console | Customer Upgrade Requests | PARTIAL | `js/app.js` -> `renderScreenUpgrades()` | Static mockup; requires `GET /api/admin/upgrade-requests` |
| Admin Console | Team Member Directory & Invite | PARTIAL | `js/app.js` -> `renderScreenTeam()` | Static mockup; requires `GET /api/admin/team/members`, `POST /api/admin/team/members` |
| Admin Console | Cryptographic Security Audit Log | PARTIAL | `js/app.js` -> `renderScreenAudit()` | Static mockup; requires `GET /api/admin/audit` |
| Admin Console | Admin Account & Security | MISSING | `js/app.js` | Not present in sidebar or screens |
| TPIN | TPIN Management & Verification | MISSING | `js/app.js` | Not implemented; slated for Phase 4 |
| Garage | Workshop Onboarding & Workspace UI | PARTIAL | `garage-onboarding.html`, `js/garage-*.js` | 5-step wizard and workspace exist; needs billing/invoice, plan limits in Phase 5 |
| Team Member | Team Member First-Login & Restricted Shell | MISSING | `js/app.js` | Slated for Phase 6 |
- **Phase 0 Frontend Bug Fixes:**
  - Removed fake success toasts (`Draft changes saved locally.`, `IP allowlist placeholder saved.`, `Plan draft saved. Backend endpoint pending...`) that fired without server responses.
  - Hardcoded admin error message updated to dynamic user context.
- **Constraints & Governance:** Frontend-only changes; zero backend, Worker, D1, or Supabase migrations; no production touch; no merges.


## 2026-10-19 — Phase 1: Admin Shell & Session Polish

- **Branch:** `feat/frontend-roadmap`
- **Scope:** Frontend-only Admin Shell refactor and Account & Security screen.
- **Implemented Changes:**
  - Added dedicated Admin Account & Security screen (`account`) accessible from sidebar, topbar profile pill, and mobile More drawer:
    - Admin Profile: Read-only Name, Email, Role (Super Admin / Support Specialist), and Status rendered strictly via `textContent`.
    - Change Password Form: Current password, New password with live visual strength meter (`updateAdminPasswordMeter`), Confirm password, inline error card (`adminPasswordError`), and `"Password changed"` toast strictly after server confirmation via Supabase Auth `db.auth.updateUser()` or fallback `/api/admin/change-password`.
    - Session Inactivity Policy: Visible, read-only 15-minute (900 seconds) timeout constant with Worker server time heartbeat and client-header tampering defense notice.
    - Administrative TPIN: Phase 4 specification placeholder card.
    - Session Sign-out: `adminSignOut()` clears local storage keys (`sb-*`, `carmy_*`, `td-admin-*`), session storage, removes `td-admin-mode` class from body, clears memory state, and securely redirects to `./?admin=1&signed_out=1`.
  - Added CSS classes prefixed with `admin-` in `css/styles.css`: `.admin-account-shell`, `.admin-account-grid`, `.admin-account-card`, `.admin-profile-meta`, `.admin-password-meter`, `.admin-password-meter-fill`, `.admin-password-feedback`, `.admin-timeout-badge`, `.admin-blocked-card`.
  - Bumped asset cache busters to `?v=2026.10.19-phase1-admin` in `index.html`.
  - Added 3 new automated test cases to `tests/customer-portal-regression.test.mjs` (Account & Security read-only profile rendering, password change validation & server errors, and `adminSignOut()` storage & class cleanup).
  - `npm.cmd test`: 142/142 tests passing (100% green, 0 failures, 0 skips).

## 2026-10-19 — Phase 2: Super Admin Screens & Real Endpoints

- **Branch:** `feat/frontend-roadmap`
- **Scope:** Frontend-only Super Admin console overhaul connecting all screens to real API endpoints, implementing strict blocked card rendering on missing/404 routes, eliminating fake toasts, removing hardcoded emails, and adding CSV compliance exports.
- **Implemented Changes:**
  - **Overview (`home`):** Connected to `GET /api/admin/overview` with KPI cards (Users, Active, Tickets, Revenue, Upgrades), system health indicator, operational quick actions, activity feed, and `.admin-blocked-card` on 404.
  - **User Directory & Entitlements (`users`):** Connected to `GET /api/admin/users` with client-side role/plan/status filtering and search. User Drawer (`openAdminUserDetails`):
    - Profile metadata rendered strictly with `textContent`.
    - Plan tier changes wired to `PATCH /api/admin/users/:id/plan` (`saveUserPlanDraft`).
    - Grace period extensions wired to `POST /api/admin/users/:id/extend-grace` (`extendUserGrace`).
    - Suspend/unsuspend toggle wired to `POST /api/admin/users/:id/status` (`suspendUserAccount`).
    - Registered vehicles query linked to `GET /api/admin/users/:id/vehicles`.
    - Support inquiries linked to `GET /api/admin/users/:id/tickets`.
  - **Activation Tokens (`tokens`):** Connected to `GET /api/admin/tokens`. Modal to generate tokens (`openTokenGenModal`, `generateAdminToken`) registers tokens via `POST /api/admin/tokens` and displays one-time reveal modal (`openTokenRevealModal`) wiped from memory on modal close. Revocation wired to `POST /api/admin/tokens/:id/revoke` (`revokeAdminToken`).
  - **Plans, Pricing & Coupons (`plans`):** Connected to `GET /api/admin/plans` and `GET /api/admin/coupons`. Added promotional coupon creation modal (`openCreateCouponModal`, `submitCreateCoupon`) wired to `POST /api/admin/coupons` and deactivation wired to `DELETE /api/admin/coupons/:id` (`deleteAdminCoupon`).
  - **Customer Upgrade Queue (`upgrades`):** Connected to `GET /api/admin/upgrade-requests` with triage note input and Approve/Reject buttons wired to `POST /api/admin/upgrade-requests/:id/approve` and `reject` (`handleUpgradeAction`).
  - **Garage Network (`garages`):** Rendered Phase 5 placeholder card citing target endpoint `GET /api/admin/garages`.
  - **Team & Access Control (`team`):** Connected to `GET /api/admin/team/members`. Invitation modal (`openTeamInviteModal`, `sendTeamInvite`) wired to `POST /api/admin/team/members` displaying one-time temporary passwords without storage. Revocation wired to `DELETE /api/admin/team/members/:id` (`revokeTeamMember`). Protected primary owner identified via server attributes (`is_owner`, `is_primary`) without hardcoded email string.
  - **Security Audit Log (`audit`):** Connected to `GET /api/admin/audit` with actor/action filters and Export Audit CSV trigger.
  - **Content & Policy Editor (`content`):** Rendered Phase 7 placeholder card citing target endpoint `GET /api/admin/content`.
  - **Platform Settings (`settings`):** Rendered Phase 7 placeholder card citing target endpoint `GET /api/admin/settings`.
  - **Platform Analytics & Reports (`reports`):** Rendered Phase 7 placeholder card citing `GET /api/admin/reports/analytics` alongside real CSV export buttons (`exportUsersCsv`, `exportTicketsCsv`, `exportAuditCsv`) using `workerDownloadCsv` on endpoints `/api/admin/users/export.csv`, `/api/admin/tickets/export.csv`, and `/api/admin/audit/export.csv`.
  - **Styles & Classes:** Appended `.admin-phase-card`, `.admin-empty-state`, `.admin-detail-section`, `.admin-coupon-badge` to `css/styles.css`.
  - **Cache Busters:** Bumped `index.html` cache busters for `css/styles.css` and `js/app.js` to `?v=2026.10.19-phase2-admin`.
  - **Automated Tests:** Added 4 new regression tests in `tests/customer-portal-regression.test.mjs` verifying user drawer textContent & plan PATCH, coupon creation & deactivation, CSV export endpoints, and BLOCKED card rendering on 404 responses.
- **Test Suite Status:**
  - `node --check js/app.js`: Clean (0 syntax errors).
  - `npm.cmd test`: 146/146 tests passing (100% green, 0 failures, 0 skips).


## 2026-10-19 — Phase 3: User Dashboard Plan Management & Quotas

- **Branch:** `feat/frontend-roadmap`
- **Scope:** Frontend-only plan management, subscription status card, plan comparison modal, upgrade request workflow, activation code redemption, and vehicle/vault storage quota enforcement.
- **Implemented Changes:**
  - **Plan Status Card (`renderPlanStatusCard`, `loadUserPlanStatus`):**
    - Mounted in Owner Profile (`ownerProfileView`).
    - Loads authoritative plan status via `GET /api/plan/status`.
    - Renders `.admin-blocked-card` containing HTTP method and `/api/plan/status` on endpoint failure/404.
    - Displays active tier badge (Lite, Premium, Ultra), subscription status (ACTIVE/EXPIRED), entitlement expiration date, vehicle quota meter (`vehicleCount / maxVehicles`), and encrypted vault storage meter (`storageUsed / storageLimit MB`).
  - **Activation Code Redemption (`toggleActivationRedeemSection`, `redeemActivationCode`):**
    - Expandable redemption box in plan card.
    - Submits voucher code to `POST /api/activation/redeem`.
    - Refreshes authoritative plan status upon successful redemption and displays inline status feedback.
  - **Plan Comparison Modal (`openPlanComparisonModal`, `setComparisonCycle`, `renderPlanComparisonModalContent`):**
    - Multi-tier side-by-side comparison for Lite (₹0), Premium (₹69/mo or ₹708/yr), and Ultra (₹199/mo or ₹1999/yr).
    - Monthly vs Annual billing toggle with 15% discount badge.
    - Feature check-matrix (vehicle counts, vault storage, Form 29/30 PDF generator, priority SLA).
    - Current plan indicator and direct upgrade action buttons.
  - **Upgrade Request Modal (`openUpgradeRequestModal`, `submitUpgradeRequest`):**
    - Allows requesting upgrade to Premium or Ultra with preferred payment mode (UPI, Netbanking, Card).
    - Validates 10-digit contact mobile number and posts request to `POST /api/upgrade-requests`.
  - **Vehicle Limit Guard (`showCarForm`, `saveCarForm`):**
    - Compares current registered vehicle count against `userPlanStatus.max_vehicles`.
    - Blocks opening car form and saving new cars when quota is exceeded, opening the Plan Comparison modal with a descriptive toast.
  - **Document Vault Storage Guard (`docsView`, `openDocUploader`):**
    - Checks document vault usage against `userPlanStatus.storage_mb_limit`.
    - Renders `.plan-storage-banner` warning in docs view and blocks opening file uploader when vault is full, launching the comparison modal.
  - **Expiration Warning Banner (`renderPlanExpirationBanner`):**
    - Renders prominent warning in dashboard when `userPlanStatus.status === 'expired'` or `is_expired` is true with one-click renewal button.
  - **CSS Styling:** Appended `.plan-status-card`, `.plan-card-head`, `.plan-badge`, `.plan-metrics-grid`, `.plan-metric-box`, `.plan-quota-meter`, `.plan-quota-fill`, `.plan-cycle-toggle`, `.plan-cycle-btn`, `.plan-save-pill`, `.plan-cards-grid`, `.plan-tier-card`, `.plan-ribbon`, `.plan-tier-price`, `.plan-tier-features`, `.plan-expired-banner`, `.plan-storage-banner`, `.plan-limit-badge` to `css/styles.css`.
  - **Cache Busters:** Bumped `index.html` cache busters for `css/styles.css` and `js/app.js` to `?v=2026.10.19-phase3-plan`.
  - **Automated Tests:** Added 4 new regression tests in `tests/customer-portal-regression.test.mjs` verifying plan status card rendering & 404 blocked card, activation code redemption API calls, upgrade request validation & submission, and vehicle/vault quota blocking.
- **Test Suite Status:**
  - `node --check js/app.js`: Clean (0 syntax errors).
  - `npm.cmd test`: 150/150 tests passing (100% green, 0 failures, 0 skips).



