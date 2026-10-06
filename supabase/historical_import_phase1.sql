-- CarCare Cloud: HISTORICAL IMPORT FOUNDATION
-- Phase 1 schema only. No historical rows are inserted by this migration.
-- Run after Step 5.

alter table public.records add column if not exists source text not null default 'manual';
alter table public.records add column if not exists import_batch_id text;
alter table public.records add column if not exists is_km_estimated boolean not null default false;

alter table public.insurance_history add column if not exists premium_amount numeric;
alter table public.insurance_history add column if not exists odometer_km numeric;
alter table public.insurance_history add column if not exists is_km_estimated boolean not null default false;

alter table public.puc_history add column if not exists odometer_km numeric;
alter table public.puc_history add column if not exists is_km_estimated boolean not null default false;
alter table public.puc_history add column if not exists cost numeric;

create table if not exists public.insurance_claims(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  policy_id uuid references public.insurance_history(id) on delete set null,
  claim_date date not null,
  odometer_km numeric,
  is_km_estimated boolean not null default false,
  workshop_name text,
  invoice_number text,
  reason text,
  parts_changed text,
  parts_cost numeric default 0,
  labour_cost numeric default 0,
  insurer_paid_amount numeric default 0,
  source text not null default 'manual',
  import_batch_id text,
  created_at timestamptz not null default now()
);

create index if not exists records_car_date_idx on public.records(car_id,service_date desc);
create index if not exists records_import_batch_idx on public.records(user_id,import_batch_id);
create index if not exists insurance_claims_car_date_idx on public.insurance_claims(car_id,claim_date desc);
create index if not exists insurance_claims_policy_idx on public.insurance_claims(policy_id);

alter table public.insurance_claims enable row level security;
drop policy if exists insurance_claims_owner on public.insurance_claims;
create policy insurance_claims_owner on public.insurance_claims
for all to authenticated
using(auth.uid()=user_id and exists(select 1 from public.cars c where c.id=car_id and c.user_id=auth.uid()))
with check(auth.uid()=user_id and exists(select 1 from public.cars c where c.id=car_id and c.user_id=auth.uid()));

revoke all on table public.insurance_claims from anon;
grant select,insert,update,delete on public.insurance_claims to authenticated;

notify pgrst,'reload schema';
