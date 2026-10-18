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
