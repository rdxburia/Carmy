# Support Ticket Backend v2 — Audit Report

Date: 2026-10-19  
Branch: `feat/support-ticket-backend-v2`  
Base: `main` at `3710bc112401a899975c7df5475ee44d4c7937ff` (GitHub compare metadata; branch created from `main`)  
Status: **NOT READY — no backend code changed, no tests run, no migration applied**  
Safety: no production resources touched; no merges performed; frontend branch `feat/ticket-frontend-v2` at `50e11ad` was not changed.

## 1. Base and commit ancestry evidence

- Current `main` snapshot used for the branch: `3710bc112401a899975c7df5475ee44d4c7937ff`.
- Branch `feat/support-ticket-backend-v2` was created from `main`.
- GitHub compare for `main...27058bf`: status `diverged`, `ahead_by=4`, `behind_by=16`, merge base `8f1f9882f27ced22cf9c3e5ed406c9f6c1b022ad`. Therefore commit `27058bf` is **not** an ancestor of main and is not included by the chosen base. It has not been relied on.
- GitHub compare for `main...341ddf1`: status `behind`, `ahead_by=0`, merge base `341ddf1876ba686a89eb8f12424b459461e0694f`. This establishes `341ddf1` is an ancestor of main. It is already contained in the chosen base.
- The stale branch `feat/support-ticket-workflow-backend` (tip `9b176a1`) was not used.
- A local `git merge-base --is-ancestor` command and `npm test` cannot be run through the currently available GitHub file/metadata tools. The comparison results above are the available remote evidence; they are not represented as local git output.

## 2. Route contract table

These are the requested target contracts, **not implemented or verified in this audit**.

