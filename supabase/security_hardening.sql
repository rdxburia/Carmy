-- CarCare Cloud security hardening migration
-- Run in Supabase SQL Editor after the existing schema.
revoke all on table public.cars, public.records, public.record_items, public.documents from anon;
grant select, insert, update, delete on table public.cars, public.records, public.record_items, public.documents to authenticated;

drop policy if exists cars_owner on public.cars;
drop policy if exists records_owner on public.records;
drop policy if exists items_owner on public.record_items;
drop policy if exists documents_owner on public.documents;

create policy cars_owner_authenticated on public.cars for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy records_owner_authenticated on public.records for all to authenticated
using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.cars c where c.id = car_id and c.user_id = (select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.cars c where c.id = car_id and c.user_id = (select auth.uid()))
);

create policy items_owner_authenticated on public.record_items for all to authenticated
using (exists (
  select 1 from public.records r
  where r.id = record_id and r.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.records r
  where r.id = record_id and r.user_id = (select auth.uid())
));

create policy documents_owner_authenticated on public.documents for all to authenticated
using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.cars c where c.id = car_id and c.user_id = (select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.cars c where c.id = car_id and c.user_id = (select auth.uid()))
);

create index if not exists cars_user_id_idx on public.cars(user_id);
create index if not exists records_user_id_idx on public.records(user_id);
create index if not exists records_car_id_service_date_idx on public.records(car_id, service_date desc);
create index if not exists record_items_record_id_idx on public.record_items(record_id);
create index if not exists documents_user_id_idx on public.documents(user_id);
create index if not exists documents_car_id_idx on public.documents(car_id);

insert into storage.buckets(id,name,public)
values('car-documents','car-documents',false)
on conflict(id) do update set public=false;

drop policy if exists storage_read on storage.objects;
drop policy if exists storage_insert on storage.objects;
drop policy if exists storage_update on storage.objects;
drop policy if exists storage_delete on storage.objects;

create policy storage_read_own on storage.objects for select to authenticated
using (bucket_id='car-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

create policy storage_insert_own on storage.objects for insert to authenticated
with check (bucket_id='car-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

create policy storage_update_own on storage.objects for update to authenticated
using (bucket_id='car-documents' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='car-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

create policy storage_delete_own on storage.objects for delete to authenticated
using (bucket_id='car-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Performance hardening: avoid per-row auth evaluation in RLS policies.
drop policy if exists "Users can insert own security" on public.user_security;
create policy "Users can insert own security" on public.user_security
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own security" on public.user_security;
create policy "Users can update own security" on public.user_security
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own security" on public.user_security;
create policy "Users can view own security" on public.user_security
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists insurance_claims_owner on public.insurance_claims;
create policy insurance_claims_owner on public.insurance_claims
for all to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.cars c
    where c.id = insurance_claims.car_id
      and c.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.cars c
    where c.id = insurance_claims.car_id
      and c.user_id = (select auth.uid())
  )
);

-- Remove the duplicate records(car_id, service_date) index.
drop index if exists public.records_car_date_idx;
drop index if exists public.records_car_id_service_date_idx;
create index if not exists records_car_id_service_date_idx
on public.records(car_id, service_date desc);
