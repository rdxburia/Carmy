-- 0004_support_tickets.sql
-- Additive migration: creates the support_tickets table for Torq Desk's
-- customer complaint system. Worker authenticates every write/read server-side.
--
-- Pre-check (run before applying):
-- SELECT name FROM sqlite_master WHERE type='table' AND name='support_tickets';
-- Expected: no rows. If the table exists, inspect schema before proceeding.
--
-- Apply: wrangler d1 migrations apply carmy-cache --remote
-- Rollback (only after Worker code is rolled back):
-- DROP INDEX IF EXISTS idx_support_tickets_user_id;
-- DROP INDEX IF EXISTS idx_support_tickets_created_at;
-- DROP TABLE IF EXISTS support_tickets;

CREATE TABLE IF NOT EXISTS support_tickets (
  id           TEXT PRIMARY KEY,      -- TD-XXXXXX deterministic reference
  user_id      TEXT NOT NULL,         -- Supabase auth.uid() extracted server-side from JWT
  email        TEXT NOT NULL,         -- Authenticated account email from Supabase JWT
  car_id       TEXT,                  -- Optional; validated server-side against user's vehicles
  category     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  message      TEXT NOT NULL,
  priority     TEXT NOT NULL DEFAULT 'Normal',
  status       TEXT NOT NULL DEFAULT 'open',
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
  ON support_tickets(user_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
  ON support_tickets(created_at);
