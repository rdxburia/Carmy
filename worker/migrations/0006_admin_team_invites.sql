CREATE TABLE IF NOT EXISTS admin_team_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('support','billing','auditor')),
  invited_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('provider_accepted','failed','accepted')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  provider_status INTEGER,
  provider_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_team_invites_email_created ON admin_team_invites(email, created_at);
