-- WS-A: direct RPC must not revive an already-idle session. Use database server time.
create or replace function public.carmy_touch_session()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
  v_user_id uuid;
  v_last_activity timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_user_id := auth.uid();
  if v_session_id is null or v_user_id is null then
    raise exception 'Authenticated Supabase session is required' using errcode = '28000';
  end if;

  select s.last_activity_at into v_last_activity
  from public.carmy_session_activity s
  where s.session_id = v_session_id and s.user_id = v_user_id
  for update;

  -- A missing row can be initialized only for a recently issued token; an old token
  -- must not bootstrap a fresh activity row after the idle window has elapsed.
  if not found then
    if coalesce((auth.jwt() ->> 'iat')::bigint, 0) < extract(epoch from v_now)::bigint - 120 then
      raise exception 'Session idle timeout' using errcode = '28000';
    end if;
    insert into public.carmy_session_activity(session_id, user_id, last_activity_at)
    values (v_session_id, v_user_id, v_now);
  else
    if v_last_activity <= v_now - interval '120 seconds' then
      raise exception 'Session idle timeout' using errcode = '28000';
    end if;
    update public.carmy_session_activity
      set last_activity_at = v_now
      where session_id = v_session_id and user_id = v_user_id;
  end if;
  return true;
end;
$$;

-- Match the read guard to the exact same 120-second database-clock boundary.
create or replace function public.carmy_session_is_active()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.carmy_session_activity s
    where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.user_id = auth.uid()
      and s.last_activity_at > clock_timestamp() - interval '120 seconds'
  );
$$;

revoke all on function public.carmy_touch_session() from public, anon;
revoke all on function public.carmy_session_is_active() from public, anon;
grant execute on function public.carmy_touch_session() to authenticated;
grant execute on function public.carmy_session_is_active() to authenticated;
