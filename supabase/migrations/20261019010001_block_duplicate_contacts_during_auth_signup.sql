-- Reconstructed staging parity migration: block_duplicate_contacts_during_auth_signup.
-- A BEFORE INSERT guard prevents duplicate email/mobile contacts from bypassing
-- the public registration preflight. It uses only the helper's boolean result.
create or replace function public.reject_duplicate_profile_contacts_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if public.check_registration_duplicate(
    new.email,
    coalesce(nullif(trim(new.phone), ''), new.raw_user_meta_data->>'phone')
  ) then
    raise exception 'An account with this email or mobile number already exists.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_duplicate_profile_contacts_on_signup() from public;
grant execute on function public.reject_duplicate_profile_contacts_on_signup() to service_role;

drop trigger if exists reject_duplicate_contacts_before_auth_signup on auth.users;
create trigger reject_duplicate_contacts_before_auth_signup
before insert on auth.users
for each row execute function public.reject_duplicate_profile_contacts_on_signup();
