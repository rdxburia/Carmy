-- worker/manual-sql/PRECHECK-2026-10-21.sql
-- Pre-check read-only queries to run on production D1 before applying workflow schema.
-- Expected results:
-- 1. assignee_id column count: 0 (workflow columns not yet added)
-- 2. workflow object names: 0 rows (tables/view do not yet exist)
-- 3. legacy status/priority: 3 groups (open/Normal: 2, open/Urgent: 1, open/urgent: 1)

select count(*) as assignee_col_exists from pragma_table_info('support_tickets') where name = 'assignee_id';

select name from sqlite_master where name in ('ticket_events','ticket_reads','audit_log','team_members','admin_team_invites','public_ticket_events');

select status, priority, count(*) as count from support_tickets group by status, priority;
