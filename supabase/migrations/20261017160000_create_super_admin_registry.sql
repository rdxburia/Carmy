-- Super Admin authorization registry.
-- This migration is intentionally NOT applied to any Supabase project.
-- Granting admin access requires an explicit, separately reviewed INSERT.
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NULL
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.super_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.super_admins TO service_role;

CREATE TABLE IF NOT EXISTS public.super_admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 120),
  target_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.super_admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON TABLE public.super_admin_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.super_admin_audit_log_id_seq TO service_role;
