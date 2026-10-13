# Workshop Workspace decisions (M0)

## Confirmed from the current repository and database inspection
- Owner application: `index.html` + `js/app.js`; Worker entry point: `worker/src/index.js`.
- Production owner Supabase project is `Carmy` (`hlrmuvzmaegnbgzvvfsn`). A second project called `car data` exists but is not assumed to be staging.
- Current owner session timeout is 120 seconds. M0 extracts the local activity/fetch-guard primitives into `js/session-guard.js` while preserving the 120-second value, storage keys, event orchestration, global sign-out and Worker/database guards.
- The current owner schema contains `cars`, `records`, `documents`, `user_profiles`, `user_security` and related tables. Workshop schema is strictly additive with `ws_` names.
- Production DDL has not been run. The workshop migration is committed for review and must be applied only to an explicitly identified staging project after a backup and pre-check.

## Conservative decisions
- Workshop feature flag defaults to off in both UI and Worker helper. The UI flag is not an authorization boundary; future Worker routes must enforce the server-side flag and authenticated organization membership.
- MPIN is not initialized to the weak value `0000`. M0 stores only a nullable hash field; M1 must implement secure salted hashing, rate limiting, reset controls and warning copy before enabling MPIN.
- No `ws_organizations` membership or staff data can be read without an active staff membership. Counters and audit writes are service-role/RPC-only at this milestone.
- Platform-admin rows are provisioned only through a trusted administrative path; no self-service insert/update/delete policy is created.
- The workshop tables have no client-facing business routes yet. M0 does not imply a functioning workshop app.
- `PUBLIC_BASE_URL` source of truth is the currently configured public site, `https://rdxburia.github.io/Carmy/`; new workshop links must read a single configuration value rather than inventing torqdesk.com or torqdesk.in URLs.
- Staff without a user login may be assigned work later, but cannot authenticate until a separate approved shared-device design exists.
- Organization creation plus initial owner membership must occur atomically in a trusted Worker/RPC transaction. The initial core migration intentionally does not expose an organization insert policy.

## M0 not tested yet
- Live staging RLS checks with two organizations and each role.
- A real login/refresh/global-sign-out run against Supabase Auth.
- Direct REST/RPC/Storage denial after idle timeout.
- Full browser screenshots at 360, 390, 768 and 1366 px.
