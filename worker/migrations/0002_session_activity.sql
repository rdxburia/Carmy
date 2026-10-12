-- WS-A: server-side idle session tracking. Additive; does not alter existing cache rows.
-- Read-only pre-check (run before applying): 
-- SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'session_activity';
-- Expected before migration: no row. If the table already exists, inspect its schema first.
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
