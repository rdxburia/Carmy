-- Torq Desk: Safe server-side duplicate registration check
-- Verifies whether an email or mobile phone number is already registered
-- without exposing customer rows, email lists, or profile details to anonymous callers.

create or replace function public.check_registration_duplicate(
  p_email text default null,
  p_phone text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_clean_email text;
  v_clean_phone text;
  v_found boolean := false;
begin
  v_clean_email := lower(trim(coalesce(p_email, '')));
  -- Normalize phone: strip all non-digit characters
  v_clean_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_clean_phone) = 12 and v_clean_phone like '91%' then
    v_clean_phone := substr(v_clean_phone, 3);
  elsif length(v_clean_phone) = 11 and v_clean_phone like '0%' then
    v_clean_phone := substr(v_clean_phone, 2);
  end if;

  -- 1. Check email in auth.users
  if v_clean_email <> '' then
    select exists (
      select 1 from auth.users u where lower(trim(coalesce(u.email, ''))) = v_clean_email
    ) into v_found;
    if v_found then return true; end if;
  end if;

  -- 2. Check phone in public.user_profiles and auth.users raw_user_meta_data
  if v_clean_phone <> '' and length(v_clean_phone) = 10 then
    -- Check user_profiles
    select exists (
      select 1 from public.user_profiles up
      where regexp_replace(coalesce(up.phone, ''), '\D', '', 'g') like ('%' || v_clean_phone)
    ) into v_found;
    if v_found then return true; end if;

    -- Check raw_user_meta_data in auth.users
    select exists (
      select 1 from auth.users u
      where regexp_replace(coalesce(u.raw_user_meta_data->>'phone', ''), '\D', '', 'g') like ('%' || v_clean_phone)
    ) into v_found;
    if v_found then return true; end if;
  end if;

  return false;
end;
$$;

revoke all on function public.check_registration_duplicate(text, text) from public;
grant execute on function public.check_registration_duplicate(text, text) to anon, authenticated, service_role;
