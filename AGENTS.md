# Torq Desk — Persistent Agent Instructions

> These instructions are mandatory. Re-read this file at the start of EVERY step and EVERY new session. Update `PROGRESS.md` at the end of every step. Work one step at a time and stop for the user's "go" after each step.

## Highest-priority workflow rules

1. Treat `AGENTS.md` as the persistent source of project rules and `PROGRESS.md` as the evidence-based status record.
2. Before every step/session, read both files. If either is missing or unreadable, stop and restore the governance files before feature work.
3. Work one step at a time. After each step, report files changed, tests and their exact output, risks/unknowns, and what was NOT RUN; then wait for the user's explicit "go".
4. Never claim work is done without evidence. Use statuses PASS, FAIL, NOT RUN, or BLOCKED and cite the command/output or CI run.
5. If unsure, ask rather than guess. If a later user instruction conflicts with this file, explain the conflict before acting.
6. Smallest safe change. Do not refactor unrelated code.
7. Preserve the approved existing User Dashboard UI. No redesign, restyling, layout changes, or cosmetic refactors unless the user explicitly authorizes them. Preserve desktop and mobile navigation: Overview, Vehicles, Service, Docs, Account, Help. New features must fit the existing design system. A necessary visual bug fix must be minimal; ask before any material visual change.
8. Never delete or overwrite user data. Expiry/downgrade means read-only, never deletion.
9. Never put secrets in frontend code or in the repository. Never expose tokens, passwords, private keys, or credential values in logs/reports.
10. Do not apply database migrations to production. Migrations are new files only in `supabase/migrations/`; never edit old migrations. Migrations must be additive, re-runnable, and dollar-quoting must parse correctly. Validate each migration; staging only, user applies production manually.

## Required verification for every code change

- Run `node --check` on all JavaScript files (including relevant Worker code, scripts, and JavaScript tests).
- Run the existing test suite and every new/affected test.
- Add tests for changed behavior and security boundaries.
- Report exact commands and results. Mark anything not run as NOT RUN; never imply an unrun check passed.
- For database work, validate every SQL file/migration, including dollar-quoting and re-run safety. Never apply production migrations.
- For UI work, preserve baseline screenshots and compare desktop, tablet, and mobile. Test the actual browser flow where feasible; automated tests alone do not establish visual correctness.
- If a required check cannot be run in the available environment, state the blocker and do not claim completion.

## Product and architecture specification

### Roles
- `super_admin`
- `garage_owner`
- `garage_staff`
- `vehicle_owner`
- `support` (later)

### Sign-up and pre-activation access
- Anyone may sign up.
- Mobile number is compulsory, OTP-verified, and unique per account.
- Before activation, vehicle owners automatically start on Free after OTP verification.
- Garage accounts have profile + demo access only until a trial/paid token is redeemed or an admin activates them directly.

### Vehicle owner plans (prices excluding GST)
- Free: 1 vehicle, 50 MB storage, last 3 years of history (older history locked, not deleted), current documents only (RC, insurance, PUC), no archived documents, limited features.
- Plus: 1 vehicle; ₹69/month or ₹59/month billed yearly (₹708/year).
- Family 3: up to 3 vehicles; ₹149/month or ₹129/month billed yearly.
- Family 9: up to 9 vehicles; ₹349/month or ₹299/month billed yearly.
- 10+ vehicles: Contact us.

### Garage plans (prices excluding GST)
All plans provide a one-month free trial for first-time garages.
- Lite: 3 staff including owner, no inventory; ₹2,999 / 6 months, ₹5,399 / 12 months.
- Premium: 6 staff, no inventory; WhatsApp automation, invoice logo, reports, feedback link, job-card photos, estimate approval link; ₹3,299 / 6 months, ₹5,939 / 12 months.
- Ultra: 15 staff, inventory, garage email alias (`name@torqdesk.in`), public garage page, full invoice branding, multi-branch, advanced reports, export; ₹9,999 / 6 months, ₹17,999 / 12 months.
- Limits and prices must live in database tables (`plans`, `plan_limits`, feature flags), never be hard-coded in frontend or API business logic.

