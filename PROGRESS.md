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


## 2026-10-19 — AUTONOMOUS MODE v2 execution report

### Completed
- Read current `AGENT.md` and `PROGRESS.md` before continuing.
- Workers Builds trigger deploy command is `npx wrangler deploy --config wrangler.staging.toml`. Trigger `4f8aa961-d0fc-43d1-90f3-b8016e090b5c` is currently restricted to `staging-worker-cors`; API patching a two-branch include list returned Cloudflare `12002 Invalid request body`. Manual build `6190228a-e0fd-495d-b697-d5cb5f3fe0ad` succeeded.
- Active staging Worker: deployment `dfeb81ca-1855-4d35-ba43-58bb668b003a`, version 27 `a975a5b4-b8c0-43a6-9124-2bd3efd31020`, 100% traffic. Bindings verified: staging D1 `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`, staging R2 `carmy-staging-files`, rate limit namespace `2601019`, staging Supabase URL, staging Pages origin, and secret binding `CACHE_INVALIDATION_SECRET`.
- Created Pages project `carmy-ticket-staging` (project id `92c811e7-5f42-43f1-b2cc-b7a66e578c26`), project URL `https://carmy-ticket-staging.pages.dev`. Latest deployment `e5c9b6d2-104c-437e-8cb2-d953176f21d7` succeeded from `staging/ticket-e2e-frontend` at commit `cf8e526fd5fe2784b8de4d0a2b2ed533e2acceef`. Its `js/config.js` uses only `carmy-staging` and `carmy-api-staging`; no production Supabase reference remains in that file.
- Updated PR #161's feature branch with conflict-resolution commits: `2a80aafe5776313ba50aff1aa67e2177097a428f`, `4cc172785838120618da341740cffa76db9a79d9`, `cf0f5aa20034dea47e45326a177ae6e5b00cc09d`. PR #161 remains open/unmerged and GitHub reports `mergeable=true`. Successful checks: `39178768970`, `39178768979`, `39178768875`, `39178768901`; Pages deployment job in the latter run was skipped.
- Generated a new staging-only webhook secret, stored it in Supabase Vault as `carmy_cache_invalidation_webhook_secret` (id `190ae6d2-5a54-4082-826d-8778c8b1d09e`) and in the Worker secret binding `CACHE_INVALIDATION_SECRET`. Value intentionally not recorded. Applied staging-specific cache invalidation SQL pointing only to the staging Worker.
- Applied `prevent_duplicate_user_profile_contacts` as a normalized-phone unique index on `public.user_profiles`. Creating an index on `auth.users` failed with `must be owner of table users`; the auth-signup migration remains unverified/not applied.
- Verified staging D1 aggregate counts after work: `support_tickets=4`, `ticket_events=2`, `ticket_reads=0`, `audit_log=0`, `d1_migrations=1`. No synthetic ticket rows were created and no existing ticket/event rows changed.

### Blockers and remaining gates
- The connected Supabase tool set does not expose a Management API request with a Supabase access token, a privileged API-key reveal/create action, or an Auth Admin create-user action. The connector only exposes project metadata and publishable keys; no publishable key was substituted for a privileged key.
- The three QA users `qa-customer-a@carmy-staging.test`, `qa-customer-b@carmy-staging.test`, and `qa-admin@carmy-staging.test` were not created. Therefore no passwords are issued and real-JWT E2E tests have not been claimed as passing.
- Required manual step: in the `carmy-staging` Supabase dashboard, create a new server-side **Secret API key** under Project Settings → API Keys → Secret keys, then set it directly in Cloudflare Worker `carmy-api-staging` as secret `SUPABASE_SECRET_KEY`. Do not paste the value into chat or commit it. After that, the connected Auth Admin capability/key path must be available to create confirmed staging users; then rerun real-login E2E.
- Production rollout remains blocked: no verified production Time Travel bookmark/export restore point, aggregate schema baseline, migration 0007 impact analysis, or exact commit-to-production-bundle mapping was completed. Do not touch production until every gate passes.
- Antigravity local changes remain unverified. No production ticket content was read and production GitHub Pages deployment was not run.


### Staging-only deployment correction — 19 Oct 2026
- A partial Cloudflare settings PATCH briefly deployed Worker version 25 with only the `ALLOWED_ORIGIN` binding. It was immediately replaced by the previously verified isolated version 24, then by complete version 27. No request or ticket mutation was sent to version 25; that version had no D1, R2, rate-limit, or Supabase binding. Active version 27 was re-verified with the complete staging-only binding set. No production resource was deployed by this correction.


### Final staging Pages verification — 19 Oct 2026
- Documentation-only commits also triggered a staging Pages redeploy. Final deployment `35881032-fed7-4c31-9d68-8b2563e5547c` from branch `staging/ticket-e2e-frontend`, commit `ddc9ca4ac0b27707583e412d30c97bc7805e4085`, completed queued, initialize, clone, build, and deploy stages successfully. Stable project URL remains `https://carmy-ticket-staging.pages.dev`.


## 2026-10-19 — Staging Pages redirect isolation fix
- Root cause: staging Pages deployment commit `fdab41ce49fa2b33ec679fae89c987535cb4f5ec` uploaded `_redirects` rule `/* https://rdxburia.github.io/Carmy/ 301`. This redirected the staging hostname to the production GitHub Pages app; live smoke detected production Supabase URL in the response instead of the staging config.
- Fixed only the `staging/ticket-e2e-frontend` branch `_redirects` file to remove the production redirect. Main branch and production GitHub Pages were not changed. New staging Pages deploy is triggered by commit `cbbcefba6f907259df7f6bd35ca6555ae9e9a0e3`; verify stable URL and config markers after deploy.
