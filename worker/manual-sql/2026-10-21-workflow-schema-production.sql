-- worker/manual-sql/2026-10-21-workflow-schema-production.sql
-- Not idempotent for ALTER TABLE. Run once. Pre-check first.
-- Production D1 Workflow Schema Alignment Script
-- Target Database: carmy-cache (production D1 57c85007-1cf7-470f-bb4d-3b28cbb555b7)
-- Authoritative schema source: staging-schema.sql (carmy-ticket-workflow-staging)
-- Role constraints aligned to approved Torq Desk team roles:
--   - team_members: 'super_admin', 'team_lead', 'support_agent', 'support_executive'
--   - admin_team_invites: 'team_lead', 'support_agent', 'support_executive'
--
-- Objects covered:
-- 1. support_tickets: 7 new workflow columns and 3 indexes
-- 2. ticket_events: table, 2 indexes, 2 append-only triggers
-- 3. ticket_reads: table, 1 index
-- 4. public_ticket_events: public view
-- 5. audit_log: table, 1 index, 2 append-only triggers
-- 6. admin_team_invites: table, 1 index
-- 7. team_members: table, 1 index
-- 8. support_tickets: data normalization for existing legacy tickets (4 rows expected)

-- ============================================================================
-- Block 1: support_tickets - Add missing workflow columns and performance indexes
-- Production currently has: id, user_id, email, car_id, category, subject, message, priority, status, created_at, updated_at
-- This block appends the 7 workflow columns and 3 indexes defined in staging-schema.sql.
-- ============================================================================
ALTER TABLE support_tickets ADD COLUMN assignee_id TEXT;
ALTER TABLE support_tickets ADD COLUMN chat_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE support_tickets ADD COLUMN chat_enabled_until INTEGER;
ALTER TABLE support_tickets ADD COLUMN sla_due_at INTEGER;
ALTER TABLE support_tickets ADD COLUMN closed_at INTEGER;
ALTER TABLE support_tickets ADD COLUMN reopen_until INTEGER;
ALTER TABLE support_tickets ADD COLUMN show_agent_name INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets(status);

CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee
  ON support_tickets(assignee_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_sla
  ON support_tickets(sla_due_at);

-- ============================================================================
-- Block 2: ticket_events - Append-only timeline of public and internal ticket events
-- Authoritative definition: staging-schema.sql (ticket_events)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ticket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','admin','team','system')),
  event_type TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public','internal')),
  message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id
  ON ticket_events(ticket_id, id);

CREATE INDEX IF NOT EXISTS idx_ticket_events_visibility
  ON ticket_events(ticket_id, visibility, id);

-- Append-only trigger: reject updates to existing ticket events
CREATE TRIGGER IF NOT EXISTS ticket_events_no_update
BEFORE UPDATE ON ticket_events BEGIN
  SELECT RAISE(ABORT, 'ticket_events are append-only');
END;

-- Append-only trigger: reject deletions of ticket events
CREATE TRIGGER IF NOT EXISTS ticket_events_no_delete
BEFORE DELETE ON ticket_events BEGIN
  SELECT RAISE(ABORT, 'ticket_events are append-only');
END;

-- ============================================================================
-- Block 3: public_ticket_events - Safe customer-facing public view
-- Authoritative definition: staging-schema.sql (public_ticket_events)
-- Customer portal routes select from this view to prevent leaking internal notes.
-- ============================================================================
CREATE VIEW IF NOT EXISTS public_ticket_events AS
SELECT id, ticket_id, actor_type, event_type, message, created_at
FROM ticket_events
WHERE visibility = 'public';

-- ============================================================================
-- Block 4: ticket_reads - Watermark tracking for unread badges and notifications
-- Authoritative definition: staging-schema.sql (ticket_reads)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ticket_reads (
  user_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  last_read_event_id INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, ticket_id),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_reads_user
  ON ticket_reads(user_id, ticket_id);

-- ============================================================================
-- Block 5: audit_log - Append-only administrative audit log
-- Authoritative definition: staging-schema.sql (audit_log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT NOT NULL,
  ticket_id TEXT,
  action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_log_ticket
  ON audit_log(ticket_id, id);

-- Append-only trigger: reject updates to audit log entries
CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

-- Append-only trigger: reject deletions from audit log
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

-- ============================================================================
-- Block 6: admin_team_invites - Pending staff invitations table
-- Authoritative definition: staging-schema.sql (admin_team_invites)
-- Role constraint: ('team_lead','support_agent','support_executive')
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_team_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('team_lead','support_agent','support_executive')),
  invited_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('provider_accepted','failed','accepted')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  provider_status INTEGER,
  provider_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_team_invites_email_created
  ON admin_team_invites(email, created_at);

-- ============================================================================
-- Block 7: team_members - Internal team roster and role matrix
-- Authoritative definition: staging-schema.sql (team_members)
-- Role constraint: ('super_admin','team_lead','support_agent','support_executive')
-- ============================================================================
CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  role TEXT NOT NULL CHECK (role IN ('super_admin','team_lead','support_agent','support_executive')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_team_members_active_role
  ON team_members(active, role);

-- ============================================================================
-- Block 8: Data normalization - Align legacy status & priority vocabulary
-- Expected rows affected: 4 tickets total
-- Pre-normalization distribution:
--   open / Normal: 2
--   open / Urgent: 1
--   open / urgent: 1
-- Post-normalization distribution:
--   pending / normal: 2
--   pending / urgent: 2
-- Run worker/manual-sql/CHECK-legacy-status.sql to verify counts before running.
-- ============================================================================
update support_tickets set status = 'pending' where status = 'open';
update support_tickets set priority = 'normal' where priority = 'Normal';
update support_tickets set priority = 'urgent' where priority in ('Urgent','urgent');
