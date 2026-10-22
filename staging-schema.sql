PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE support_tickets (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,email TEXT NOT NULL,car_id TEXT,category TEXT NOT NULL,subject TEXT NOT NULL,message TEXT NOT NULL,priority TEXT NOT NULL DEFAULT 'Normal',status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL DEFAULT (unixepoch()),updated_at INTEGER NOT NULL DEFAULT (unixepoch()), assignee_id TEXT, chat_enabled INTEGER NOT NULL DEFAULT 0, chat_enabled_until INTEGER, sla_due_at INTEGER, closed_at INTEGER, reopen_until INTEGER, show_agent_name INTEGER NOT NULL DEFAULT 0);
CREATE TABLE ticket_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL, actor_type TEXT NOT NULL CHECK (actor_type IN ('user','admin','team','system')),
 event_type TEXT NOT NULL, visibility TEXT NOT NULL CHECK (visibility IN ('public','internal')),
 message TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 FOREIGN KEY (ticket_id) REFERENCES support_tickets(id));
CREATE TABLE ticket_reads (
 user_id TEXT NOT NULL, ticket_id TEXT NOT NULL, last_read_event_id INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (user_id, ticket_id),
 FOREIGN KEY (ticket_id) REFERENCES support_tickets(id));
CREATE TABLE audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id TEXT NOT NULL, ticket_id TEXT, action TEXT NOT NULL,
 metadata_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE TABLE session_activity (   session_id TEXT PRIMARY KEY,   user_id TEXT NOT NULL,   last_seen INTEGER NOT NULL , last_heartbeat INTEGER);
CREATE TABLE revoked_sessions (   session_id TEXT PRIMARY KEY,   user_id TEXT NOT NULL,   revoked_at INTEGER NOT NULL,   expires_at INTEGER NOT NULL );
CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE cache_entries (
  cache_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  data_version INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE admin_team_invites (
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
CREATE TABLE team_members (
  user_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  role TEXT NOT NULL CHECK (role IN ('super_admin','support','sales','finance','viewer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
DELETE FROM sqlite_sequence;
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_assignee ON support_tickets(assignee_id);
CREATE INDEX idx_support_tickets_sla ON support_tickets(sla_due_at);
CREATE INDEX idx_ticket_events_ticket_id ON ticket_events(ticket_id, id);
CREATE INDEX idx_ticket_events_visibility ON ticket_events(ticket_id, visibility, id);
CREATE INDEX idx_ticket_reads_user ON ticket_reads(user_id, ticket_id);
CREATE INDEX idx_audit_log_ticket ON audit_log(ticket_id, id);
CREATE INDEX idx_session_activity_user_id   ON session_activity(user_id);
CREATE INDEX idx_revoked_sessions_expires_at   ON revoked_sessions(expires_at);
CREATE INDEX idx_cache_entries_user ON cache_entries(user_id);
CREATE INDEX idx_cache_entries_expiry ON cache_entries(expires_at);
CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_created_at ON support_tickets(created_at);
CREATE INDEX idx_admin_team_invites_email_created ON admin_team_invites(email, created_at);
CREATE INDEX idx_team_members_active_role ON team_members(active, role);
CREATE TRIGGER ticket_events_no_update BEFORE UPDATE ON ticket_events BEGIN SELECT RAISE(ABORT, 'ticket_events are append-only'); END;
CREATE TRIGGER ticket_events_no_delete BEFORE DELETE ON ticket_events BEGIN SELECT RAISE(ABORT, 'ticket_events are append-only'); END;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE VIEW public_ticket_events AS SELECT id, ticket_id, actor_type, event_type, message, created_at FROM ticket_events WHERE visibility = 'public';
