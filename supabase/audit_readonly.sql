-- CARMY READ-ONLY PRODUCTION DATA INTEGRITY AUDIT
-- IMPORTANT: SELECT-only. This file must NOT modify production data.
-- Run in Supabase SQL Editor with an authorized read-only/admin session.
-- Review every result set before making any correction.

-- 1) ROW COUNTS
select 'cars' as table_name, count(*)::bigint as row_count from public.cars
union all select 'records', count(*) from public.records
union all select 'record_items', count(*) from public.record_items
union all select 'documents', count(*) from public.documents
union all select 'insurance_history', count(*) from public.insurance_history
union all select 'puc_history', count(*) from public.puc_history
union all select 'policy_renewals', count(*) from public.policy_renewals
union all select 'insurance_claims', count(*) from public.insurance_claims
union all select 'sale_history', count(*) from public.sale_history;

-- 2) DUPLICATE VEHICLES PER OWNER
select user_id, lower(trim(registration_no)) as registration_no, count(*) as duplicate_count
from public.cars
group by user_id, lower(trim(registration_no))
having count(*) > 1
order by duplicate_count desc;

-- 3) ORPHAN / CROSS-OWNER CHILD ROWS
select 'records' as table_name, r.id as row_id
from public.records r
left join public.cars c on c.id=r.car_id
where c.id is null or r.user_id is distinct from c.user_id
union all
select 'insurance_history', i.id
from public.insurance_history i
left join public.cars c on c.id=i.car_id
where c.id is null or i.user_id is distinct from c.user_id
union all
select 'puc_history', p.id
from public.puc_history p
left join public.cars c on c.id=p.car_id
where c.id is null or p.user_id is distinct from c.user_id
union all
select 'policy_renewals', p.id
from public.policy_renewals p
left join public.cars c on c.id=p.car_id
where c.id is null or p.user_id is distinct from c.user_id
union all
select 'insurance_claims', i.id
from public.insurance_claims i
left join public.cars c on c.id=i.car_id
where c.id is null or i.user_id is distinct from c.user_id
union all
select 'sale_history', s.id
from public.sale_history s
left join public.cars c on c.id=s.car_id
where c.id is null or s.user_id is distinct from c.user_id
order by table_name, row_id;

-- 4) ORPHAN RECORD ITEMS
select ri.id as record_item_id, ri.record_id
from public.record_items ri
left join public.records r on r.id=ri.record_id
where r.id is null;

-- 5) SERVICE ODOMETER DECREASES (NON-ESTIMATED ONLY)
with ordered as (
  select r.*,
         lag(r.odometer_km) over (
           partition by r.car_id
           order by r.service_date, r.created_at, r.id
         ) as previous_km,
         lag(r.service_date) over (
           partition by r.car_id
           order by r.service_date, r.created_at, r.id
         ) as previous_date
  from public.records r
  where coalesce(r.is_km_estimated,false)=false
)
select id, car_id, service_date, odometer_km, previous_date, previous_km,
       (odometer_km-previous_km) as km_delta
from ordered
where previous_km is not null and odometer_km < previous_km
order by car_id, service_date;

-- 6) INSURANCE CLAIM ODOMETER DECREASES (NON-ESTIMATED)
with ordered as (
  select i.*,
         lag(i.odometer_km) over (
           partition by i.car_id
           order by i.claim_date, i.created_at, i.id
         ) as previous_km
  from public.insurance_claims i
  where coalesce(i.is_km_estimated,false)=false
    and i.odometer_km is not null
)
select id, car_id, claim_date, odometer_km, previous_km,
       (odometer_km-previous_km) as km_delta
from ordered
where previous_km is not null and odometer_km < previous_km
order by car_id, claim_date;

-- 7) ESTIMATED ODOMETER ROWS (EXPECTED EXCEPTIONS; REVIEW ONLY)
select 'record' as source_table, id, car_id, service_date as event_date,
       odometer_km, is_km_estimated, audit_note
from public.records
where coalesce(is_km_estimated,false)=true
union all
select 'insurance_claim', id, car_id, claim_date,
       odometer_km, is_km_estimated, null
from public.insurance_claims
where coalesce(is_km_estimated,false)=true
union all
select 'puc', id, car_id, issue_date,
       odometer_km, is_km_estimated, null
from public.puc_history
where coalesce(is_km_estimated,false)=true
union all
select 'insurance', id, car_id, issue_date,
       odometer_km, is_km_estimated, null
from public.insurance_history
where coalesce(is_km_estimated,false)=true
order by car_id, event_date, source_table;

-- 8) CURRENT VEHICLE KM VS MAXIMUM NON-ESTIMATED SERVICE KM
select c.id, c.registration_no, c.current_km,
       max(r.odometer_km) filter (where coalesce(r.is_km_estimated,false)=false) as max_service_km,
       c.current_km - max(r.odometer_km) filter (where coalesce(r.is_km_estimated,false)=false) as km_gap
from public.cars c
left join public.records r on r.car_id=c.id
group by c.id, c.registration_no, c.current_km
having c.current_km < coalesce(max(r.odometer_km) filter (where coalesce(r.is_km_estimated,false)=false),0)
order by c.registration_no;

