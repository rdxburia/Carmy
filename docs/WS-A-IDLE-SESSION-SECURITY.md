# WS-A idle-session security hardening

The Worker uses only its own D1 `session_activity.last_seen` value and Worker server time for the 120-second idle decision. `X-Carmy-Last-Activity` is untrusted and is not read by the authorization decision or used in D1 writes. Normal authenticated API calls and the authenticated `POST /api/session/heartbeat` endpoint update D1 activity with server time; activity writes are throttled to 15 seconds and heartbeat requests are limited per session.

## Remaining limitation

A stolen access token (or a refresh token that remains valid) plus a script that continues making authenticated heartbeat requests can keep the session active. Idle timeout does not prove a human is present and does not replace token revocation, short JWT lifetime, MFA, or anomaly detection.

## Supabase dashboard steps (manual)

1. Open Supabase Dashboard → Project → Authentication → Settings (JWT / session settings; labels may vary by dashboard version).
2. Set the shortest access-token/JWT expiry your application can safely support. Short JWT expiry limits exposure but is not itself an inactivity timeout.
3. If your plan exposes session controls, enable the shortest practical maximum session lifetime / time-box and inactivity timeout.
4. Save the settings and test sign-in, refresh, and global sign-out in a separate test account before relying on them in production.

Do not assume these dashboard controls exist on every plan. If a setting is unavailable, record it as unavailable rather than claiming it is configured.

## Manual verification required

- Use a test account and capture the actual HTTP status/body for idle >120 seconds with a forged recent `X-Carmy-Last-Activity`; expected Worker response is `401` with `SESSION_IDLE_TIMEOUT`.
- Interact normally and confirm authenticated API requests and heartbeat return success while active.
- After idle-triggered global sign-out, try the old refresh token and confirm Supabase rejects it.
- After expiry, try direct Supabase REST, RPC (including `carmy_touch_session`), and Storage calls with the old access token; each must fail authorization/policy checks.
- Do not mark these as passed without real request/response evidence. Worker unit tests alone do not establish Supabase Auth/REST/Storage behavior.