### Offers and expiry
- Coupons: admin-configured percentage, start/end, eligible plans, one per account.
- 5% early-renewal discount when renewing within 7 days before expiry.
- Referral days.
- Expiry: 7-day grace, then read-only. Never delete user data.

### Architecture
- Role and plan are enforced server-side (Worker + Postgres RLS). Frontend visibility is not authorization.
- Entitlements include user/org id, plan, status (`pending`, `trial`, `active`, `expired`, `suspended`), `valid_from`, `valid_until`, source (`token`, `admin`, `payment`).
- Activation tokens are generated server-side with secure randomness, shown only once, stored hashed, and include role, plan, validity, single/multi use, token expiry, optional account/mobile binding, and revocation. Redeem is rate-limited and idempotent.
- `audit_log` is append-only (no update/delete) and records actor, action, time, before/after for every admin action.
- Super Admin has a separate `/admin` entry and mandatory two-step verification. Admin APIs verify role from the database, never client-provided role data.
- Enforce vehicle count, storage (R2 usage counter), three-year history window, staff count, and feature limits server-side.

## Known pitfalls — do not repeat

1. Never await Supabase/Worker calls inside `supabase.auth.onAuthStateChange`; this can deadlock sign-in. Defer using `setTimeout` and do async work outside the callback.
2. Worker idle checks use D1 `last_seen`; the client must send `/api/session/heartbeat` while active. Heartbeat network errors must NOT log the user out; only a definite session rejection may.
3. Do not use `Promise.all` for dashboard loading if one optional endpoint failure can blank the page. Handle endpoints independently, preserve previous data on failure, and show retry UI rather than login when session remains valid.
4. Every plan/entitlement admin change must invalidate D1 cache keys immediately; client re-reads entitlements after redemption/activation.
5. SQL functions must use `$$ ... $$` dollar-quoting. `supabase/ws_001_core.sql` currently has a known single-`$` quoting defect; fix it only as a separate, scoped step.
6. `insurance_claims` has historically been written by import but not read. Every new table needs both a read path and UI; avoid write-only tables.
7. Pin CDN library versions; Supabase JS is currently referenced with unpinned `@2`.
8. Escape user-provided text in UI (prefer `textContent` or a proven escaping helper). XSS in Admin views is critical.

## Step plan — strict order; stop after each step

- **Step 0:** Read the repo. Run `node --check` on all JS and all tests. Write `PROGRESS.md` and `AGENTS.md`. Verify Change Password works. Report. No feature code yet.
- **Step 1:** Fix `ws_001_core.sql` dollar-quoting. Validate every SQL file parses.
- **Step 2:** Add migrations for roles, `mobile_verified`, plans, plan limits, entitlements, hashed activation tokens, coupons, audit log, admin MFA flag. Add RLS for each. Tests proving user A can never read user B.
- **Step 3:** Enforce entitlements server-side in Worker (vehicle count, storage, history window, staff, features). Test each limit, including exact boundary.
- **Step 4:** Super Admin login + MFA + `/admin` shell. Test non-admin gets 403 on every admin API.
- **Step 5:** Admin users list (name, role, mobile, email, sign-up date, last login, plan, expiry, status, storage used), search, filters, CSV export, user detail.
- **Step 6:** Admin actions: activate, set plan + validity, extend, suspend, reactivate, notes. Every action writes audit log and invalidates cache.
- **Step 7:** Token generator + user-side Enter Activation Code screen + redeem flow + revoke.
- **Step 8:** Admin support-ticket manager (list, reply, status, priority) on top of existing ticket table.
- **Step 9:** Plans/pricing page, upgrade/contact-us flow, coupon manager, expiry/grace/read-only behavior, expiry reminders.
- **Step 10:** Mobile OTP verification.
- **Step 11 (separate approval required):** Razorpay with verified webhook + automatic GST invoice; Ultra-only email alias and public garage page.

## Every step report must include

1. Files changed.
2. Migration files created (and explicitly state they were NOT applied).
3. Tests written and their exact output.
4. What the user should manually test in a browser.
5. Risks and unknowns.
6. What was NOT RUN.

Do not start the next step until the user explicitly says "go".
