# Super Admin backend authorization (unapplied)

## What this branch changes
- Every `/api/admin/*` route first requires a valid Supabase user session through the existing Worker authentication middleware.
- The Worker checks that user's immutable Supabase Auth UUID against `public.super_admins`; client email, localStorage, request-body roles, and browser flags are not used for authorization.
- Missing registry table, failed PostgREST request, malformed response, or network failure returns HTTP 503 (fail closed). A valid user with no active registry row receives HTTP 403.
- Access to the admin support-ticket list is recorded in `public.super_admin_audit_log`; audit-write failure also returns HTTP 503.
- The previous `X-Carmy-Admin-Secret` check is removed from the ticket-list handler because the route now uses verified JWT identity + the server-side role registry. Do not put service-role keys or admin secrets in browser code.

## Database migration status
`supabase/migrations/20261017160000_create_super_admin_registry.sql` is source code only and has **not** been applied to any Supabase project. Until the migration is separately reviewed and applied, Super Admin endpoints intentionally fail closed.

The migration creates:
- `public.super_admins`: active admin identity registry keyed by `auth.users.id`.
- `public.super_admin_audit_log`: append-oriented access audit records.

Do not add the dedicated login to `super_admins` until the migration and authorization behavior have been reviewed and approved separately. The login email alone is not sufficient to grant a role; use the verified Supabase Auth UUID and an explicit privileged database operation after approval.

## Verification
Run `npm test` after checking out this branch. Added tests cover:
- missing user / unavailable authorization configuration;
- normal user denied with 403;
- matching registry identity allowed;
- registry errors and network failures denied (503);
- audit log failure denied (503);
- successful audit write.

These tests are committed but have not been executed in this remote-edit session. No production migration, account privilege change, deployment, merge, or edit to PR #142 was performed.
