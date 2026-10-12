-- WS-A: enforce the two-minute idle deadline in PostgreSQL RLS, including direct
-- PostgREST/RPC/Storage calls that do not pass through the Cloudflare Worker.
create table if not exists public.carmy_session_activity (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_activity_at timestamptz not null default clock_timestamp()
);

alter table public.carmy_session_activity enable row level security;
revoke all on public.carmy_session_activity from anon, authenticated;

create or replace function public.carmy_touch_session()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
  v_user_id uuid;
begin
  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_user_id := auth.uid();
  if v_session_id is null or v_user_id is null then
    raise exception 'Authenticated Supabase session is required' using errcode = '28000';
  end if;

  insert into public.carmy_session_activity(session_id, user_id, last_activity_at)
  values (v_session_id, v_user_id, clock_timestamp())
  on conflict (session_id) do update
    set user_id = excluded.user_id,
        last_activity_at = excluded.last_activity_at
    where public.carmy_session_activity.user_id = excluded.user_id;

  if not found then
    raise exception 'Session identity mismatch' using errcode = '28000';
  end if;
  return true;
end;
$$;

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

-- Restrictive policies are ANDed with existing owner policies; they do not replace
-- row ownership checks. Existing data and permissive policies remain untouched.
create policy carmy_idle_guard_cars on public.cars as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());
create policy carmy_idle_guard_records on public.records as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());
create policy carmy_idle_guard_record_items on public.record_items as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());
create policy carmy_idle_guard_documents on public.documents as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());
create policy carmy_idle_guard_user_profiles on public.user_profiles as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());
create policy carmy_idle_guard_user_security on public.user_security as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());
create policy carmy_idle_guard_insurance_history on public.insurance_history as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());
create policy carmy_idle_guard_puc_history on public.puc_history as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());
create policy carmy_idle_guard_policy_renewals on public.policy_renewals as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());
create policy carmy_idle_guard_sale_history on public.sale_history as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());
create policy carmy_idle_guard_insurance_claims on public.insurance_claims as restrictive
  for all to authenticated using (public.carmy_session_is_active())
  with check (public.carmy_session_is_active());

-- Scope the storage guard to this application's private legacy bucket only.
create policy carmy_idle_guard_car_documents on storage.objects as restrictive
  for all to authenticated
  using (bucket_id <> 'car-documents' or public.carmy_session_is_active())
  with check (bucket_id <> 'car-documents' or public.carmy_session_is_active());

create index if not exists carmy_session_activity_user_id_idx
  on public.carmy_session_activity(user_id);
