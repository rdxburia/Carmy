# Torq Desk / Carmy — Branch, PR, CI and Environment Audit

**Audit date:** 2026-10-19  
**Repository:** https://github.com/rdxburia/Carmy  
**Base:** `main` (GitHub repository default branch)  
**Method:** Read-only GitHub comparisons, PR metadata, Cloudflare Worker settings, and Supabase project inventory. No production ticket content was read. No database mutations, Worker deployments, merges, branch deletion, or force-pushes were performed during this audit.

## Executive status

- GitHub repository access: verified; repository permissions report pull/push/admin.
- Cloudflare API access: verified.
- Supabase API access: verified.
- Remote branch inventory: **142 branches enumerated** across three pages.
- Main-vs-branch comparisons: comparison API was queried for all 142 branch names. The detailed per-branch ahead/behind + changed-file payload was not preserved as a complete machine-readable table in this report; therefore the requested fully serialized branch-by-branch delta inventory remains **incomplete/unverified here**. This report does not claim exhaustive audit completion.
- PR search returned 100 entries on the first page (#161 through #61) and identified PR #161 as the only open PR in that returned query. The attempted older-date query returned no entries; that is not reliable proof that no older PRs exist. Full all-time PR inventory remains **unverified**.
- Ticket workflow PR #155 is **merged and closed**, despite stale body text claiming it remains open/draft/unmerged. Merge commit: `341ddf1876ba686a89eb8f12424b459461e0694f`.
- PR #161 (`feat/ticket-frontend`) is **open and unmerged**, with UI changes only; do not merge before staging integration/E2E validation.
- Production D1 ticket contents were not read. Earlier read-only schema inspection recorded 4 production ticket rows; this session did not query their contents.
- **Critical isolation finding confirmed live:** `carmy-api-staging` currently binds `DB` to production D1 UUID `57c85007-1cf7-470f-bb4d-3b28cbb555b7`, not staging D1 `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`. Do not run staging mutation tests until this is corrected and verified.
- Supabase inventory exposes one project, `Carmy` (`hlrmuvzmaegnbgzvvfsn`), and no dedicated staging project. Its listed development branch has status `MIGRATIONS_FAILED`. Dedicated staging Supabase credentials/project are **not available/verified**. Do not use production Supabase secrets for staging.
- Production Worker/D1 were not changed. Production migration 0007 was not run.

## Verified PR / CI findings

| Item | Verified result | Evidence |
|---|---|---|
| PR #155 ticket backend | Closed, merged | https://github.com/rdxburia/Carmy/pull/155; merge commit `341ddf1876ba686a89eb8f12424b459461e0694f` |
| PR #161 ticket frontend | Open, unmerged | https://github.com/rdxburia/Carmy/pull/161 |
| CI 39116991832 | Success: automated tests and Worker build | https://github.com/rdxburia/Carmy/actions/runs/39116991832 |
| CI 39116991799 | Success: policy extraction regression | https://github.com/rdxburia/Carmy/actions/runs/39116991799 |
| CI 39116991766 | Success: idle-session regression | https://github.com/rdxburia/Carmy/actions/runs/39116991766 |
| PR #159 Garage frontend | Merged | https://github.com/rdxburia/Carmy/pull/159 |
| PR #157 docs | Merged | https://github.com/rdxburia/Carmy/pull/157 |

CI success is not evidence of authenticated end-to-end behavior against a dedicated staging Worker.

## High-risk / relevant branch comparisons against main

The following are the exact comparison results captured during this audit. Any other branch's exact ahead/behind and full changed-file list should be treated as **unverified in this report**, not inferred.

| Branch | Ahead | Behind | Changed paths returned | Classification |
|---|---:|---:|---|---|
| `fix/ticket-workflow-route-dispatch` | 28 | 6 | `package.json`, ticket workflow tests, `worker/migrations/0007_support_ticket_workflow.sql`, `worker/src/index.js`, `worker/src/ticket-workflow.js`, `wrangler.staging.toml` | **Risky / needs review** — diverged; no blind merge |
| `feat/support-ticket-workflow-backend` | 3 | 6 | migration 0007 and Worker ticket workflow files | **Risky / needs review** — diverged |
| `fix/support-tickets-fail-closed` | 2 | 10 | support ticket Worker code/tests | **Risky / needs review** — auth/fail-closed semantics |
| `feat/ticket-frontend` | 1 | 0 | `css/styles.css`, `js/app.js`, customer portal regression tests | **Needs review / hold** — PR #161 open; dependent backend not production-ready |
| `fix/step0b-password-and-sql-main` | 5 | 7 | auth/password JS, service worker, tests | **Needs review** — auth/session-sensitive |
| `fix/admin-logout-and-invite-reality` | 17 | 7 | app/auth, service worker, Supabase SQL, Worker admin invites, tests | **Risky / needs review** |
| `feat/super-admin-backend-auth` | 15 | 16 | Super Admin Worker auth, SQL migration, tests, package/workflow | **Risky / needs review** |
| `fix/super-admin-grants-least-privilege` | 1 | 15 | Supabase grant migration | **Risky / needs review** |
| `feature/firebase-default-dual-auth` | 10 | 95 | auth/config and contract tests | **Risky / stale diverged auth branch** |
| `feature/rc-insurance-auto-extraction` | 12 | 515 | document extraction, Supabase lifecycle SQL, Worker routes | **Risky / very stale diverged branch** |
| `fix/rc-insurance-puc-extraction-live-bugs` | 33 | 513 | document extraction, PUC/insurance Worker routes, SQL | **Risky / very stale diverged branch** |
| `fix/api-rate-limiting` | 3 | 516 | Worker index and Wrangler config | **Risky / stale infrastructure branch** |
| `security/r2-file-signature-validation` | 1 | 403 | R2 validation workflow | **Needs security review / stale** |
| `fix/foreign-key-indexes` | 1 | 518 | Supabase security SQL | **Needs database/security review / stale** |
| `fix/performance-rls-hardening` | 1 | 519 | Supabase security SQL | **Needs database/security review / stale** |
| `feat/garage-frontend-redesign` | 3 | 2 | Garage frontend, preview server, package, docs | **Already delivered via PR #159, but branch diverged; do not merge branch wholesale** |
| `docs/preserve-project-history-2026-10-18` | 4 | 4 | `AGENT.md`, `PROGRESS.md` | **Historical docs branch; PR #157 merged; do not merge branch wholesale** |
| `main` | 0 | 0 | none | **Current baseline** |

### Comparison-based classification rules

- **Already merged:** only when a matching merged PR/merge commit was verified. A branch can still diverge after its feature PR was merged.
- **Safe to merge:** none approved by this audit. This requires current diff review and green CI on the exact head.
- **Needs review:** diverged branch with UI, test, or behavior changes not proven fully present in main.
- **Risky:** authentication, authorization, SQL/migrations, Worker routing/config, secrets, security, or production infrastructure changes; or significantly stale divergence.
- **Stale:** zero unique commits against main and materially behind, or old diverged branch with hundreds of commits behind. Stale does not mean safe to delete.
- **Branch deletion / force-push:** none performed.

## Full remote branch-name inventory (142)

The following branch names were returned by GitHub branch search across three pages. The inventory itself is verified; the complete per-branch comparison metrics are not serialized above.

```text
backup-before-carcarecloud-logo-test-20261008
branding/motordesk-rebrand
branding/torqdesk-identity
chore/bump-build-v10-transfer-security
chore/publish-frontend-v14
chore/step0-project-governance
content/clarify-private-records-terms
design/motordesk-login-motion-copy
design/torqdesk-blue-car-landing
design/torqdesk-marketing-home-loading-brand
design/torqdesk-unified-blue-ui
docs/correct-merge-status-2026-10-18
docs/preserve-project-history-2026-10-18
docs/sync-frontend-deployment-verification-2026-10-18
feat/fix-data-loading-and-dashboard-ux
feat/full-workshop-demo-features
feat/garage-demo-portal
feat/garage-frontend-redesign
feat/home-first-screen-audience-switch
feat/home-first-screen-audience-switch-v2
feat/issue-17-logo-preview
feat/mandatory-production-fixes
feat/modern-report-preparation-ui
feat/multipage-policy-extraction
feat/owner-garage-auth-entrypoints
feat/phase-bc-docvault-footer-homepage
feat/super-admin-backend-auth
feat/super-admin-frontend-integration
feat/super-admin-frontend-screens
feat/support-ticket-workflow-backend
feat/ticket-frontend
feat/torqdesk-phase1-public-site
feat/workshop-m0-foundations
feature/firebase-default-dual-auth
feature/motordesk-about-terms-contact
feature/motordesk-real-info-pages
feature/rc-insurance-auto-extraction
fix/a4-report-clean-header-footer
fix/account-security-collapsible-ui
fix/admin-logout-and-invite-reality
fix/api-cors-health-hardening
fix/api-diagnostic-auth-fetch
fix/api-rate-limiting
fix/cache-webhook-runtime-error
fix/car-edit-modal-background
fix/chola-chassis-stray-space
fix/ci-idle-session-regression
fix/cloudflare-preview-build
fix/customer-dashboard-auth-load-resilience
fix/customer-session-persistence-and-dashboard
fix/daily-backup-and-public-shell
fix/dashboard-drawer-state
fix/dashboard-footer-links
fix/dashboard-header-actions
fix/dashboard-report-print-dialog
fix/document-classifier-report-print
fix/document-messages-english
fix/document-ui-reactive-state
fix/duplicate-registration-guard
fix/footer-info-links-real-pages
fix/footer-real-page-links
fix/foreign-key-indexes
fix/form-29-30-pdf-ownership-transfer
fix/garage-actions-and-owner-entry
fix/garage-actions-and-remove-demo-labels
fix/garage-demo-cache-refresh
fix/garage-demo-form-actions
fix/garage-demo-interactions
fix/garage-live-cache-and-actions
fix/global-info-links-functional
fix/help-nav-cache-visual-polish
fix/help-support-production-and-dashboard-polish
fix/info-links-inline-handler-syntax
fix/insurance-dynamic-lifecycle
fix/insurance-pdf-reading-order
fix/issue-3-documents-report-styles
fix/issue-6-cache-secret-rotation
fix/issue-6-private-cache-trigger
fix/issue-9-logo-behavior
fix/issue-20-a4-report-layout
fix/issue-20-report-dom-nesting
fix/live-super-admin-cache-bust-v12
fix/login-js-syntax-after-report-ui
fix/motordesk-footer-always-visible-popup
fix/motordesk-footer-popup-click-mobile
fix/motordesk-info-tabs-and-clicks
fix/motordesk-login-story-car-spacing
fix/motordesk-login-viewport-password-toggle
fix/motordesk-mobile-auth-footer-stability
fix/motordesk-mobile-footer-popup-cleanup
fix/motordesk-popup-readable
fix/motordesk-popup-readable-content
fix/multipage-policy-ocr-extraction
fix/native-vehicle-report-print
fix/password-change-isolated-verification
fix/password-toggle-clean-rebase
fix/password-toggle-grid-alignment
fix/password-toggle-proper-input-anchor
fix/performance-rls-hardening
fix/print-wait-screen-clean-footer
fix/publish-torqdesk-info-pages
fix/puc-route-syntax
fix/rc-insurance-puc-extraction-live-bugs
fix/refresh-print-tab-assets
fix/remove-demo-copy-from-workshop-pages
fix/remove-drawer-info-links-clean
fix/rename-garage-workspace-assets
fix/report-print-in-separate-window
fix/report-print-pagination
fix/resolve-print-css-conflict
fix/restore-service-log-auto-description
fix/security-idle-timeout-ws-a
fix/shared-public-shell-nav-glossary
fix/sitewide-inter-font
fix/sitewide-readable-type
fix/step0b-password-and-sql-main
fix/super-admin-grants-least-privilege
fix/super-admin-persistent-mode
fix/super-admin-stale-service-worker-cache
fix/super-admin-workspace-and-ticket-errors
fix/support-tickets-fail-closed
fix/ticket-workflow-route-dispatch
fix/torqdesk-auth-modal-dashboard-qa
fix/torqdesk-logo-wordmark-spacing
fix/torqdesk-tagline-popup
fix/ws-a-server-enforced-idle
fix/ws-a-server-enforced-idle-v2
fix/xp-print-progress-live
fix-logo-placement-duplicate-text
main
perf/motordesk-report-pdf
perf/vehicle-report-page-render
repair/ui-performance-audit
security/r2-file-signature-validation
security/r2-signature-validation-ci
security/ws-a-server-authoritative-idle-session
task3-current-main
task3-report-insurance
temp-carcarecloud-logo-test
ui/motordesk-global-footer-links
ui/remove-info-links-from-mobile-drawer
ui/restore-motordesk-info-popup
```

## Migration 0007 risk review (static source review only)

File: `worker/migrations/0007_support_ticket_workflow.sql`

- Seven `ALTER TABLE support_tickets ADD COLUMN` statements are not idempotent; rerunning without a reliable migration ledger/schema gate can fail on duplicate columns.
- The migration performs data-changing `UPDATE` statements normalizing existing ticket statuses and priorities. This is not schema-only, even though it does not delete ticket rows.
- Creates indexes, `ticket_events`, `ticket_reads`, `audit_log`, `public_ticket_events`, and append-only triggers.
- The migration has not been run against production in this audit. No production ticket row content was read.
- Before production: verify the D1 migration ledger and schema; capture safe counts/aggregate status-priority counts; obtain and verify a recoverable backup; test restoration; validate all normalized-value mappings and the exact Worker bundle/commit mapping.

## Next action / hard stop

1. Continue only with a staging-only configuration PR after the branch/PR audit artifact is reviewed for omissions.
2. The live staging Worker binding must be changed to staging D1 and re-read from Cloudflare before any mutation test.
3. **STOP before staging Worker deploy/E2E:** no dedicated staging Supabase project or safe staging credentials were found. Do not point staging at the production Supabase project and never copy production secrets.
4. Production D1 migration and production Worker deploy remain **HOLD** until the explicit user message `APPROVE PRODUCTION` after the Phase 4 report.


## Full branch comparison table — chunk 1/6 (24 branches)

Compared each branch to `main` using GitHub compare API. Classifications are triage only, not merge approvals. File names are the exact paths returned by GitHub. Branches with zero unique commits are classified stale, not safe to delete.

| Branch | Ahead | Behind | Status | Changed files returned | Classification |
|---|---:|---:|---|---|---|
| `backup-before-carcarecloud-logo-test-20261008` | 0 | 523 | behind | none returned | **stale (zero unique commits)** |
| `branding/motordesk-rebrand` | 0 | 363 | behind | none returned | **stale (zero unique commits)** |
| `branding/torqdesk-identity` | 14 | 295 | diverged | about.html, assets/carcarecloud-icon.svg, contact.html, css/premium.css, favicon.svg, icons/apple-touch-icon-180.svg, icons/icon-192.svg, icons/icon-512.svg, index.html, terms.html | **stale + needs review (large divergence)** |
| `chore/bump-build-v10-transfer-security` | 0 | 18 | behind | none returned | **stale (zero unique commits)** |
| `chore/publish-frontend-v14` | 2 | 6 | diverged | index.html, sw.js | **needs review; frontend/service-worker** |
| `chore/step0-project-governance` | 38 | 39 | diverged | .github/workflows/step0b-verification.yml, AGENTS.md, PROGRESS.md, index.html, js/app.js, js/document-extraction.js, js/garage-workspace.js, js/password-change.js, scripts/test-garage-workspace.mjs, supabase/ws_001_core.sql, tests/document-extraction-quality.test.cjs, tests/password-change.test.mjs | **risky / auth-SQL-workflow review** |
| `content/clarify-private-records-terms` | 0 | 329 | behind | none returned | **stale (zero unique commits)** |
| `design/motordesk-login-motion-copy` | 0 | 360 | behind | none returned | **stale (zero unique commits)** |
| `design/torqdesk-blue-car-landing` | 11 | 294 | diverged | assets/torqdesk-icon.svg, assets/torqdesk-logo.svg, css/premium.css, favicon.svg, icons/apple-touch-icon-180.svg, icons/icon-192.svg, icons/icon-512.svg, index.html | **stale + needs review** |
| `design/torqdesk-marketing-home-loading-brand` | 1 | 276 | diverged | index.html | **stale + needs review** |
| `design/torqdesk-unified-blue-ui` | 3 | 273 | diverged | css/premium.css, index.html | **stale + needs review** |
| `docs/correct-merge-status-2026-10-18` | 2 | 4 | diverged | AGENT.md, PROGRESS.md | **needs review (docs-only)** |
| `docs/preserve-project-history-2026-10-18` | 4 | 5 | diverged | AGENT.md, PROGRESS.md | **merged PR #157 exists; residual diff needs review** |
| `docs/sync-frontend-deployment-verification-2026-10-18` | 1 | 2 | diverged | AGENT.md, PROGRESS.md | **needs review (docs-only)** |
| `feat/fix-data-loading-and-dashboard-ux` | 0 | 49 | behind | none returned | **stale (zero unique commits)** |
| `feat/full-workshop-demo-features` | 0 | 125 | behind | none returned | **stale (zero unique commits)** |
| `feat/garage-demo-portal` | 0 | 129 | behind | none returned | **stale (zero unique commits)** |
| `feat/garage-frontend-redesign` | 3 | 3 | diverged | AGENT.md, PROGRESS.md, css/garage-workspace.css, css/styles.css, garage-onboarding.html, garage-portal.html, index.html, js/garage-onboarding.js, js/garage-workspace.js, package.json, partials/public-header.html, scripts/local-preview-server.cjs, sw.js, tests/customer-portal-regression.test.mjs, tests/garage-redesign.test.mjs, tests/workshop-m0-contract.test.mjs | **merged PR #159 exists; residual diff; do not merge wholesale** |
| `feat/home-first-screen-audience-switch` | 13 | 208 | diverged | .github/workflows/pages.yml, css/home-v2.css, docs/homepage-v2-self-critique.md, index.html, js/public-site.js, partials/public-header.html, scripts/capture-home-screenshots.mjs, scripts/check-pages-output.sh | **stale + needs review (workflow/frontend)** |
| `feat/home-first-screen-audience-switch-v2` | 0 | 202 | behind | none returned | **stale (zero unique commits)** |
| `feat/issue-17-logo-preview` | 0 | 543 | behind | none returned | **stale (zero unique commits)** |
| `feat/mandatory-production-fixes` | 0 | 42 | behind | none returned | **stale (zero unique commits; name alone not evidence)** |
| `feat/modern-report-preparation-ui` | 2 | 380 | diverged | index.html, js/app.js | **stale + needs review** |
| `feat/multipage-policy-extraction` | 36 | 39 | diverged | .github/workflows/step0b-verification.yml, AGENTS.md, PROGRESS.md, index.html, js/app.js, js/document-extraction.js, js/garage-workspace.js, js/password-change.js, scripts/test-garage-workspace.mjs, supabase/ws_001_core.sql, tests/document-extraction-quality.test.cjs, tests/password-change.test.mjs | **risky / auth-SQL-workflow review** |


## Full branch comparison table — chunk 2/6 (24 branches)

| Branch | Ahead | Behind | Status | Changed files returned | Classification |
|---|---:|---:|---|---|---|
| `feat/owner-garage-auth-entrypoints` | 0 | 140 | behind | none returned | **stale (zero unique commits)** |
| `feat/phase-bc-docvault-footer-homepage` | 0 | 50 | behind | none returned | **stale (zero unique commits)** |
| `feat/super-admin-backend-auth` | 15 | 17 | diverged | .github/workflows/super-admin-pr-checks.yml, docs/super-admin-backend-auth.md, package.json, supabase/migrations/20261017160000_create_super_admin_registry.sql, tests/super-admin-auth.test.mjs, tests/support-tickets-worker.test.mjs, worker/src/index.js, worker/src/super-admin.js, worker/src/support-tickets.js | **risky / auth-SQL-Worker workflow review** |
| `feat/super-admin-frontend-integration` | 6 | 15 | diverged | css/styles.css, index.html, js/app.js, tests/customer-portal-regression.test.mjs | **needs review (frontend diverged)** |
| `feat/super-admin-frontend-screens` | 1 | 11 | diverged | PROGRESS.md, css/styles.css, index.html, js/app.js, tests/customer-portal-regression.test.mjs | **needs review (frontend/docs diverged)** |
| `feat/support-ticket-workflow-backend` | 3 | 7 | diverged | worker/migrations/0007_support_ticket_workflow.sql, worker/src/index.js, worker/src/ticket-workflow.js | **risky / migration and Worker routes** |
| `feat/ticket-frontend` | 1 | 1 | diverged | css/styles.css, js/app.js, tests/customer-portal-regression.test.mjs | **needs review / hold for backend staging** |
| `feat/torqdesk-phase1-public-site` | 0 | 236 | behind | none returned | **stale (zero unique commits)** |
| `feat/workshop-m0-foundations` | 0 | 154 | behind | none returned | **stale (zero unique commits)** |
| `feature/firebase-default-dual-auth` | 10 | 96 | diverged | index.html, js/app.js, js/config.js, tests/workshop-m0-contract.test.mjs | **risky / authentication branch stale** |
| `feature/motordesk-about-terms-contact` | 0 | 346 | behind | none returned | **stale (zero unique commits)** |
| `feature/motordesk-real-info-pages` | 4 | 330 | diverged | about.html, contact.html, index.html, terms.html | **stale + needs review** |
| `feature/rc-insurance-auto-extraction` | 12 | 516 | diverged | css/premium.css, index.html, js/app.js, js/document-extraction.js, supabase/rc_insurance_extraction_lifecycle.sql, worker/src/index.js, worker/src/insurance.js, worker/src/vehicles.js | **risky + stale / document extraction and SQL** |
| `fix/a4-report-clean-header-footer` | 5 | 382 | diverged | index.html, js/app.js | **stale + needs review** |
| `fix/account-security-collapsible-ui` | 0 | 23 | behind | none returned | **stale (zero unique commits)** |
| `fix/admin-logout-and-invite-reality` | 17 | 8 | diverged | index.html, js/app.js, package.json, supabase/ws_001_core.sql, sw.js, tests/admin-invite-session.test.mjs, tests/customer-portal-regression.test.mjs, tests/idle-session-auth.test.mjs, tests/workshop-m0-contract.test.mjs, worker/migrations/0005_revoked_sessions.sql, worker/migrations/0006_admin_team_invites.sql, worker/src/admin-invites.js, worker/src/auth.js, worker/src/index.js, wrangler.toml | **risky / auth, migrations, Worker and config** |
| `fix/api-cors-health-hardening` | 2 | 518 | diverged | worker/src/index.js, worker/src/response.js | **risky + stale / Worker routing** |
| `fix/api-diagnostic-auth-fetch` | 1 | 569 | diverged | api-test.html | **stale + needs review** |
| `fix/api-rate-limiting` | 3 | 517 | diverged | worker/src/index.js, wrangler.toml | **risky + stale / infra config** |
| `fix/cache-webhook-runtime-error` | 0 | 566 | behind | none returned | **stale (zero unique commits)** |
| `fix/car-edit-modal-background` | 1 | 560 | diverged | css/styles.css | **stale + needs review** |
| `fix/chola-chassis-stray-space` | 0 | 443 | behind | none returned | **stale (zero unique commits)** |
| `fix/ci-idle-session-regression` | 1 | 53 | diverged | js/app.js, tests/customer-portal-regression.test.mjs, worker/src/index.js | **risky / regression and Worker changes** |
| `fix/cloudflare-preview-build` | 0 | 563 | behind | none returned | **stale (zero unique commits)** |


## Full branch comparison table — chunk 3/6 (24 branches)

| Branch | Ahead | Behind | Status | Changed files returned | Classification |
|---|---:|---:|---|---|---|
| `fix/customer-dashboard-auth-load-resilience` | 0 | 74 | behind | none returned | **stale (zero unique commits)** |
| `fix/customer-session-persistence-and-dashboard` | 0 | 55 | behind | none returned | **stale (zero unique commits)** |
| `fix/daily-backup-and-public-shell` | 0 | 78 | behind | none returned | **stale (zero unique commits)** |
| `fix/dashboard-drawer-state` | 0 | 536 | behind | none returned | **stale (zero unique commits)** |
| `fix/dashboard-footer-links` | 1 | 271 | diverged | index.html | **stale + needs review** |
| `fix/dashboard-header-actions` | 3 | 561 | diverged | css/premium.css, index.html, js/app.js | **stale + needs review** |
| `fix/dashboard-report-print-dialog` | 1 | 395 | diverged | index.html, js/app.js | **stale + needs review** |
| `fix/document-classifier-report-print` | 0 | 504 | behind | none returned | **stale (zero unique commits)** |
| `fix/document-messages-english` | 0 | 456 | behind | none returned | **stale (zero unique commits)** |
| `fix/document-ui-reactive-state` | 1 | 562 | diverged | js/app.js | **stale + needs review** |
| `fix/duplicate-registration-guard` | 0 | 46 | behind | none returned | **stale (zero unique commits)** |
| `fix/footer-info-links-real-pages` | 0 | 325 | behind | none returned | **stale (zero unique commits)** |
| `fix/footer-real-page-links` | 2 | 272 | diverged | css/premium.css, index.html | **stale + needs review** |
| `fix/foreign-key-indexes` | 1 | 519 | diverged | supabase/security_hardening.sql | **risky + stale / database security SQL** |
| `fix/form-29-30-pdf-ownership-transfer` | 0 | 20 | behind | none returned | **stale (zero unique commits)** |
| `fix/garage-actions-and-owner-entry` | 5 | 86 | diverged | garage-onboarding.html, js/garage-onboarding.js, supabase/workshop_onboarding_migration.sql, worker/src/workshop-onboarding.js | **risky / workshop SQL and Worker** |
| `fix/garage-actions-and-remove-demo-labels` | 10 | 113 | diverged | garage-login.html, garage-portal.html, js/garage-demo-login.js, js/garage-demo-portal.js, sw.js | **stale + needs review** |
| `fix/garage-demo-cache-refresh` | 0 | 116 | behind | none returned | **stale (zero unique commits)** |
| `fix/garage-demo-form-actions` | 3 | 115 | diverged | garage-portal.html, js/garage-demo-portal.js, sw.js | **stale + needs review** |
| `fix/garage-demo-interactions` | 0 | 120 | behind | none returned | **stale (zero unique commits)** |
| `fix/garage-live-cache-and-actions` | 2 | 119 | diverged | garage-portal.html, js/garage-demo-portal.js | **stale + needs review** |
| `fix/global-info-links-functional` | 0 | 335 | behind | none returned | **stale (zero unique commits)** |
| `fix/help-nav-cache-visual-polish` | 0 | 40 | behind | none returned | **stale (zero unique commits)** |
| `fix/help-support-production-and-dashboard-polish` | 0 | 46 | behind | none returned | **stale (zero unique commits)** |


## Full branch comparison table — chunk 4/6 (24 branches)

| Branch | Ahead | Behind | Status | Changed files returned | Classification |
|---|---:|---:|---|---|---|
| `fix/info-links-inline-handler-syntax` | 0 | 333 | behind | none returned | **stale (zero unique commits)** |
| `fix/insurance-dynamic-lifecycle` | 1 | 515 | diverged | worker/src/insurance.js | **risky + stale / Worker behavior** |
| `fix/insurance-pdf-reading-order` | 0 | 445 | behind | none returned | **stale (zero unique commits)** |
| `fix/issue-3-documents-report-styles` | 0 | 570 | behind | none returned | **stale (zero unique commits)** |
| `fix/issue-6-cache-secret-rotation` | 0 | 526 | behind | none returned | **stale (zero unique commits)** |
| `fix/issue-6-private-cache-trigger` | 0 | 524 | behind | none returned | **stale (zero unique commits)** |
| `fix/issue-9-logo-behavior` | 0 | 556 | behind | none returned | **stale (zero unique commits)** |
| `fix/issue-20-a4-report-layout` | 0 | 530 | behind | none returned | **stale (zero unique commits)** |
| `fix/issue-20-report-dom-nesting` | 0 | 528 | behind | none returned | **stale (zero unique commits)** |
| `fix/live-super-admin-cache-bust-v12` | 4 | 9 | diverged | index.html, sw.js, tests/customer-portal-regression.test.mjs, tests/workshop-m0-contract.test.mjs | **needs review / service-worker cache** |
| `fix/login-js-syntax-after-report-ui` | 2 | 379 | diverged | index.html, js/app.js | **stale + needs review** |
| `fix/motordesk-footer-always-visible-popup` | 3 | 319 | diverged | css/premium.css, index.html | **stale + needs review** |
| `fix/motordesk-footer-popup-click-mobile` | 2 | 314 | diverged | index.html, js/info-modal.js | **stale + needs review** |
| `fix/motordesk-info-tabs-and-clicks` | 0 | 340 | behind | none returned | **stale (zero unique commits)** |
| `fix/motordesk-login-story-car-spacing` | 0 | 352 | behind | none returned | **stale (zero unique commits)** |
| `fix/motordesk-login-viewport-password-toggle` | 0 | 355 | behind | none returned | **stale (zero unique commits)** |
| `fix/motordesk-mobile-auth-footer-stability` | 2 | 316 | diverged | css/premium.css, js/app.js | **stale + needs review** |
| `fix/motordesk-mobile-footer-popup-cleanup` | 2 | 315 | diverged | css/premium.css, index.html | **stale + needs review** |
| `fix/motordesk-popup-readable` | 1 | 318 | diverged | css/premium.css | **stale + needs review** |
| `fix/motordesk-popup-readable-content` | 2 | 317 | diverged | css/premium.css, index.html | **stale + needs review** |
| `fix/multipage-policy-ocr-extraction` | 0 | 26 | behind | none returned | **stale (zero unique commits)** |
| `fix/native-vehicle-report-print` | 0 | 431 | behind | none returned | **stale (zero unique commits)** |
| `fix/password-change-isolated-verification` | 8 | 9 | diverged | index.html, js/app.js, js/password-change.js, package.json, sw.js, tests/password-change.test.mjs, tests/workshop-m0-contract.test.mjs | **risky / password and session-sensitive** |
| `fix/password-toggle-clean-rebase` | 0 | 343 | behind | none returned | **stale (zero unique commits)** |


## Full branch comparison table — chunk 5/6 (24 branches)

| Branch | Ahead | Behind | Status | Changed files returned | Classification |
|---|---:|---:|---|---|---|
| `fix/password-toggle-grid-alignment` | 0 | 350 | behind | none returned | **stale (zero unique commits)** |
| `fix/password-toggle-proper-input-anchor` | 3 | 349 | diverged | css/premium.css, index.html | **stale + needs review** |
| `fix/performance-rls-hardening` | 1 | 520 | diverged | supabase/security_hardening.sql | **risky + stale / database security SQL** |
| `fix/print-wait-screen-clean-footer` | 0 | 389 | behind | none returned | **stale (zero unique commits)** |
| `fix/publish-torqdesk-info-pages` | 1 | 270 | diverged | .github/workflows/pages.yml | **risky + stale / Pages workflow** |
| `fix/puc-route-syntax` | 1 | 513 | diverged | worker/src/index.js | **risky + stale / Worker routing** |
| `fix/rc-insurance-puc-extraction-live-bugs` | 33 | 514 | diverged | css/premium.css, index.html, js/app.js, js/document-extraction.js, supabase/puc_extraction_lifecycle.sql, worker/src/index.js, worker/src/insurance.js, worker/src/puc.js | **risky + stale / extraction and SQL** |
| `fix/refresh-print-tab-assets` | 1 | 392 | diverged | index.html | **stale + needs review** |
| `fix/remove-demo-copy-from-workshop-pages` | 2 | 112 | diverged | for-workshops.html, partials/public-header.html | **stale + needs review** |
| `fix/remove-drawer-info-links-clean` | 0 | 331 | behind | none returned | **stale (zero unique commits)** |
| `fix/rename-garage-workspace-assets` | 0 | 97 | behind | none returned | **stale (zero unique commits)** |
| `fix/report-print-in-separate-window` | 0 | 393 | behind | none returned | **stale (zero unique commits)** |
| `fix/report-print-pagination` | 0 | 449 | behind | none returned | **stale (zero unique commits)** |
| `fix/resolve-print-css-conflict` | 0 | 386 | behind | none returned | **stale (zero unique commits)** |
| `fix/restore-service-log-auto-description` | 3 | 378 | diverged | index.html, js/app.js | **stale + needs review** |
| `fix/security-idle-timeout-ws-a` | 0 | 416 | behind | none returned | **stale (zero unique commits)** |
| `fix/shared-public-shell-nav-glossary` | 0 | 205 | behind | none returned | **stale (zero unique commits)** |
| `fix/sitewide-inter-font` | 16 | 114 | diverged | 404.html, about.html, contact.html, css/public-site.css, css/tokens.css, faq.html, features.html, for-workshops.html, garage-login.html, garage-portal.html, how-it-works.html, index.html, offline.html, pricing.html, privacy.html, terms.html | **stale + needs review / broad frontend** |
| `fix/sitewide-readable-type` | 0 | 179 | behind | none returned | **stale (zero unique commits)** |
| `fix/step0b-password-and-sql-main` | 5 | 8 | diverged | index.html, js/app.js, js/password-change.js, sw.js, tests/password-change.test.mjs | **risky / password and session-sensitive** |
| `fix/super-admin-grants-least-privilege` | 1 | 16 | diverged | supabase/migrations/20261017170000_tighten_super_admin_registry_grants.sql | **risky / database grants** |
| `fix/super-admin-persistent-mode` | 2 | 12 | diverged | js/app.js, tests/customer-portal-regression.test.mjs | **needs review / admin UI** |
| `fix/super-admin-stale-service-worker-cache` | 2 | 14 | diverged | index.html, sw.js | **needs review / service-worker cache** |
| `fix/super-admin-workspace-and-ticket-errors` | 5 | 13 | diverged | css/styles.css, js/app.js, tests/customer-portal-regression.test.mjs, tests/workshop-m0-contract.test.mjs | **needs review / admin and ticket UI** |


## Full branch comparison table — chunk 6/6 (22 branches)

| Branch | Ahead | Behind | Status | Changed files returned | Classification |
|---|---:|---:|---|---|---|
| `fix/support-tickets-fail-closed` | 2 | 11 | diverged | tests/support-tickets-worker.test.mjs, worker/src/support-tickets.js | **risky / authorization fail-closed** |
| `fix/ticket-workflow-route-dispatch` | 28 | 7 | diverged | package.json, tests/super-admin-auth.test.mjs, tests/ticket-workflow-route.test.mjs, worker/migrations/0007_support_ticket_workflow.sql, worker/src/index.js, worker/src/ticket-workflow.js, wrangler.staging.toml | **risky / migration and Worker routing; do not blind merge** |
| `fix/torqdesk-auth-modal-dashboard-qa` | 5 | 274 | diverged | css/premium.css, index.html, js/app.js | **stale + needs review** |
| `fix/torqdesk-logo-wordmark-spacing` | 1 | 269 | diverged | assets/torqdesk-logo.svg | **stale + needs review** |
| `fix/torqdesk-tagline-popup` | 1 | 275 | diverged | index.html | **stale + needs review** |
| `fix/ws-a-server-enforced-idle` | 7 | 412 | diverged | index.html, js/app.js, supabase/migrations/20261012060000_carmy_idle_session_enforcement.sql | **risky + stale / session security SQL** |
| `fix/ws-a-server-enforced-idle-v2` | 0 | 406 | behind | none returned | **stale (zero unique commits)** |
| `fix/xp-print-progress-live` | 2 | 381 | diverged | index.html, js/app.js | **stale + needs review** |
| `fix-logo-placement-duplicate-text` | 3 | 521 | diverged | css/premium.css, index.html, js/app.js | **stale + needs review** |
| `main` | 0 | 0 | identical | none returned | **current baseline** |
| `perf/motordesk-report-pdf` | 0 | 362 | behind | none returned | **stale (zero unique commits)** |
| `perf/vehicle-report-page-render` | 1 | 363 | diverged | js/app.js | **stale + needs review** |
| `repair/ui-performance-audit` | 4 | 573 | diverged | css/premium.css, css/styles.css | **stale + needs review** |
| `security/r2-file-signature-validation` | 1 | 404 | diverged | .github/workflows/r2-file-validation.yml | **risky + stale / security workflow** |
| `security/r2-signature-validation-ci` | 0 | 402 | behind | none returned | **stale (zero unique commits)** |
| `security/ws-a-server-authoritative-idle-session` | 0 | 396 | behind | none returned | **stale (zero unique commits)** |
| `task3-current-main` | 0 | 452 | behind | none returned | **stale (zero unique commits)** |
| `task3-report-insurance` | 18 | 498 | diverged | .gitignore, css/premium.css, index.html, js/app.js, js/build-info.js, js/document-extraction.js, package.json, scripts/debug-document-classifier.cjs, scripts/debug-insurance-extraction.cjs, tests/document-classifier-real-files.test.cjs, tests/insurance-real-files.test.cjs | **risky + stale / document extraction and test fixtures** |
| `temp-carcarecloud-logo-test` | 10 | 523 | diverged | .github/workflows/pages.yml, assets/carcarecloud-icon.svg, assets/carcarecloud-logo.svg, css/premium.css, favicon.svg, icons/apple-touch-icon-180.svg, icons/icon-192.svg, icons/icon-512.svg, index.html, js/app.js | **stale + needs review / branding and workflow** |
| `ui/motordesk-global-footer-links` | 0 | 337 | behind | none returned | **stale (zero unique commits)** |
| `ui/remove-info-links-from-mobile-drawer` | 1 | 334 | diverged | index.html | **stale + needs review** |
| `ui/restore-motordesk-info-popup` | 0 | 320 | behind | none returned | **stale (zero unique commits)** |
