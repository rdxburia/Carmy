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


## All-time pull request inventory — GitHub REST API

**Coverage:** GitHub `GET /repos/rdxburia/Carmy/pulls?state=all&per_page=100`, pages 1 and 2. Records returned: **154**. This is the complete all-state pull-request collection returned by those pages at audit time; individual changed-file names/patches were not retrieved for every PR, so the per-file PR diff is **unverified unless explicitly inspected elsewhere in this report**. `changed_files` is GitHub's PR metadata count. Classification of PR status: `merged` if `merged_at` is present, `closed unmerged` if closed without merge timestamp, otherwise `open`.

| PR | Title | State | Head → base | Changed-file count | Created |
|---|---|---|---|---:|---|
| [#1](https://github.com/rdxburia/Carmy/pull/1) | Root-cause UI layout and startup refactor | merged | `repair/ui-performance-audit` → `main` | unverified | 2026-10-07 |
| [#4](https://github.com/rdxburia/Carmy/pull/4) | fix: restore Documents and Vehicle Report presentation styles | merged | `fix/issue-3-documents-report-styles` → `main` | unverified | 2026-10-08 |
| [#5](https://github.com/rdxburia/Carmy/pull/5) | fix: make API diagnostics consistently authenticated | merged | `fix/api-diagnostic-auth-fetch` → `main` | unverified | 2026-10-08 |
| [#11](https://github.com/rdxburia/Carmy/pull/11) | fix: prevent D1 cache invalidation failures | merged | `fix/cache-webhook-runtime-error` → `main` | unverified | 2026-10-08 |
| [#12](https://github.com/rdxburia/Carmy/pull/12) | fix: restore Cloudflare Worker Preview builds | merged | `fix/cloudflare-preview-build` → `main` | unverified | 2026-10-08 |
| [#13](https://github.com/rdxburia/Carmy/pull/13) | fix(ui): refresh documents after upload and delete | merged | `fix/document-ui-reactive-state` → `main` | unverified | 2026-10-08 |
| [#14](https://github.com/rdxburia/Carmy/pull/14) | fix(dashboard): improve header actions and sign-out | merged | `fix/dashboard-header-actions` → `main` | unverified | 2026-10-08 |
| [#15](https://github.com/rdxburia/Carmy/pull/15) | fix(ui): restore opaque Car Edit modal surface | merged | `fix/car-edit-modal-background` → `main` | unverified | 2026-10-08 |
| [#16](https://github.com/rdxburia/Carmy/pull/16) | fix(branding): enforce non-selectable global home logo | merged | `fix/issue-9-logo-behavior` → `main` | unverified | 2026-10-08 |
| [#18](https://github.com/rdxburia/Carmy/pull/18) | feat(logo): add CarCare Cloud logo concept preview | merged | `feat/issue-17-logo-preview` → `main` | unverified | 2026-10-08 |
| [#19](https://github.com/rdxburia/Carmy/pull/19) | fix(nav): prevent dashboard navigation drawer from persisting | merged | `fix/dashboard-drawer-state` → `main` | unverified | 2026-10-08 |
| [#21](https://github.com/rdxburia/Carmy/pull/21) | fix(report): restore broken A4 Vehicle Report layout | merged | `fix/issue-20-a4-report-layout` → `main` | unverified | 2026-10-08 |
| [#22](https://github.com/rdxburia/Carmy/pull/22) | fix(report): correct broken A4 report DOM nesting | merged | `fix/issue-20-report-dom-nesting` → `main` | unverified | 2026-10-08 |
| [#23](https://github.com/rdxburia/Carmy/pull/23) | fix(security): rotate cache invalidation webhook secret | merged | `fix/issue-6-cache-secret-rotation` → `main` | unverified | 2026-10-08 |
| [#24](https://github.com/rdxburia/Carmy/pull/24) | fix(security): isolate cache trigger helper from public RPC | merged | `fix/issue-6-private-cache-trigger` → `main` | unverified | 2026-10-08 |
| [#25](https://github.com/rdxburia/Carmy/pull/25) | Temporary CarCareCloud branding test | merged | `temp-carcarecloud-logo-test` → `main` | unverified | 2026-10-08 |
| [#26](https://github.com/rdxburia/Carmy/pull/26) | Temporary branding asset deployment fix | merged | `temp-carcarecloud-logo-test` → `main` | unverified | 2026-10-08 |
| [#27](https://github.com/rdxburia/Carmy/pull/27) | Fix CarCareCloud logo placement and duplicate text | merged | `fix-logo-placement-duplicate-text` → `main` | unverified | 2026-10-08 |
| [#28](https://github.com/rdxburia/Carmy/pull/28) | Perf hardening: optimize RLS and remove duplicate index | merged | `fix/performance-rls-hardening` → `main` | unverified | 2026-10-08 |
| [#29](https://github.com/rdxburia/Carmy/pull/29) | Perf: index foreign-key columns | merged | `fix/foreign-key-indexes` → `main` | unverified | 2026-10-08 |
| [#30](https://github.com/rdxburia/Carmy/pull/30) | Security: harden API CORS and health endpoint | merged | `fix/api-cors-health-hardening` → `main` | unverified | 2026-10-08 |
| [#31](https://github.com/rdxburia/Carmy/pull/31) | Security: add Worker API rate limiting | merged | `fix/api-rate-limiting` → `main` | unverified | 2026-10-08 |
| [#32](https://github.com/rdxburia/Carmy/pull/32) | Add browser RC and insurance extraction with policy lifecycle | merged | `feature/rc-insurance-auto-extraction` → `main` | unverified | 2026-10-09 |
| [#33](https://github.com/rdxburia/Carmy/pull/33) | Fix dynamic insurance lifecycle status | merged | `fix/insurance-dynamic-lifecycle` → `main` | unverified | 2026-10-09 |
| [#34](https://github.com/rdxburia/Carmy/pull/34) | Fix live RC insurance PUC extraction bugs | merged | `fix/rc-insurance-puc-extraction-live-bugs` → `main` | unverified | 2026-10-09 |
| [#35](https://github.com/rdxburia/Carmy/pull/35) | Fix PUC route syntax after extraction merge | closed unmerged | `fix/rc-insurance-puc-extraction-live-bugs` → `main` | unverified | 2026-10-09 |
| [#36](https://github.com/rdxburia/Carmy/pull/36) | Fix PUC route source syntax | merged | `fix/puc-route-syntax` → `main` | unverified | 2026-10-09 |
| [#37](https://github.com/rdxburia/Carmy/pull/37) | Fix document classification, whole-document insurance extraction and A4 reports | merged | `fix/document-messages-english` → `main` | unverified | 2026-10-09 |
| [#38](https://github.com/rdxburia/Carmy/pull/38) | Task 3: Fix A4 report export and verify multi-page insurance extraction | merged | `fix/document-messages-english` → `main` | unverified | 2026-10-09 |
| [#39](https://github.com/rdxburia/Carmy/pull/39) | Task 3: Fix A4 report export and verify multi-page insurance extraction | closed unmerged | `task3-report-insurance` → `main` | unverified | 2026-10-09 |
| [#40](https://github.com/rdxburia/Carmy/pull/40) | Task 3: Finalize A4 report printing and review evidence UI | merged | `task3-current-main` → `main` | unverified | 2026-10-09 |
| [#41](https://github.com/rdxburia/Carmy/pull/41) | Fix vehicle report blank pages and clipped logo | merged | `fix/report-print-pagination` → `main` | unverified | 2026-10-09 |
| [#42](https://github.com/rdxburia/Carmy/pull/42) | Fix insurance extraction PDF row order and chassis parsing | merged | `fix/insurance-pdf-reading-order` → `main` | unverified | 2026-10-09 |
| [#43](https://github.com/rdxburia/Carmy/pull/43) | Fix Chola chassis extraction regex whitespace | merged | `fix/chola-chassis-stray-space` → `main` | unverified | 2026-10-09 |
| [#44](https://github.com/rdxburia/Carmy/pull/44) | Rebuild vehicle report with native A4 printing | merged | `fix/native-vehicle-report-print` → `main` | unverified | 2026-10-09 |
| [#45](https://github.com/rdxburia/Carmy/pull/45) | RC image blob load + Firefox print cleanup + PUC validation | merged | `fix/native-vehicle-report-print` → `main` | unverified | 2026-10-09 |
| [#46](https://github.com/rdxburia/Carmy/pull/46) | Fix Chola chassis regex | merged | `fix/chola-chassis-stray-space` → `main` | unverified | 2026-10-09 |
| [#47](https://github.com/rdxburia/Carmy/pull/47) | [WS-A] Enforce two-minute inactivity logout | merged | `fix/security-idle-timeout-ws-a` → `main` | unverified | 2026-10-12 |
| [#48](https://github.com/rdxburia/Carmy/pull/48) | [WS-A] Guard direct Supabase requests after idle timeout | merged | `fix/ws-a-server-enforced-idle` → `main` | unverified | 2026-10-12 |
| [#49](https://github.com/rdxburia/Carmy/pull/49) | [WS-A] Add database-side idle session enforcement | closed unmerged | `fix/ws-a-server-enforced-idle` → `main` | unverified | 2026-10-12 |
| [#50](https://github.com/rdxburia/Carmy/pull/50) | [WS-A] Add database-side idle session enforcement | merged | `fix/ws-a-server-enforced-idle-v2` → `main` | unverified | 2026-10-12 |
| [#51](https://github.com/rdxburia/Carmy/pull/51) | [Security] Validate uploaded file signatures before R2 finalization | merged | `security/r2-file-signature-validation` → `main` | unverified | 2026-10-12 |
| [#52](https://github.com/rdxburia/Carmy/pull/52) | [Security] Add CI for R2 file signature regression tests | merged | `security/r2-signature-validation-ci` → `main` | unverified | 2026-10-12 |
| [#53](https://github.com/rdxburia/Carmy/pull/53) | [Security] Make WS-A idle timeout server-authoritative | merged | `security/ws-a-server-authoritative-idle-session` → `main` | unverified | 2026-10-12 |
| [#54](https://github.com/rdxburia/Carmy/pull/54) | Fix dashboard A4 report print entry point | merged | `fix/dashboard-report-print-dialog` → `main` | unverified | 2026-10-12 |
| [#55](https://github.com/rdxburia/Carmy/pull/55) | Print prepared vehicle reports in a separate tab | merged | `fix/report-print-in-separate-window` → `main` | unverified | 2026-10-12 |
| [#56](https://github.com/rdxburia/Carmy/pull/56) | Bust cached assets for the separate print tab fix | merged | `fix/refresh-print-tab-assets` → `main` | unverified | 2026-10-12 |
| [#57](https://github.com/rdxburia/Carmy/pull/57) | Add print preparation screen and clean A4 footer | merged | `fix/print-wait-screen-clean-footer` → `main` | unverified | 2026-10-12 |
| [#58](https://github.com/rdxburia/Carmy/pull/58) | Clean A4 report headers and add date/page footer | merged | `fix/a4-report-clean-header-footer` → `main` | unverified | 2026-10-12 |
| [#59](https://github.com/rdxburia/Carmy/pull/59) | Resolve print CSS conflict | merged | `fix/resolve-print-css-conflict` → `main` | unverified | 2026-10-12 |
| [#60](https://github.com/rdxburia/Carmy/pull/60) | Fix live A4 print preparation progress screen | merged | `fix/xp-print-progress-live` → `main` | unverified | 2026-10-12 |
| [#61](https://github.com/rdxburia/Carmy/pull/61) | Modernize vehicle report preparation UI | merged | `feat/modern-report-preparation-ui` → `main` | unverified | 2026-10-12 |
| [#62](https://github.com/rdxburia/Carmy/pull/62) | Fix login blocked by report UI JavaScript syntax error | merged | `fix/login-js-syntax-after-report-ui` → `main` | unverified | 2026-10-12 |
| [#63](https://github.com/rdxburia/Carmy/pull/63) | Restore auto-generated description in Service Log | merged | `fix/restore-service-log-auto-description` → `main` | unverified | 2026-10-12 |
| [#64](https://github.com/rdxburia/Carmy/pull/64) | Rebrand CarCareCloud to MotorDesk | merged | `branding/motordesk-rebrand` → `main` | unverified | 2026-10-12 |
| [#65](https://github.com/rdxburia/Carmy/pull/65) | MotorDesk rebrand and faster vehicle report PDF | merged | `perf/motordesk-report-pdf` → `main` | unverified | 2026-10-12 |
| [#66](https://github.com/rdxburia/Carmy/pull/66) | Speed up vehicle report PDF preparation | merged | `perf/vehicle-report-page-render` → `main` | unverified | 2026-10-12 |
| [#67](https://github.com/rdxburia/Carmy/pull/67) | Polish MotorDesk login copy and motion design | merged | `design/motordesk-login-motion-copy` → `main` | unverified | 2026-10-12 |
| [#68](https://github.com/rdxburia/Carmy/pull/68) | Fix MotorDesk login viewport spacing and password toggle alignment | merged | `fix/motordesk-login-viewport-password-toggle` → `main` | unverified | 2026-10-12 |
| [#69](https://github.com/rdxburia/Carmy/pull/69) | Separate MotorDesk tagline and car animation; compact login layout | merged | `fix/motordesk-login-story-car-spacing` → `main` | unverified | 2026-10-12 |
| [#70](https://github.com/rdxburia/Carmy/pull/70) | Fix password Show button alignment in login and signup | merged | `fix/password-toggle-grid-alignment` → `main` | unverified | 2026-10-12 |
| [#71](https://github.com/rdxburia/Carmy/pull/71) | Add MotorDesk About, Terms & Contact pages | merged | `feature/motordesk-about-terms-contact` → `main` | unverified | 2026-10-12 |
| [#72](https://github.com/rdxburia/Carmy/pull/72) | Correct password Show button position inside input | closed unmerged | `fix/password-toggle-proper-input-anchor` → `main` | unverified | 2026-10-12 |
| [#73](https://github.com/rdxburia/Carmy/pull/73) | Fix password Show button alignment without stale conflicts | merged | `fix/password-toggle-clean-rebase` → `main` | unverified | 2026-10-12 |
| [#74](https://github.com/rdxburia/Carmy/pull/74) | Fix About/Terms/Contact tabs and add MotorDesk copyright | merged | `fix/motordesk-info-tabs-and-clicks` → `main` | unverified | 2026-10-12 |
| [#75](https://github.com/rdxburia/Carmy/pull/75) | Move MotorDesk links to the full-width website footer | merged | `ui/motordesk-global-footer-links` → `main` | unverified | 2026-10-12 |
| [#76](https://github.com/rdxburia/Carmy/pull/76) | Fix About, Terms & Contact links across MotorDesk | merged | `fix/global-info-links-functional` → `main` | unverified | 2026-10-12 |
| [#77](https://github.com/rdxburia/Carmy/pull/77) | Fix broken About, Terms & Contact click handlers | merged | `fix/info-links-inline-handler-syntax` → `main` | unverified | 2026-10-12 |
| [#78](https://github.com/rdxburia/Carmy/pull/78) | Remove About, Terms and Contact from mobile drawer | closed unmerged | `ui/remove-info-links-from-mobile-drawer` → `main` | unverified | 2026-10-12 |
| [#79](https://github.com/rdxburia/Carmy/pull/79) | Remove About, Terms and Contact from mobile drawer | merged | `fix/remove-drawer-info-links-clean` → `main` | unverified | 2026-10-12 |
| [#80](https://github.com/rdxburia/Carmy/pull/80) | Create real About, Terms & Contact pages for MotorDesk | closed unmerged | `feature/motordesk-real-info-pages` → `main` | unverified | 2026-10-12 |
| [#81](https://github.com/rdxburia/Carmy/pull/81) | Clarify private vehicle records in Terms & Conditions | merged | `content/clarify-private-records-terms` → `main` | unverified | 2026-10-12 |
| [#82](https://github.com/rdxburia/Carmy/pull/82) | Make footer links open real pages on login and inside the app | merged | `fix/footer-info-links-real-pages` → `main` | unverified | 2026-10-12 |
| [#83](https://github.com/rdxburia/Carmy/pull/83) | Restore the MotorDesk information popup | merged | `ui/restore-motordesk-info-popup` → `main` | unverified | 2026-10-12 |
| [#84](https://github.com/rdxburia/Carmy/pull/84) | Fix always-visible MotorDesk footer and popup clicks | merged | `fix/motordesk-footer-always-visible-popup` → `main` | unverified | 2026-10-12 |
| [#85](https://github.com/rdxburia/Carmy/pull/85) | Fix MotorDesk popup blur and missing text visibility | merged | `fix/motordesk-popup-readable` → `main` | unverified | 2026-10-12 |
| [#86](https://github.com/rdxburia/Carmy/pull/86) | Fix MotorDesk info popup readability | merged | `fix/motordesk-popup-readable-content` → `main` | unverified | 2026-10-12 |
| [#87](https://github.com/rdxburia/Carmy/pull/87) | Stabilize MotorDesk mobile login and footer | merged | `fix/motordesk-mobile-auth-footer-stability` → `main` | unverified | 2026-10-12 |
| [#88](https://github.com/rdxburia/Carmy/pull/88) | Fix mobile footer jumping and MotorDesk info popups | merged | `fix/motordesk-mobile-footer-popup-cleanup` → `main` | unverified | 2026-10-12 |
| [#89](https://github.com/rdxburia/Carmy/pull/89) | Make footer info popups open reliably on mobile | merged | `fix/motordesk-footer-popup-click-mobile` → `main` | unverified | 2026-10-12 |
| [#90](https://github.com/rdxburia/Carmy/pull/90) | Apply Torq Desk branding across website | merged | `branding/torqdesk-identity` → `main` | unverified | 2026-10-13 |
| [#91](https://github.com/rdxburia/Carmy/pull/91) | Create Torq Desk blue-car themed landing and brand assets | merged | `design/torqdesk-blue-car-landing` → `main` | unverified | 2026-10-13 |
| [#92](https://github.com/rdxburia/Carmy/pull/92) | Build Torq Desk marketing homepage and fix loading branding | merged | `design/torqdesk-marketing-home-loading-brand` → `main` | unverified | 2026-10-13 |
| [#93](https://github.com/rdxburia/Carmy/pull/93) | Remove remaining legacy tagline from Torq Desk popup | merged | `fix/torqdesk-tagline-popup` → `main` | unverified | 2026-10-13 |
| [#94](https://github.com/rdxburia/Carmy/pull/94) | Remove old Torq Desk login page and fix dashboard startup flow | merged | `fix/torqdesk-auth-modal-dashboard-qa` → `main` | unverified | 2026-10-13 |
| [#95](https://github.com/rdxburia/Carmy/pull/95) | Unify Torq Desk dashboard with the blue homepage design | merged | `design/torqdesk-unified-blue-ui` → `main` | unverified | 2026-10-13 |
| [#96](https://github.com/rdxburia/Carmy/pull/96) | Fix Torq Desk footer links with direct information pages | merged | `fix/footer-real-page-links` → `main` | unverified | 2026-10-13 |
| [#97](https://github.com/rdxburia/Carmy/pull/97) | Fix dashboard footer links to open information pages | merged | `fix/dashboard-footer-links` → `main` | unverified | 2026-10-13 |
| [#98](https://github.com/rdxburia/Carmy/pull/98) | Fix GitHub Pages publishing for About, Terms and Contact | merged | `fix/publish-torqdesk-info-pages` → `main` | unverified | 2026-10-13 |
| [#99](https://github.com/rdxburia/Carmy/pull/99) | Fix Torq Desk logo wordmark spacing | merged | `fix/torqdesk-logo-wordmark-spacing` → `main` | unverified | 2026-10-13 |
| [#100](https://github.com/rdxburia/Carmy/pull/100) | Phase 1: Torq Desk public site, pricing foundations and PWA shell | merged | `feat/torqdesk-phase1-public-site` → `main` | unverified | 2026-10-13 |
| [#101](https://github.com/rdxburia/Carmy/pull/101) | Deliverable 1: shared public shell, navigation and glossary cleanup | merged | `fix/shared-public-shell-nav-glossary` → `main` | unverified | 2026-10-13 |
| [#102](https://github.com/rdxburia/Carmy/pull/102) | Deliverable 2: homepage audience switch, SVG icons and truthful previews | closed unmerged | `feat/home-first-screen-audience-switch` → `main` | unverified | 2026-10-13 |
| [#103](https://github.com/rdxburia/Carmy/pull/103) | Deliverable 2: homepage audience switch and visual checks (clean base) | merged | `feat/home-first-screen-audience-switch-clean` → `main` | unverified | 2026-10-13 |
| [#104](https://github.com/rdxburia/Carmy/pull/104) | Feat/home first screen audience switch v2 | merged | `feat/home-first-screen-audience-switch-v2` → `main` | unverified | 2026-10-13 |
| [#105](https://github.com/rdxburia/Carmy/pull/105) | Improve readability across Torq Desk website | merged | `fix/sitewide-readable-type` → `main` | unverified | 2026-10-13 |
| [#106](https://github.com/rdxburia/Carmy/pull/106) | M0: workshop foundations, additive schema and shared session guard | merged | `feat/workshop-m0-foundations` → `main` | unverified | 2026-10-13 |
| [#107](https://github.com/rdxburia/Carmy/pull/107) | Add vehicle owner and garage sign-in/account options | merged | `feat/owner-garage-auth-entrypoints` → `main` | unverified | 2026-10-13 |
| [#108](https://github.com/rdxburia/Carmy/pull/108) | Add frontend-only garage demo portal and default admin login | merged | `feat/garage-demo-portal` → `main` | unverified | 2026-10-13 |
| [#109](https://github.com/rdxburia/Carmy/pull/109) | Activate interactive workshop features in garage demo mode | merged | `feat/full-workshop-demo-features` → `main` | unverified | 2026-10-13 |
| [#110](https://github.com/rdxburia/Carmy/pull/110) | Fix garage demo actions and signed-in account label | merged | `fix/garage-demo-interactions` → `main` | unverified | 2026-10-13 |
| [#111](https://github.com/rdxburia/Carmy/pull/111) | Fix live garage dashboard cache and overview actions | merged | `fix/garage-live-cache-and-actions` → `main` | unverified | 2026-10-13 |
| [#112](https://github.com/rdxburia/Carmy/pull/112) | Fix stale cache for Torq Desk workshop demo | merged | `fix/garage-demo-cache-refresh` → `main` | unverified | 2026-10-13 |
| [#113](https://github.com/rdxburia/Carmy/pull/113) | Fix all workshop demo add-action forms | merged | `fix/garage-demo-form-actions` → `main` | unverified | 2026-10-13 |
| [#114](https://github.com/rdxburia/Carmy/pull/114) | Unify Torq Desk typography across login and garage | merged | `fix/sitewide-inter-font` → `main` | unverified | 2026-10-13 |
| [#115](https://github.com/rdxburia/Carmy/pull/115) | Add Firebase-first sign-in with legacy Supabase compatibility | closed unmerged | `feature/firebase-default-dual-auth` → `main` | unverified | 2026-10-13 |
| [#116](https://github.com/rdxburia/Carmy/pull/116) | Remove garage demo labels and refresh broken workspace actions | merged | `fix/garage-actions-and-remove-demo-labels` → `main` | unverified | 2026-10-13 |
| [#117](https://github.com/rdxburia/Carmy/pull/117) | Remove demo wording from workshop entry points | merged | `fix/remove-demo-copy-from-workshop-pages` → `main` | unverified | 2026-10-13 |
| [#118](https://github.com/rdxburia/Carmy/pull/118) | Rename garage assets and test every workspace action | merged | `fix/rename-garage-workspace-assets` → `main` | unverified | 2026-10-13 |
| [#119](https://github.com/rdxburia/Carmy/pull/119) | Add real garage onboarding with Supabase persistence | merged | `fix/garage-actions-and-owner-entry` → `main` | unverified | 2026-10-13 |
| [#120](https://github.com/rdxburia/Carmy/pull/120) | Upgrade garage onboarding to four-step partner wizard | closed unmerged | `fix/garage-actions-and-owner-entry` → `main` | unverified | 2026-10-13 |
| [#121](https://github.com/rdxburia/Carmy/pull/121) | Fix public shell validation and harden R2 backup | merged | `fix/daily-backup-and-public-shell` → `main` | unverified | 2026-10-14 |
| [#122](https://github.com/rdxburia/Carmy/pull/122) | Keep customer login active during dashboard API failures | merged | `fix/customer-dashboard-auth-load-resilience` → `main` | unverified | 2026-10-15 |
| [#123](https://github.com/rdxburia/Carmy/pull/123) | Fix customer session persistence and dashboard loading | merged | `fix/customer-session-persistence-and-dashboard` → `main` | unverified | 2026-10-15 |
| [#124](https://github.com/rdxburia/Carmy/pull/124) | Fix/customer session persistence and dashboard | merged | `fix/customer-session-persistence-and-dashboard` → `main` | unverified | 2026-10-15 |
| [#125](https://github.com/rdxburia/Carmy/pull/125) | Fix/customer session persistence and dashboard | merged | `fix/customer-session-persistence-and-dashboard` → `main` | unverified | 2026-10-15 |
| [#126](https://github.com/rdxburia/Carmy/pull/126) | fix(mobile-dashboard): fix side drawer layout, 100dvh responsiveness, and bottom button clipping | merged | `fix/customer-session-persistence-and-dashboard` → `main` | unverified | 2026-10-15 |
| [#127](https://github.com/rdxburia/Carmy/pull/127) | fix(ui): redesign homepage to match dashboard, fix doc vault card ove… | merged | `fix/customer-session-persistence-and-dashboard` → `main` | unverified | 2026-10-15 |
| [#128](https://github.com/rdxburia/Carmy/pull/128) | Fix/customer session persistence and dashboard | merged | `fix/customer-session-persistence-and-dashboard` → `main` | unverified | 2026-10-16 |
| [#129](https://github.com/rdxburia/Carmy/pull/129) | fix(ci): resolve idle-session regression test failures | merged | `fix/ci-idle-session-regression` → `main` | unverified | 2026-10-16 |
| [#130](https://github.com/rdxburia/Carmy/pull/130) | fix(portal): prevent blank dashboard and tolerate missing heartbeat migration | merged | `fix/ci-idle-session-regression` → `main` | unverified | 2026-10-16 |
| [#131](https://github.com/rdxburia/Carmy/pull/131) | feat(portal): improve Document Vault, footer clearance, and homepage audience switch | merged | `feat/phase-bc-docvault-footer-homepage` → `main` | unverified | 2026-10-16 |
| [#132](https://github.com/rdxburia/Carmy/pull/132) | fix(portal): resolve vehicle loading race condition and complete dashboard UX repairs | merged | `feat/fix-data-loading-and-dashboard-ux` → `main` | unverified | 2026-10-16 |
| [#133](https://github.com/rdxburia/Carmy/pull/133) | fix(help-support): remove dashboard footer, persist support tickets to D1, and polish mobile nav | merged | `fix/help-support-production-and-dashboard-polish` → `main` | unverified | 2026-10-16 |
| [#134](https://github.com/rdxburia/Carmy/pull/134) | Prevent duplicate email and mobile registrations | merged | `fix/duplicate-registration-guard` → `main` | unverified | 2026-10-16 |
| [#135](https://github.com/rdxburia/Carmy/pull/135) | Fix vehicle loading retries and mobile Document Vault overflow | merged | `feat/mandatory-production-fixes` → `main` | unverified | 2026-10-16 |
| [#136](https://github.com/rdxburia/Carmy/pull/136) | Fix Help navigation fallback and stale asset cache | merged | `fix/help-nav-cache-visual-polish` → `main` | unverified | 2026-10-16 |
| [#137](https://github.com/rdxburia/Carmy/pull/137) | Step 0b: verification and password-change hardening | closed unmerged | `chore/step0-project-governance` → `main` | unverified | 2026-10-16 |
| [#138](https://github.com/rdxburia/Carmy/pull/138) | Improve multi-page policy extraction and OCR fallback | merged | `feat/multipage-policy-extraction` → `chore/step0-project-governance` | unverified | 2026-10-17 |
| [#139](https://github.com/rdxburia/Carmy/pull/139) | Improve multi-page insurance PDF extraction and OCR fallback | merged | `fix/multipage-policy-ocr-extraction` → `main` | unverified | 2026-10-17 |
| [#140](https://github.com/rdxburia/Carmy/pull/140) | Improve multi-page insurance PDF extraction and OCR fallback | merged | `fix/multipage-policy-ocr-extraction` → `main` | unverified | 2026-10-17 |
| [#141](https://github.com/rdxburia/Carmy/pull/141) | fix(account-security): collapsible owner profile and change password forms | merged | `fix/account-security-collapsible-ui` → `main` | unverified | 2026-10-17 |
| [#142](https://github.com/rdxburia/Carmy/pull/142) | Fix transfer documents, registration resilience, and garage workspace syntax | merged | `fix/form-29-30-pdf-ownership-transfer` → `main` | unverified | 2026-10-17 |
| [#143](https://github.com/rdxburia/Carmy/pull/143) | chore(release): bump build tag to 2026.10.17-v10-transfer-security an… | merged | `chore/bump-build-v10-transfer-security` → `main` | unverified | 2026-10-17 |
| [#144](https://github.com/rdxburia/Carmy/pull/144) | Add server-side Super Admin authorization foundation | merged | `feat/super-admin-backend-auth` → `main` | unverified | 2026-10-17 |
| [#145](https://github.com/rdxburia/Carmy/pull/145) | Tighten Super Admin database grants | merged | `fix/super-admin-grants-least-privilege` → `main` | unverified | 2026-10-17 |
| [#146](https://github.com/rdxburia/Carmy/pull/146) | feat(admin): Super Admin frontend integration and backend role verification | merged | `feat/super-admin-frontend-integration` → `main` | unverified | 2026-10-17 |
| [#147](https://github.com/rdxburia/Carmy/pull/147) | fix(admin): invalidate stale service-worker cache | merged | `fix/super-admin-stale-service-worker-cache` → `main` | unverified | 2026-10-17 |
| [#148](https://github.com/rdxburia/Carmy/pull/148) | Fix Super Admin workspace layout and isolate customer navigation | merged | `fix/super-admin-workspace-and-ticket-errors` → `main` | unverified | 2026-10-17 |
| [#149](https://github.com/rdxburia/Carmy/pull/149) | Fix persistent Super Admin workspace mode | merged | `fix/super-admin-persistent-mode` → `main` | unverified | 2026-10-18 |
| [#150](https://github.com/rdxburia/Carmy/pull/150) | Harden support ticket failure handling | merged | `fix/support-tickets-fail-closed` → `main` | unverified | 2026-10-18 |
| [#151](https://github.com/rdxburia/Carmy/pull/151) | Complete Super Admin workspace frontend | merged | `feat/super-admin-frontend-screens` → `main` | unverified | 2026-10-18 |
| [#152](https://github.com/rdxburia/Carmy/pull/152) | Fix live Super Admin UI by retiring stale PWA cache | merged | `fix/live-super-admin-cache-bust-v12` → `main` | unverified | 2026-10-18 |
| [#153](https://github.com/rdxburia/Carmy/pull/153) | Harden Change Password without replacing the active session | closed unmerged | `fix/password-change-isolated-verification` → `main` | unverified | 2026-10-18 |
| [#154](https://github.com/rdxburia/Carmy/pull/154) | Fix admin sign-out and real team invitation flow | merged | `fix/admin-logout-and-invite-reality` → `main` | unverified | 2026-10-18 |
| [#155](https://github.com/rdxburia/Carmy/pull/155) | fix(tickets): correct workflow route parsing and add regression tests | merged | `fix/ticket-workflow-route-dispatch` → `main` | unverified | 2026-10-18 |
| [#156](https://github.com/rdxburia/Carmy/pull/156) | chore(deploy): publish frontend build v14 | merged | `chore/publish-frontend-v14` → `main` | unverified | 2026-10-18 |
| [#157](https://github.com/rdxburia/Carmy/pull/157) | docs: preserve Torq Desk progress and agent instructions | merged | `docs/preserve-project-history-2026-10-18` → `main` | unverified | 2026-10-18 |
| [#158](https://github.com/rdxburia/Carmy/pull/158) | docs: record verified merge status | merged | `docs/correct-merge-status-2026-10-18` → `main` | unverified | 2026-10-18 |
| [#159](https://github.com/rdxburia/Carmy/pull/159) | feat(garage): deploy workshop redesign and localhost preview | merged | `feat/garage-frontend-redesign` → `main` | unverified | 2026-10-18 |
| [#160](https://github.com/rdxburia/Carmy/pull/160) | docs: record verified deployment and local branch audit | merged | `docs/sync-frontend-deployment-verification-2026-10-18` → `main` | unverified | 2026-10-18 |
| [#161](https://github.com/rdxburia/Carmy/pull/161) | feat(support): implement customer and admin support ticket workflows | open | `feat/ticket-frontend` → `main` | unverified | 2026-10-18 |
| [#162](https://github.com/rdxburia/Carmy/pull/162) | docs(audit): record branch and staging isolation findings | merged | `audit/phase0-phase1-2026-10-19` → `main` | unverified | 2026-10-18 |
| [#163](https://github.com/rdxburia/Carmy/pull/163) | fix(staging): pin isolated Worker config to verified staging D1 | open | `fix/staging-d1-binding-2026-10-19` → `main` | unverified | 2026-10-18 |


## 2026-10-19 — Post-inventory PR and staging deployment correction

### PR inventory addendum
- PR #164 was created after the two-page `state=all` pull request snapshot was fetched. It is now merged: https://github.com/rdxburia/Carmy/pull/164 (merge commit `dd67518e6664025ee75faeba29c22ee316c50921`). Add this record to the prior snapshot: `#164 — docs(audit): complete branch and pull request inventories — merged — audit/complete-branch-pr-inventory-2026-10-19 → main — 3 changed files — created 2026-10-18`.
- PR #163 is also now merged: https://github.com/rdxburia/Carmy/pull/163 (merge commit `54c0b827bf30ee6e5fed3d62ed6e029307dbd6c9`). The original all-state inventory snapshot included #163 but predated #164.

### Staging D1 binding deployment evidence
- Cloudflare D1 inventory confirmed `carmy-ticket-workflow-staging` UUID `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`; production `carmy-cache` UUID is `57c85007-1cf7-470f-bb4d-3b28cbb555b7`. This supersedes the earlier transcribed UUID typo.
- PR #163 changed only `wrangler.staging.toml` and passed Worker build checks (`Workers Builds: carmy-api-staging` and `Workers Builds: carmy-api`) plus policy extraction tests. Supabase Preview was skipped, not failed. The config omits `SUPABASE_URL` until a dedicated staging Supabase project exists; no secret value was read, printed, changed, or committed.
- A staging-only Cloudflare settings deployment was performed after the PR merge. Active deployment ID: `9369670c-639d-4b8a-8b54-2a6f01e81d67`; active version 16 ID: `45e2bdb5-ca58-481c-b3f6-00515eca978e`, 100% traffic. Live Cloudflare GET settings verified `DB` -> `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`. `SUPABASE_URL`, R2, and RATE_LIMITER bindings are absent in the new version; the existing secret binding name remains inherited, but no Supabase URL is configured and no E2E request was sent.
- Staging D1 read-only verification: `support_tickets` schema includes workflow columns; counts remain 4 tickets, 2 `ticket_events`, 0 `ticket_reads`, 0 `audit_log`. No rows were inserted, updated, or deleted. `d1_migrations` ledger table is absent, so migration ledger evidence is unverified; because the workflow schema is already present, migration 0007 was not re-run.
- **STOP:** no authenticated E2E, Supabase mutation, or ticket mutation until the user provisions a dedicated staging Supabase project. Production D1/Worker remain untouched; production ticket contents were never read.


---

## 2026-10-19 — Autonomous staging run addendum: PRs #165–#167, secret isolation, schema recovery

### PR inventory additions (created after the initial 154-record snapshot)
| PR | Title | State | Head → base | Changed files | Created |
|---|---|---|---|---:|---|
| [#165](https://github.com/rdxburia/Carmy/pull/165) | docs(audit): record staging isolation deployment evidence | merged | `docs/staging-isolation-evidence-2026-10-19` → `main` | 3 | 2026-10-18 |
| [#166](https://github.com/rdxburia/Carmy/pull/166) | fix(staging): isolate Supabase, R2 and rate limiting resources | merged | `fix/staging-supabase-r2-rate-limit-2026-10-19` → `main` | 1 | 2026-10-18 |
| [#167](https://github.com/rdxburia/Carmy/pull/167) | fix(db): correct workshop migration dollar quote delimiter | merged | `fix/ws001-dollar-quote-delimiter-2026-10-19` → `main` | 1 | 2026-10-18 |

### Secret and staging resource evidence
- Cloudflare staging secret inventory initially contained `SUPABASE_SECRET_KEY`; its value was never read. DELETE returned HTTP 200 and a subsequent inventory returned no secret names. The original key's project identity remains unverified, so it was removed.
- Created Supabase project `carmy-staging` (`vejccahjrlwhaniajgez`, `ap-south-1`, ACTIVE_HEALTHY; reported project cost $0/month). No production rows or users were copied.
- Created Cloudflare R2 bucket `carmy-staging-files`. Staging rate-limit namespace is `2601019`, distinct from production `2601008`.
- Staging Supabase schema applications created the production table names in the metadata inventory with 0 rows, plus staging-only `ws_*` tables and Super Admin registry. Exact migration parity is **not verified**: cache webhook/Vault migrations were withheld because a staging-only secret pair is unavailable; two duplicate-contact migration sources from production history were not located in main. The old `Carmy` project's failed migration branch root cause remains unverified; the API returned only its `main` branch marked `MIGRATIONS_FAILED` and recent log query did not expose a matching error.
- Privileged staging Supabase secret key is unavailable through the connected Supabase tool set. No publishable/anon key was substituted and no privileged key was printed, logged, or committed.

### D1 schema/ledger verification
- Staging D1 schema matches the migration 0007 workflow objects and aggregate ticket statuses/priorities are already normalized. Created `d1_migrations`, recorded `0007_support_ticket_workflow.sql` without rerunning migration 0007.
- Counts preserved: 4 `support_tickets`, 2 `ticket_events`, 0 `ticket_reads`, 0 `audit_log`. No ticket content selected, and no existing rows changed.
- Production D1 backup/ledger remains untouched because staging E2E gate is not satisfied.

### Cloudflare deployment incident and current state
- PR #166 merged at `ffbb41fb68401df0007311bcaff90399a6ab9ce4`. The Git-integrated build then made Worker version 20 (`4a79a1fd-df66-4896-80fb-6b403f5229e9)) active with root `wrangler.toml` bindings to production D1/R2/rate-limit resources. No requests or writes were made while this version was active.
- Manually redeployed isolated version 19 (`21d40a41-0d77-49b7-be06-4e80d69d4842)) at 100% traffic, deployment `2a9497bb-a110-457f-aded-5c16b77dd75a`. Live version metadata verifies D1 staging UUID `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`, R2 `carmy-staging-files`, rate-limit namespace `2601019`, staging Supabase URL, and no secret bindings. Future auto-deploy correctness is unverified until Cloudflare build config selects `wrangler.staging.toml`.
- PR #167 fixed the first function body's malformed `AS $` delimiter in `supabase/ws_001_core.sql`. WS-A regression run 39159572470, policy run 39159572407, and Pages run 39159572421 succeeded. Corrected migration applied successfully to staging.
- Staging D1 existing rows remain unchanged. Authenticated ticket E2E remains unrun because privileged staging Supabase key is unavailable. PR #161 remains open/unmerged.

### Production hold
- Production D1, Worker, and Supabase were not changed. Production ticket contents were never read. No production backup/bookmark/export was performed because staging E2E is not verified; all five production preconditions are not met. Production rollout remains HOLD.


### PR #168 follow-up
- PR [#168](https://github.com/rdxburia/Carmy/pull/168) — `docs(audit): record autonomous staging isolation and rollout hold` — merged at `3e050234079df6157dc718e625be0339584ed3f4`, three documentation files changed. This entry is a post-snapshot inventory correction; the preceding addendum already covers PRs #165–#167.


### 2026-10-19 autonomous staging v2 addendum
- Cloudflare build trigger deploy command verified as `npx wrangler deploy --config wrangler.staging.toml`; manual build `6190228a-e0fd-495d-b697-d5cb5f3fe0ad` succeeded from branch `staging-worker-cors`.
- Active staging Worker deployment `dfeb81ca-1855-4d35-ba43-58bb668b003a`, version 27 `a975a5b4-b8c0-43a6-9124-2bd3efd31020`, 100% traffic; verified D1 `803810b8-77d0-42bb-bdd6-7e8b1cc4afdb`, R2 `carmy-staging-files`, rate-limit namespace `2601019`, Supabase project `vejccahjrlwhaniajgez`, Pages origin `https://carmy-ticket-staging.pages.dev`, and staging-only webhook secret binding name. The secret value is intentionally omitted.
- Pages staging project `carmy-ticket-staging` id `92c811e7-5f42-43f1-b2cc-b7a66e578c26`; latest deployment `e5c9b6d2-104c-437e-8cb2-d953176f21d7` succeeded on branch `staging/ticket-e2e-frontend` commit `cf8e526fd5fe2784b8de4d0a2b2ed533e2acceef`. Production GitHub Pages deployment job was skipped.
- PR #161 conflict-resolution commits `2a80aafe5776313ba50aff1aa67e2177097a428f`, `4cc172785838120618da341740cffa76db9a79d9`, `cf0f5aa20034dea47e45326a177ae6e5b00cc09d`; PR remains open/unmerged, mergeable=true, CI successful.
- Staging D1 aggregate counts unchanged: 4 tickets, 2 events, 0 reads, 0 audit rows, 1 ledger row. No synthetic ticket mutations occurred.
- Duplicate-contact parity is partial: staging profile phone normalization index applied; attempt to modify `auth.users` was rejected by PostgreSQL ownership (`must be owner of table users`). Supabase Management API/Auth Admin provisioning remains unavailable through connected actions; no QA users created and no real-login E2E pass claimed.
- Production rollout remains held pending real-login E2E and all five production gates. Antigravity local changes remain unverified.