| Method | Path | Roles allowed | Request | Required response | Expected errors | Test name | Result |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/team` | `super_admin` or `support.manage` | none | `{ok:true,data:[{id,display_name,role,active}]}`; active support-enabled members only; no contact/credential fields | 401 unauthenticated; 403 non-admin | `team roster filters inactive and removed members; non-admin denied; JSON contains no sensitive fields` | NOT RUN — route not implemented |
| GET | `/api/admin/support-roster` | `super_admin` or `support.manage` | none | `{ok:true,data:[{id,display_name,role}]}`; active support-enabled members only | 401 unauthenticated; 403 non-admin | `support roster filters inactive/removed; non-admin denied; no email/phone` | NOT RUN — route not implemented |
| POST | `/api/admin/tickets/:id/view-as-user` | `super_admin` or `support.manage` | `{reason:string}`, trimmed length 10–500 | `{ok:true,data:{ticket:{id,subject,status,created_at,updated_at},public_events:[...]}}`; public-only data | 400 `REASON_REQUIRED` / invalid reason; 401; 403; 404; 503 audit failure | `view-as-user audits before data; no internal events; no state mutation; cross-user 404; audit failure returns 503 with no data` | NOT RUN — route not implemented |
| PATCH | `/api/admin/tickets/:id` | existing admin authorization | assignment / chat / message payload | existing `{ok:true}` | 403 `ASSIGNEE_NOT_ALLOWED`; 409 `INVALID_TRANSITION`; 503 atomic write failure | `removed roster member cannot be assigned; chat+message batch rollback; 48h expiry` | PARTIAL EXISTING IMPLEMENTATION; requested tests NOT RUN |
| GET | `/api/tickets/:id` | owning customer | none | public ticket fields and public events only | 401; 404 for cross-user ticket | `customer never receives internal note` | Existing route uses `public_ticket_events`, but it also writes `ticket_reads`; view-as-user must not call it |
| POST | `/api/tickets/:id/messages` | owning customer with chat enabled and unexpired | `{message:string}` | `{ok:true}` | 403 `CHAT_DISABLED` after expiry; 404 cross-user | `chat disabled after chat_enabled_until` | Existing expiry guard found; runtime test NOT RUN |

**Important contract conflict:** the prompt specifies both `GET /api/admin/team` with `active` in each row and `GET /api/admin/support-roster` without it. Both paths should be implemented as documented compatibility contracts or the owner should select one canonical route. No frontend code was changed.

## 3. Findings from current main

- Admin router currently calls `requireSuperAdmin` for all `/api/admin/*` routes. This helper checks only the active `public.super_admins` registry; it does not currently authorize a separate `support.manage` role.
- The ticket workflow already checks assignment against active `super_admins` through `isActiveTicketAssignee` and fails closed if the lookup is unavailable. It does not yet prove support-roster membership/removal semantics by tests.
- PATCH builds the ticket update and event/audit statements into one D1 `batch`; this is the right intended atomicity boundary, but no injected-failure test result is available.
- Customer ticket detail reads from `public_ticket_events` and updates `ticket_reads`. The view-as-user route must query only public events directly and must not call the customer detail route, because the latter changes read state.
- Migration 0007 is **not idempotent** as currently written: seven `ALTER TABLE ... ADD COLUMN` statements are unconditional. The `CREATE ... IF NOT EXISTS` statements are idempotent, but they do not make the full migration safe to run twice.
- Migration 0007 includes append-only triggers for `ticket_events` and `audit_log` rejecting UPDATE and DELETE. Trigger behavior has not been executed against staging in this audit.

## 4. Migration 0007 — current SQL on main (full)

File: `worker/migrations/0007_support_ticket_workflow.sql`

```sql
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
```

### Staging row counts

| Table | Before | After | Result |
|---|---:|---:|---|
| `support_tickets` | NOT CAPTURED | NOT CAPTURED | NOT RUN — no staging SQL execution route used |
| `ticket_events` | NOT CAPTURED | NOT CAPTURED | NOT RUN |
| `ticket_reads` | NOT CAPTURED | NOT CAPTURED | NOT RUN |

Migration was not applied to staging in this audit, and was not applied to production.

## 5. Test output

**NOT RUN.** This session has GitHub file and metadata tools but no repository shell/Node.js runtime or supported staging migration executor. No output is fabricated. Existing tests in `tests/ticket-workflow-route.test.mjs` and `tests/super-admin-auth.test.mjs` were inspected, not executed. I cannot claim `npm test` passes or compare any unrelated failure against main without actual runs.

Required pending tests:
- Team/support roster filtering, non-admin 403, unauthenticated 401, whole-JSON sensitive-field scan.
- View-as-user reason validation, 200 public-only contract, 404 cross-user/unknown ticket, audit row actor/ticket/user/reason/time, fail-closed audit error, unchanged ticket/events/read-state, and independent PATCH authorization.
- Assignment rejection after roster removal.
- Atomic rollback when the message insert fails after chat-enabled update.
- Chat expiry returning 403 `CHAT_DISABLED`.
- Internal note hidden from customer.
- Migration idempotency (two staging applications), before/after row counts, UPDATE/DELETE trigger checks for both append-only tables.
- Full backend test suite, plus baseline comparison for any unrelated failures.

## 6. Staging E2E

**NOT RUN.** No staging migration was applied, no Worker was deployed, and no ticket mutation was attempted. Real-JWT E2E must remain blocked until implementation and safe staging execution are available.

## 7. Deploy order (document only; not executed)

a) Staging only: apply reviewed/idempotent migration 0007, deploy Worker to staging, and run staging E2E with real JWT for customer ticket creation, admin assignment to another active member, chat enable, customer reply, view-as-user audit, and customer internal-note isolation.  
b) Wait for explicit owner approval.  
c) Production only after approval: migration 0007, then Worker deploy, then merge frontend branch `feat/ticket-frontend-v2`.  
d) Post-deploy: real login, create ticket, admin sees it.

## 8. Frontend response-shape mismatch

No frontend files were inspected or changed. Requested roster contracts differ between the two instructions (`/api/admin/team` includes `active`; `/api/admin/support-roster` omits it). Recommended compatibility is to return the fixed shape on each path exactly as specified. No other mismatch can be confirmed from the files inspected.

## 9. Recommendation

**DO NOT MERGE** this branch as an implementation; it contains this audit report only. Once code, test output, staging migration evidence, and E2E evidence are real and passing, recommend merge to **staging only**. Production remains prohibited without explicit owner approval. PR #161 and frontend branch remain untouched.
