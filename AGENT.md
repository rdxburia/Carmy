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
