# WS-A: Two-minute inactivity logout rollout

## Scope

This change adds browser inactivity enforcement and a Worker-side session check. The frontend reports its last local activity timestamp to the Worker. The Worker stores per-session activity in D1 and globally signs out expired sessions.

The frontend also uses direct Supabase Auth, PostgREST, RPC, and Storage calls. Those direct requests do not pass through the Worker idle check. Global sign-out revokes refresh tokens, but an already-issued access JWT may remain usable until its expiry. Treat the direct-call migration behind Worker endpoints as Phase 2; do not claim complete server-side inactivity enforcement for those direct calls until that work is done.

## Rollout order

1. **Backup gate:** verify the latest `.github/workflows/daily-backup.yml` run succeeded before any database operation. This has not been verified by the implementation author.
2. **D1 pre-check:** run the read-only query in `worker/migrations/0002_session_activity.sql` against the `carmy-cache` D1 database. If `session_activity` already exists, inspect its schema before proceeding.
3. **D1 migration:** apply `worker/migrations/0002_session_activity.sql` to the production `carmy-cache` database. This creates only a new table and index; it does not edit existing cache rows.
4. **Frontend:** review and merge this PR only after review. GitHub Pages deploys the frontend from `main`.
5. **Worker:** from the approved, merged `main` revision, run `npx wrangler deploy` using the repository's configured Cloudflare account. Confirm the deployment points at `carmy-api`.
6. **Hard refresh:** open the site and sign in again. Existing sessions without `carmy_last_activity` are intentionally signed out once.
7. **Verification:** complete the acceptance checklist below before calling this production-ready.

## Manual Supabase settings

In Supabase Dashboard, open **Authentication → Sessions** (the exact menu label may vary). Review the shortest JWT expiry the project supports and enable inactivity timeout / time-boxed sessions only if those settings are available on the current plan and are compatible with the application. Record the configured values; do not change them without checking the expected access-token lifetime and user impact.

## Acceptance checklist

- [ ] Leave a signed-in tab untouched for 2 minutes; it returns to the sign-in view.
- [ ] Refresh after 3 minutes of inactivity; the sign-in view appears without showing protected data.
- [ ] Close and reopen after 5 minutes; the sign-in view appears.
- [ ] Set `localStorage.carmy_last_activity` to a timestamp older than 2 minutes and reload; sign-in appears without a protected-data flash.
- [ ] Two open tabs both sign out after idle timeout.
- [ ] Worker request for an expired idle session returns HTTP 401 with `SESSION_IDLE_TIMEOUT`.
- [ ] Global sign-out invalidates the refresh token; verify this with an actual session, not an assumed result.
- [ ] Dashboard, Cars, Add Record, History, Documents, Report, and Owner Profile all return to login without stale data.
- [ ] A long upload/import/print preparation does not get interrupted solely because it takes longer than 2 minutes.
- [ ] Test a direct Supabase query after timeout and record its actual behavior; the Worker idle check does not currently proxy every direct Supabase call.

## Rollback

Disable or roll back the Worker idle-session enforcement first. Only then, if required, execute the commented rollback statements in `worker/migrations/0002_session_activity.sql`. Do not drop the table while the deployed Worker still expects it.
