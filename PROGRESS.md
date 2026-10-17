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

## 8. STOP CONDITION REACHED

Step 0 is complete. No Super Admin UI, subscriptions, payment gateways, or activation tokens have been built. No commits, merges, or production deployments have been executed.
