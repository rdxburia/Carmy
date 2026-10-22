-- worker/manual-sql/VERIFY-2026-10-21.sql
-- Post-run verification queries to run on production D1 after applying workflow schema.
-- Expected results:
-- 1. All 7 workflow columns present in support_tickets (count = 7)
-- 2. All 6 workflow objects created (5 tables + 1 view)
-- 3. Normalized status/priority: 2 groups (pending/normal: 2, pending/urgent: 2)

select count(*) as workflow_cols_count from pragma_table_info('support_tickets') where name in ('assignee_id','chat_enabled','chat_enabled_until','sla_due_at','closed_at','reopen_until','show_agent_name');

select name, type from sqlite_master where name in ('ticket_events','ticket_reads','audit_log','team_members','admin_team_invites','public_ticket_events') order by name;

select status, priority, count(*) as count from support_tickets group by status, priority;
