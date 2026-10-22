select status, priority, count(*) from support_tickets group by status, priority;