-- 9) FINANCIAL RECONCILIATION FOR IMPORTED RECORDS
-- Expected: original_invoice_total = parts + labour + other + reconciliation_adjustment.
select id, car_id, service_date, invoice_no,
       original_invoice_total, total_cost, reconciliation_adjustment,
       original_invoice_total - (total_cost + coalesce(reconciliation_adjustment,0)) as unresolved_gap,
       audit_note
from public.records
where original_invoice_total is not null
  and abs(
    original_invoice_total -
    (total_cost + coalesce(reconciliation_adjustment,0))
  ) > 0.01
order by car_id, service_date;

-- 10) DUPLICATE IMPORT BATCHES
select car_id, import_batch_id, count(*) as row_count
from public.records
where source='historical_import' and nullif(trim(import_batch_id),'') is not null
group by car_id, import_batch_id
having count(*) > 1
order by car_id, import_batch_id;

-- 11) EXACT/LIKELY DUPLICATE SERVICE RECORDS
-- Same vehicle + date + odometer + invoice number is suspicious, not automatically an error.
select car_id, service_date, odometer_km,
       nullif(trim(invoice_no),'') as invoice_no,
       count(*) as duplicate_count,
       array_agg(id order by created_at,id) as record_ids
from public.records
group by car_id, service_date, odometer_km, nullif(trim(invoice_no),'')
having count(*) > 1
order by duplicate_count desc, car_id, service_date;

-- 12) SERVICE DATE / CREATED DATE SANITY
select id, car_id, service_date, created_at::date as created_date
from public.records
where service_date > created_at::date + 365
   or service_date < created_at::date - 365
order by car_id, service_date;

-- 13) INVALID FINANCIAL VALUES
select id, car_id, service_date, parts_cost, labour_cost, other_cost, total_cost
from public.records
where parts_cost < 0 or labour_cost < 0 or other_cost < 0
   or total_cost < 0
order by car_id, service_date;

select id, car_id, claim_date, parts_cost, labour_cost, insurer_paid_amount
from public.insurance_claims
where parts_cost < 0 or labour_cost < 0 or insurer_paid_amount < 0
order by car_id, claim_date;

-- 14) INVALID DATE WINDOWS
select id, car_id, issue_date, expiry_date, policy_number
from public.insurance_history
where issue_date is not null
  and expiry_date is not null
  and expiry_date < issue_date
order by car_id, issue_date;

select id, car_id, issue_date, expiry_date, certificate_number
from public.puc_history
where issue_date is not null
  and expiry_date is not null
  and expiry_date < issue_date
order by car_id, issue_date;

select id, car_id, old_expiry, new_expiry, renewal_date
from public.policy_renewals
where new_expiry is not null
  and old_expiry is not null
  and new_expiry < old_expiry
order by car_id, renewal_date;

-- 15) IMPORTED RECORDS MISSING AUDIT METADATA
select id, car_id, service_date, source, import_batch_id,
       original_invoice_total, reconciliation_adjustment, audit_note
from public.records
where source='historical_import'
  and (
    nullif(trim(import_batch_id),'') is null
    or audit_note is null
  )
order by car_id, service_date;

-- 16) INSURANCE/PUC IMPORT METADATA GAPS
select 'insurance' as source_table, id, car_id, issue_date, source, import_batch_id
from public.insurance_history
where source='historical_import'
  and nullif(trim(import_batch_id),'') is null
union all
select 'puc', id, car_id, issue_date, source, import_batch_id
from public.puc_history
where source='historical_import'
  and nullif(trim(import_batch_id),'') is null
union all
select 'claim', id, car_id, claim_date, source, import_batch_id
from public.insurance_claims
where source='historical_import'
  and nullif(trim(import_batch_id),'') is null
order by source_table, car_id, issue_date;

-- 17) DOCUMENT OWNERSHIP CONSISTENCY
select d.id, d.car_id, d.user_id, c.user_id as car_user_id, d.storage_path
from public.documents d
left join public.cars c on c.id=d.car_id
where c.id is null or d.user_id is distinct from c.user_id
order by d.created_at;

-- 18) SALE STATE CONSISTENCY
select c.id, c.registration_no, c.vehicle_status, c.sale_history_id,
       s.id as sale_id, s.status as sale_status, s.sale_date
from public.cars c
left join public.sale_history s on s.id=c.sale_history_id
where (c.vehicle_status='sold' and (c.sale_history_id is null or s.id is null or s.status <> 'completed'))
   or (c.vehicle_status='active' and c.sale_history_id is not null)
order by c.registration_no;

-- 19) RLS / SECURITY POLICY INVENTORY (READ-ONLY)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in (
    'cars','records','record_items','documents','insurance_history',
    'puc_history','policy_renewals','sale_history','insurance_claims','user_profiles'
  )
order by tablename, policyname;

-- 20) TABLE RLS STATUS
select n.nspname as schema_name,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'cars','records','record_items','documents','insurance_history',
    'puc_history','policy_renewals','sale_history','insurance_claims','user_profiles'
  )
order by c.relname;

-- END OF READ-ONLY AUDIT
