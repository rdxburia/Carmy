-- CarCare Cloud: STEP 3 — document security hardening
-- Run this AFTER Step 2's duplicate check/index migration.
-- This migration is intentionally separate and is NOT executed automatically.

-- 1) Server-enforced bucket restrictions.
-- 10 MiB maximum; only the document types accepted by the app.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png'
    ]
where id = 'car-documents';

-- 2) Defense-in-depth checks on the document metadata table.
-- These do not replace Storage's bucket enforcement.
alter table public.documents
  drop constraint if exists documents_file_size_limit_check;

alter table public.documents
  add constraint documents_file_size_limit_check
  check (file_size is null or (file_size >= 1 and file_size <= 10485760));

alter table public.documents
  drop constraint if exists documents_mime_type_check;

alter table public.documents
  add constraint documents_mime_type_check
  check (
    mime_type is null
    or mime_type in ('application/pdf','image/jpeg','image/png')
  );

-- 3) Storage ownership must match BOTH:
--    folder 1 = authenticated user id
--    folder 2 = a vehicle owned by that same authenticated user.
--
-- Current app path:
-- user_id / car_id / active|archives / document_type / filename
--
-- We compare car.id::text rather than casting an untrusted path token to uuid,
-- so malformed paths simply fail the policy instead of raising a cast error.

drop policy if exists storage_read_own on storage.objects;
drop policy if exists storage_insert_own on storage.objects;
drop policy if exists storage_update_own on storage.objects;
drop policy if exists storage_delete_own on storage.objects;

create policy storage_read_own_vehicle on storage.objects
for select to authenticated
using (
  bucket_id = 'car-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and c.user_id = (select auth.uid())
  )
);

create policy storage_insert_own_vehicle on storage.objects
for insert to authenticated
with check (
  bucket_id = 'car-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and c.user_id = (select auth.uid())
  )
);

create policy storage_update_own_vehicle on storage.objects
for update to authenticated
using (
  bucket_id = 'car-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and c.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'car-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and c.user_id = (select auth.uid())
  )
);

create policy storage_delete_own_vehicle on storage.objects
for delete to authenticated
using (
  bucket_id = 'car-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and c.user_id = (select auth.uid())
  )
);

-- 4) Useful indexes for the vehicle ownership checks.
create index if not exists cars_id_user_id_idx
on public.cars(id, user_id);

create index if not exists documents_user_car_idx
on public.documents(user_id, car_id);

notify pgrst, 'reload schema';
