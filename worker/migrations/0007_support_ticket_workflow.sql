-- 0007_support_ticket_workflow.sql
-- ADDITIVE ONLY. Staging only: do not apply to production until the reviewed PR is approved.
-- Existing ticket content is preserved. Known legacy status and priority values are normalized to the workflow vocabulary.
-- Row-count evidence must be captured on staging before/after applying this migration.

ALTER TABLE support_tickets ADD COLUMN assignee_id TEXT;
ALTER TABLE support_tickets ADD COLUMN chat_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE support_tickets ADD COLUMN chat_enabled_until INTEGER;
ALTER TABLE support_tickets ADD COLUMN sla_due_at INTEGER;
ALTER TABLE support_tickets ADD COLUMN closed_at INTEGER;
ALTER TABLE support_tickets ADD COLUMN reopen_until INTEGER;
ALTER TABLE support_tickets ADD COLUMN show_agent_name INTEGER NOT NULL DEFAULT 0;

-- Normalize known legacy status values into the workflow vocabulary.
-- The legacy schema uses NOT NULL DEFAULT 'open', so a NULL-only backfill would
-- leave existing tickets in statuses that the new transition engine cannot handle.
UPDATE support_tickets
SET status = CASE lower(status)
  WHEN 'open' THEN 'pending'
  WHEN 'new' THEN 'pending'
  WHEN 'pending' THEN 'pending'
  WHEN 'assigned' THEN 'assigned'
  WHEN 'in_progress' THEN 'working'
  WHEN 'working' THEN 'working'
  WHEN 'need_info' THEN 'need_info'
  WHEN 'solved' THEN 'solved'
  WHEN 'resolved' THEN 'solved'
  WHEN 'closed' THEN 'closed'
  ELSE 'pending'
END
WHERE lower(status) NOT IN ('pending','assigned','working','need_info','solved','closed') OR status <> lower(status);

-- The legacy schema stores title-cased priorities (Normal/Urgent); the workflow
-- API expects lowercase values. Normalize valid values and use normal for unknowns.
UPDATE support_tickets
SET priority = CASE lower(COALESCE(priority, ''))
  WHEN 'low' THEN 'low'
  WHEN 'normal' THEN 'normal'
  WHEN 'high' THEN 'high'
  WHEN 'urgent' THEN 'urgent'
  ELSE 'normal'
END
WHERE priority IS NULL OR lower(priority) NOT IN ('low','normal','high','urgent') OR priority <> lower(priority);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee ON support_tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla ON support_tickets(sla_due_at);

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
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON ticket_events(ticket_id, id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_visibility ON ticket_events(ticket_id, visibility, id);

-- Immutable audit timeline: database rejects updates and deletes.
CREATE TRIGGER IF NOT EXISTS ticket_events_no_update
BEFORE UPDATE ON ticket_events BEGIN
  SELECT RAISE(ABORT, 'ticket_events are append-only');
END;
CREATE TRIGGER IF NOT EXISTS ticket_events_no_delete
BEFORE DELETE ON ticket_events BEGIN
  SELECT RAISE(ABORT, 'ticket_events are append-only');
END;

-- Safe public-only view; user-facing routes must query this view, never ticket_events directly.
CREATE VIEW IF NOT EXISTS public_ticket_events AS
SELECT id, ticket_id, actor_type, event_type, message, created_at
FROM ticket_events
WHERE visibility = 'public';

CREATE TABLE IF NOT EXISTS ticket_reads (
  user_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  last_read_event_id INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, ticket_id),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
);
CREATE INDEX IF NOT EXISTS idx_ticket_reads_user ON ticket_reads(user_id, ticket_id);

-- Append-only audit trail for privileged support actions. Message bodies must not be stored here.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT NOT NULL,
  ticket_id TEXT,
  action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_audit_log_ticket ON audit_log(ticket_id, id);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
