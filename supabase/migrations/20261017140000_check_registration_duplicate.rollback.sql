-- Torq Desk: Rollback safe server-side duplicate registration check
drop function if exists public.check_registration_duplicate(text, text);
