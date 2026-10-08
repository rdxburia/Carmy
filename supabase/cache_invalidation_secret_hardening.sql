-- CarCare Cloud cache invalidation secret hardening
-- The webhook secret is stored in Supabase Vault and is never embedded
-- in trigger definitions or repository source.

create schema if not exists private;

create or replace function private.carmy_cache_invalidation_request()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $function$
declare
  request_id bigint;
  payload jsonb;
  webhook_secret text;
begin
  select decrypted_secret
    into webhook_secret
  from vault.decrypted_secrets
  where name = 'carmy_cache_invalidation_webhook_secret'
  limit 1;

  if webhook_secret is null or webhook_secret = '' then
    raise exception 'cache invalidation webhook secret is not configured';
  end if;

  payload = jsonb_build_object(
    'old_record', old,
    'record', new,
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema
  );

  select http_post into request_id
  from net.http_post(
    'https://carmy-api.mr-rny-buria.workers.dev/api/cache/invalidate',
    payload,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-carmy-webhook-secret', webhook_secret
    ),
    5000
  );

  insert into supabase_functions.hooks
    (hook_table_id, hook_name, request_id)
  values
    (tg_relid, tg_name, request_id);

  return coalesce(new, old);
end
$function$;

revoke all on function private.carmy_cache_invalidation_request() from public;
revoke all on function private.carmy_cache_invalidation_request() from anon;
revoke all on function private.carmy_cache_invalidation_request() from authenticated;
revoke all on function private.carmy_cache_invalidation_request() from service_role;
grant execute on function private.carmy_cache_invalidation_request() to postgres;

drop trigger if exists carmy_cars_cache_invalidation on public.cars;
create trigger carmy_cars_cache_invalidation
after insert or delete or update on public.cars
for each row execute function private.carmy_cache_invalidation_request();

drop trigger if exists carmy_records_cache_invalidation on public.records;
create trigger carmy_records_cache_invalidation
after insert or delete or update on public.records
for each row execute function private.carmy_cache_invalidation_request();

drop trigger if exists carmy_documents_cache_invalidation on public.documents;
create trigger carmy_documents_cache_invalidation
after insert or delete or update on public.documents
for each row execute function private.carmy_cache_invalidation_request();

drop trigger if exists carmy_insurance_history_cache_invalidation on public.insurance_history;
create trigger carmy_insurance_history_cache_invalidation
after insert or delete or update on public.insurance_history
for each row execute function private.carmy_cache_invalidation_request();

drop trigger if exists carmy_puc_history_cache_invalidation on public.puc_history;
create trigger carmy_puc_history_cache_invalidation
after insert or delete or update on public.puc_history
for each row execute function private.carmy_cache_invalidation_request();

drop trigger if exists carmy_policy_renewals_cache_invalidation on public.policy_renewals;
create trigger carmy_policy_renewals_cache_invalidation
after insert or delete or update on public.policy_renewals
for each row execute function private.carmy_cache_invalidation_request();

drop trigger if exists carmy_sale_history_cache_invalidation on public.sale_history;
create trigger carmy_sale_history_cache_invalidation
after insert or delete or update on public.sale_history
for each row execute function private.carmy_cache_invalidation_request();

drop trigger if exists carmy_user_profiles_cache_invalidation on public.user_profiles;
create trigger carmy_user_profiles_cache_invalidation
after insert or delete or update on public.user_profiles
for each row execute function private.carmy_cache_invalidation_request();


drop function if exists public.carmy_cache_invalidation_request();
