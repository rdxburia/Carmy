-- WS-A: server-side idle session tracking. Additive; does not alter existing cache rows.
CREATE TABLE IF NOT EXISTS session_activity (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_activity_user_id
  ON session_activity(user_id);

-- Rollback only after the WS-A Worker code is disabled:
-- DROP INDEX IF EXISTS idx_session_activity_user_id;
-- DROP TABLE IF EXISTS session_activity;
