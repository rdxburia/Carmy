-- MANUAL STAGING-ONLY RLS smoke-test template for M0.
-- Do not run on production. Run after ws_001_core.sql on a dedicated staging project.
-- Requires psql and two existing, disposable Supabase Auth users:
--   owner_a, advisor_a, mechanic_a, cashier_a belong to org A;
--   owner_b belongs to org B.
-- Replace every UUID below with the matching staging auth.users UUID and organization ID.
-- Seed org/staff fixtures as a trusted database role first, then execute each section
-- in a separate psql session as authenticated with the listed JWT subject.
--
-- Setup pre-check:
select tablename, rowsecurity
from pg_tables
where schemaname='public' and tablename like 'ws_%'
order by tablename;
-- Expected: all five M0 tables report rowsecurity = true.
--
-- For each test user, set the JWT subject before querying:
-- select set_config('request.jwt.claim.sub', '<AUTH_USER_UUID>', false);
-- set role authenticated;
-- select id, garage_id from public.ws_organizations;
-- Expected: owner_a/advisor_a/mechanic_a/cashier_a see only org A;
-- owner_b sees only org B. An organization B ID must never be visible to org A roles.
--
-- Role assertions (run after setting the corresponding user's JWT subject):
-- select public.ws_has_role('<ORG_A_UUID>'::uuid, array['owner']);
-- Expected true for owner_a, false for advisor_a/mechanic_a/cashier_a/owner_b.
-- Repeat with role arrays ['advisor'], ['mechanic'], ['cashier'] and verify exactly
-- the corresponding active member is true. Deactivate a membership and verify false.
--
-- Privilege assertions (run as authenticated):
-- select * from public.ws_counters; -- expected permission denied / no rows accessible
-- insert into public.ws_audit_log(org_id,action,entity) values (...); -- expected denied
-- insert into public.ws_platform_admins(user_id) values (...); -- expected denied
-- A service-role/Worker RPC can write these after its own validation.
--
-- Record each HTTP/SQL result in the milestone report. This template is not evidence
-- of a passed live RLS test; do not mark it PASS until run on staging.
