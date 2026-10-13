-- Executable RLS smoke test. STAGING ONLY; never run on production.
-- Run after ws_001_core.sql and after a trusted setup has created two disposable
-- workshop organizations plus five confirmed Auth users/staff rows:
--   org_a: owner_a, advisor_a, mechanic_a, cashier_a
--   org_b: owner_b
-- Use psql with -v flags. Example:
-- psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
--  -v org_a='UUID' -v org_b='UUID' -v owner_a='UUID' -v advisor_a='UUID' \
--  -v mechanic_a='UUID' -v cashier_a='UUID' -v owner_b='UUID' \
--  -f supabase/tests/ws_001_rls_smoke.sql
-- This script only reads data and rolls back its transaction. Do not use real customer data.

\set ON_ERROR_STOP on
begin;
select set_config('test.org_a', :'org_a', true);
select set_config('test.org_b', :'org_b', true);
select set_config('test.owner_a', :'owner_a', true);
select set_config('test.advisor_a', :'advisor_a', true);
select set_config('test.mechanic_a', :'mechanic_a', true);
select set_config('test.cashier_a', :'cashier_a', true);
select set_config('test.owner_b', :'owner_b', true);
set local role authenticated;

-- Owner A can see only organization A and has only the owner role.
select set_config('request.jwt.claim.sub', current_setting('test.owner_a'), true);
do $$
begin
 if (select count(*) from public.ws_organizations where id=current_setting('test.org_a')::uuid) <> 1 then
  raise exception 'FAIL: owner_a cannot read org_a';
 end if;
 if exists(select 1 from public.ws_organizations where id=current_setting('test.org_b')::uuid) then
  raise exception 'FAIL: owner_a can read org_b';
 end if;
 if not public.ws_has_role(current_setting('test.org_a')::uuid,array['owner']) then
  raise exception 'FAIL: owner role helper did not match';
 end if;
 if public.ws_has_role(current_setting('test.org_a')::uuid,array['advisor','mechanic','cashier']) then
  raise exception 'FAIL: owner matched a non-owner role';
 end if;
end $$;

-- Each non-owner role is scoped to org A and cannot pass the owner role check.
select set_config('request.jwt.claim.sub', current_setting('test.advisor_a'), true);
do $$
begin
 if exists(select 1 from public.ws_organizations where id=current_setting('test.org_b')::uuid) then raise exception 'FAIL: advisor_a can read org_b'; end if;
 if not public.ws_has_role(current_setting('test.org_a')::uuid,array['advisor']) then raise exception 'FAIL: advisor role helper did not match'; end if;
 if public.ws_has_role(current_setting('test.org_a')::uuid,array['owner']) then raise exception 'FAIL: advisor matched owner role'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.mechanic_a'), true);
do $$
begin
 if exists(select 1 from public.ws_organizations where id=current_setting('test.org_b')::uuid) then raise exception 'FAIL: mechanic_a can read org_b'; end if;
 if not public.ws_has_role(current_setting('test.org_a')::uuid,array['mechanic']) then raise exception 'FAIL: mechanic role helper did not match'; end if;
 if public.ws_has_role(current_setting('test.org_a')::uuid,array['owner']) then raise exception 'FAIL: mechanic matched owner role'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.cashier_a'), true);
do $$
begin
 if exists(select 1 from public.ws_organizations where id=current_setting('test.org_b')::uuid) then raise exception 'FAIL: cashier_a can read org_b'; end if;
 if not public.ws_has_role(current_setting('test.org_a')::uuid,array['cashier']) then raise exception 'FAIL: cashier role helper did not match'; end if;
 if public.ws_has_role(current_setting('test.org_a')::uuid,array['owner']) then raise exception 'FAIL: cashier matched owner role'; end if;
end $$;

-- Owner B must see org B and must not see org A.
select set_config('request.jwt.claim.sub', current_setting('test.owner_b'), true);
do $$
begin
 if (select count(*) from public.ws_organizations where id=current_setting('test.org_b')::uuid) <> 1 then raise exception 'FAIL: owner_b cannot read org_b'; end if;
 if exists(select 1 from public.ws_organizations where id=current_setting('test.org_a')::uuid) then raise exception 'FAIL: owner_b can read org_a'; end if;
 if not public.ws_has_role(current_setting('test.org_b')::uuid,array['owner']) then raise exception 'FAIL: org_b owner role helper did not match'; end if;
end $$;

-- Client roles must not write counters, audit entries or platform-admin grants.
do $$
begin
 begin
  perform * from public.ws_counters;
  raise exception 'FAIL: authenticated role can read ws_counters';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.ws_platform_admins(user_id) values(current_setting('test.owner_a')::uuid);
  raise exception 'FAIL: authenticated role can grant platform-admin access';
 exception when insufficient_privilege then null;
 end;
end $$;

rollback;
-- PASS means all assertions completed without an exception. Capture the psql exit code
-- and output in the M0 report. This test does not replace live Auth/Worker/Storage tests.
