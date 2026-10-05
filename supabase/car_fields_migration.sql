-- CarCare Cloud: vehicle onboarding fields
alter table public.cars add column if not exists puc_state text;
