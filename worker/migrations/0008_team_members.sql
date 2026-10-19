-- 0008_team_members.sql
-- Additive, isolated roster table. Does not alter existing tickets or migration 0007.
-- No seed rows: membership is created explicitly by an authenticated super-admin route.
CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  role TEXT NOT NULL CHECK (role IN ('super_admin','support','sales','finance','viewer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_team_members_active_role
  ON team_members(active, role);
