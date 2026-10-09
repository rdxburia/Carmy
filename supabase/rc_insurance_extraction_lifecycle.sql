-- Carmy: RC + insurance extraction metadata and lifecycle fields.
-- Extends existing cars/insurance_history/documents; no new tables or RPCs.

alter table public.cars
  add column if not exists rc_regn_date date,
  add column if not exists rc_validity date,
  add column if not exists rc_owner_relation text,
  add column if not exists rc_ownership_type text,
  add column if not exists rc_address text,
  add column if not exists rc_emission_norms text,
  add column if not exists rc_vehicle_class text,
  add column if not exists rc_maker text,
  add column if not exists rc_model text,
  add column if not exists rc_colour text,
  add column if not exists rc_body_type text,
  add column if not exists rc_seating integer,
  add column if not exists rc_unladen_weight numeric,
  add column if not exists rc_cubic_capacity numeric,
  add column if not exists rc_mfg_month_year text,
  add column if not exists rc_cylinders integer,
  add column if not exists rc_registration_authority text,
  add column if not exists rc_card_issue_date date,
  add column if not exists rc_extraction_meta jsonb not null default '{}'::jsonb;

alter table public.insurance_history
  add column if not exists policy_reg_no text,
  add column if not exists policy_chassis_no text,
  add column if not exists policy_engine_no text,
  add column if not exists insured_name text,
  add column if not exists idv_amount numeric,
  add column if not exists gross_premium_amount numeric,
  add column if not exists previous_policy_number text,
  add column if not exists previous_insurer text,
  add column if not exists policy_type text,
  add column if not exists policy_status text not null default 'archive',
  add column if not exists coverage_gap boolean not null default false,
  add column if not exists coverage_gap_days integer not null default 0,
  add column if not exists incomplete boolean not null default false,
  add column if not exists source_document_id uuid references public.documents(id) on delete set null,
  add column if not exists extraction_meta jsonb not null default '{}'::jsonb,
  add column if not exists claim_taken boolean,
  add column if not exists claim_invoice_no text;

alter table public.documents
  add column if not exists extraction_status text not null default 'not_started';

alter table public.insurance_history drop constraint if exists insurance_history_policy_status_check;
alter table public.insurance_history add constraint insurance_history_policy_status_check check(policy_status in ('current','archive','upcoming'));
alter table public.insurance_history drop constraint if exists insurance_history_claim_invoice_check;
alter table public.insurance_history add constraint insurance_history_claim_invoice_check check(claim_taken is distinct from true or nullif(btrim(claim_invoice_no),'') is not null);
alter table public.insurance_history drop constraint if exists insurance_history_coverage_gap_days_check;
alter table public.insurance_history add constraint insurance_history_coverage_gap_days_check check(coverage_gap_days >= 0);

create unique index if not exists insurance_history_car_policy_number_uq
  on public.insurance_history(car_id, lower(btrim(policy_number)))
  where policy_number is not null and btrim(policy_number) <> '';
create index if not exists insurance_history_car_status_idx
  on public.insurance_history(car_id, policy_status, issue_date desc);
create index if not exists insurance_history_source_document_idx
  on public.insurance_history(source_document_id);

with ranked as (
  select id, car_id, issue_date, expiry_date,
         lag(expiry_date) over(partition by car_id order by issue_date nulls last, created_at, id) as prev_expiry
  from public.insurance_history
)
update public.insurance_history h
set coverage_gap = (r.prev_expiry is not null and r.issue_date is not null and r.issue_date > r.prev_expiry + 1),
    coverage_gap_days = case when r.prev_expiry is not null and r.issue_date is not null and r.issue_date > r.prev_expiry + 1 then (r.issue_date-r.prev_expiry-1) else 0 end,
    policy_status = case
      when r.issue_date is not null and r.expiry_date is not null and current_date between r.issue_date and r.expiry_date then 'current'
      when r.issue_date is not null and r.issue_date > current_date then 'upcoming'
      else 'archive'
    end
from ranked r
where h.id=r.id;

notify pgrst,'reload schema';