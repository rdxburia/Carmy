CREATE TABLE IF NOT EXISTS cache_entries (
  cache_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  data_version INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_cache_entries_user
  ON cache_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_cache_entries_expiry
  ON cache_entries(expires_at);
