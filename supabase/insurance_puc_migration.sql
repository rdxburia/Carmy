-- CarCare Cloud: insurance / PUC detail migration
alter table public.cars add column if not exists insurance_number text;
alter table public.cars add column if not exists insurance_type text[] default '{}';
alter table public.cars add column if not exists insurance_addons text[] default '{}';
alter table public.cars add column if not exists puc_validity_months int;