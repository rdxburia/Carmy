-- Carmy: PUC extraction lifecycle. Reuses public.puc_history; no new table/RPC.
alter table public.puc_history add column if not exists cost numeric;
create unique index if not exists puc_history_car_certificate_norm_uq
  on public.puc_history(car_id, upper(regexp_replace(btrim(certificate_number),'[^A-Za-z0-9]','','g')))
  where certificate_number is not null and btrim(certificate_number) <> '';
create index if not exists puc_history_car_expiry_idx
  on public.puc_history(car_id, expiry_date desc, created_at desc);
alter table public.puc_history drop constraint if exists puc_history_date_order_check;
alter table public.puc_history add constraint puc_history_date_order_check
  check(expiry_date is null or issue_date is null or expiry_date >= issue_date);
notify pgrst,'reload schema';