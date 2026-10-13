-- Roll back only the additive M0 workshop core schema.
-- WARNING: this drops workshop data. Confirm backup and approval before running.
begin;
drop policy if exists ws_platform_admin_self_select on public.ws_platform_admins;
drop policy if exists ws_audit_owner_select on public.ws_audit_log;
drop policy if exists ws_staff_owner_delete on public.ws_staff;
drop policy if exists ws_staff_owner_update on public.ws_staff;
drop policy if exists ws_staff_owner_insert on public.ws_staff;
drop policy if exists ws_staff_member_select on public.ws_staff;
drop policy if exists ws_organizations_member_select on public.ws_organizations;
drop trigger if exists ws_counters_updated_at on public.ws_counters;
drop trigger if exists ws_staff_updated_at on public.ws_staff;
drop trigger if exists ws_organizations_updated_at on public.ws_organizations;
drop function if exists public.ws_has_role(uuid,text[]);
drop function if exists public.ws_is_platform_admin();
drop function if exists public.ws_set_updated_at();
drop table if exists public.ws_platform_admins;
drop table if exists public.ws_audit_log;
drop table if exists public.ws_counters;
drop table if exists public.ws_staff;
drop table if exists public.ws_organizations;
commit;
