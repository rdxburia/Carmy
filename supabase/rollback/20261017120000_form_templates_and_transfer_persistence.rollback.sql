-- Rollback for 20261017120000_form_templates_and_transfer_persistence.sql

drop policy if exists form_templates_read on public.form_templates;
drop table if exists public.form_templates;

alter table public.sale_history drop column if exists transfer_type;
alter table public.sale_history drop column if exists seller_name;
alter table public.sale_history drop column if exists seller_relation;
alter table public.sale_history drop column if exists seller_relation_name;
alter table public.sale_history drop column if exists seller_age;
alter table public.sale_history drop column if exists seller_address;
alter table public.sale_history drop column if exists seller_city;
alter table public.sale_history drop column if exists seller_state;
alter table public.sale_history drop column if exists seller_pincode;
alter table public.sale_history drop column if exists buyer_district;
alter table public.sale_history drop column if exists buyer_state;
alter table public.sale_history drop column if exists source_state;
alter table public.sale_history drop column if exists source_rto;
alter table public.sale_history drop column if exists destination_state;
alter table public.sale_history drop column if exists destination_rto;
alter table public.sale_history drop column if exists noc_status;
alter table public.sale_history drop column if exists noc_number;
alter table public.sale_history drop column if exists noc_date;
alter table public.sale_history drop column if exists noc_rto;
alter table public.sale_history drop column if exists hypothecation_type;
alter table public.sale_history drop column if exists financier_name;
alter table public.sale_history drop column if exists financier_address;
alter table public.sale_history drop column if exists template_version;
alter table public.sale_history drop column if exists raw_form_data;
