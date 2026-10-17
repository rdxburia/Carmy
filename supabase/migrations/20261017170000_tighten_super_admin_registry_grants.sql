-- Tighten Super Admin table grants after table creation.
-- Supabase's public-schema default privileges grant broad table/sequence
-- access to anon, authenticated, and service_role. Explicit GRANT statements
-- in the original migration do not remove those pre-existing default grants.
-- Apply this migration together with 20261017160000_create_super_admin_registry.sql
-- before any Super Admin activation.

REVOKE ALL ON TABLE public.super_admins
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.super_admins TO service_role;

REVOKE ALL ON TABLE public.super_admin_audit_log
  FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT ON TABLE public.super_admin_audit_log TO service_role;

REVOKE ALL ON SEQUENCE public.super_admin_audit_log_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE public.super_admin_audit_log_id_seq TO service_role;
