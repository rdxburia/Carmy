-- CarCare Cloud: HISTORICAL IMPORT FINALIZATION
-- Run after historical_import_phase1.sql and Step 5.
-- Phase 1 remains preview-only until this function is installed.
-- Final import is one RPC call so the database transaction is atomic.

alter table public.records add column if not exists subcategory text;
alter table public.records add column if not exists original_invoice_total numeric;
alter table public.records add column if not exists reconciliation_adjustment numeric default 0;
alter table public.records add column if not exists audit_note text;

grant select,insert,update,delete on public.records to authenticated;
grant select,insert,update,delete on public.record_items to authenticated;
grant select,insert,update,delete on public.insurance_history to authenticated;
grant select,insert,update,delete on public.puc_history to authenticated;
grant select,insert,update,delete on public.insurance_claims to authenticated;

create or replace function public.import_historical_batch(
  p_car_id uuid,
  p_import_batch_id text,
  p_payload jsonb
) returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_rec jsonb;
  v_item jsonb;
  v_id uuid;
  v_policy_id uuid;
  v_policy jsonb;
  v_count_records int := 0;
  v_count_items int := 0;
  v_count_puc int := 0;
  v_count_insurance int := 0;
  v_count_claims int := 0;
  v_warnings int := coalesce(jsonb_array_length(coalesce(p_payload->'warnings','[]'::jsonb)),0);
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not exists(select 1 from public.cars c where c.id=p_car_id and c.user_id=v_user) then
    raise exception 'Vehicle ownership verification failed';
  end if;

  if coalesce(nullif(btrim(p_import_batch_id),''),'')='' then
    raise exception 'Import batch id is required';
  end if;

  if v_warnings > 0 then
    raise exception 'Import blocked: % warning(s) remain unresolved', v_warnings;
  end if;

  if exists(select 1 from public.records where car_id=p_car_id and import_batch_id=p_import_batch_id)
     or exists(select 1 from public.puc_history where car_id=p_car_id and source='historical_import' and p_import_batch_id=coalesce((p_payload->>'import_batch_id'),p_import_batch_id))
     or exists(select 1 from public.insurance_history where car_id=p_car_id and source='historical_import' and p_import_batch_id=coalesce((p_payload->>'import_batch_id'),p_import_batch_id))
     or exists(select 1 from public.insurance_claims where car_id=p_car_id and import_batch_id=p_import_batch_id) then
    raise exception 'This historical import batch was already imported';
  end if;

  create temporary table tmp_import_policies(
    policy_number text primary key,
    policy_id uuid not null
  ) on commit drop;

  -- Insurance policies
  for v_policy in
    select value
    from jsonb_array_elements(coalesce(p_payload->'records','[]'::jsonb))
    where value->>'kind'='insurance'
  loop
    insert into public.insurance_history(
      user_id,car_id,insurance_company,policy_number,insurance_type,insurance_addons,
      issue_date,expiry_date,event_type,source,premium_amount,odometer_km,is_km_estimated
    )
    values(
      v_user,p_car_id,
      nullif(v_policy->>'company',''),
      nullif(v_policy->>'policy_number',''),
      case when nullif(v_policy->>'policy_type','') is null then '{}'::text[] else array[v_policy->>'policy_type'] end,
      coalesce(
        case when v_policy->>'policy_addons' is null then null else
          array(select jsonb_array_elements_text(v_policy->'policy_addons'))
        end,
        '{}'::text[]
      ),
      nullif(v_policy->>'issued_date','')::date,
      nullif(v_policy->>'valid_till','')::date,
      'historical_import',
      'historical_import',
      nullif(v_policy->>'premium','')::numeric,
      nullif(v_policy->>'odometer_km','')::numeric,
      coalesce((v_policy->>'is_km_estimated')::boolean,false)
    )
    returning id into v_id;

    insert into tmp_import_policies(policy_number,policy_id)
    values(coalesce(v_policy->>'policy_number',''),v_id)
    on conflict(policy_number) do update set policy_id=excluded.policy_id;

    v_count_insurance := v_count_insurance + 1;
  end loop;

  -- Regular/Other/Battery/Tyre/Repair records and their item rows
  for v_rec in
    select value
    from jsonb_array_elements(coalesce(p_payload->'records','[]'::jsonb))
    where value->>'kind'='record'
    order by value->>'date'
  loop
    insert into public.records(
      user_id,car_id,service_date,odometer_km,record_type,subcategory,description,
      parts_cost,labour_cost,other_cost,workshop,invoice_no,notes,
      source,import_batch_id,is_km_estimated,original_invoice_total,
      reconciliation_adjustment,audit_note
    )
    values(
      v_user,p_car_id,
      (v_rec->>'date')::date,
      coalesce((v_rec->>'odometer_km')::numeric,0),
      coalesce(nullif(v_rec->>'record_type',''),'Other'),
      nullif(v_rec->>'subcategory',''),
      nullif(v_rec->>'description',''),
      coalesce((v_rec->>'parts_cost')::numeric,0),
      coalesce((v_rec->>'labour_cost')::numeric,0),
      coalesce((v_rec->>'other_cost')::numeric,0),
      nullif(v_rec->>'workshop',''),
      nullif(v_rec->>'invoice_number',''),
      nullif(v_rec->>'audit_note',''),
      'historical_import',
      p_import_batch_id,
      coalesce((v_rec->>'is_km_estimated')::boolean,false),
      nullif(v_rec->>'original_invoice_total','')::numeric,
      coalesce((v_rec->>'reconciliation_adjustment')::numeric,0),
      nullif(v_rec->>'audit_note','')
    )
    returning id into v_id;

    v_count_records := v_count_records + 1;

    for v_item in select value from jsonb_array_elements(coalesce(v_rec->'items','[]'::jsonb))
    loop
      insert into public.record_items(
        record_id,item_name,quantity,brand,part_number,cost,labour,warranty,notes
      )
      values(
        v_id,
        coalesce(nullif(v_item->>'name',''),nullif(v_item->>'item_name',''),'Imported Item'),
        coalesce(nullif(v_item->>'quantity','')::numeric,1),
        nullif(v_item->>'brand',''),
        nullif(v_item->>'part_number',''),
        coalesce(nullif(v_item->>'cost','')::numeric,0),
        coalesce(nullif(v_item->>'labour','')::numeric,0),
        nullif(v_item->>'warranty',''),
        nullif(v_item->>'notes','')
      );
      v_count_items := v_count_items + 1;
    end loop;
  end loop;

  -- PUC history
  for v_rec in
    select value
    from jsonb_array_elements(coalesce(p_payload->'records','[]'::jsonb))
    where value->>'kind'='puc'
    order by value->>'date'
  loop
    insert into public.puc_history(
      user_id,car_id,certificate_number,state,issue_date,expiry_date,
      event_type,source,odometer_km,is_km_estimated,cost,validity_months
    )
    values(
      v_user,p_car_id,
      nullif(v_rec->>'puc_number',''),
      nullif(v_rec->>'state',''),
      (v_rec->>'date')::date,
      nullif(v_rec->>'valid_till','')::date,
      'historical_import',
      'historical_import',
      nullif(v_rec->>'odometer_km','')::numeric,
      coalesce((v_rec->>'is_km_estimated')::boolean,false),
      nullif(v_rec->>'cost','')::numeric,
      case
        when v_rec->>'date' is not null and v_rec->>'valid_till' is not null
        then greatest(0,round(extract(epoch from ((v_rec->>'valid_till')::date-(v_rec->>'date')::date))/86400/30.4375))::int
        else null
      end
    );
    v_count_puc := v_count_puc + 1;
  end loop;

  -- Insurance claims
  for v_rec in
    select value
    from jsonb_array_elements(coalesce(p_payload->'records','[]'::jsonb))
    where value->>'kind'='claim'
    order by value->>'date'
  loop
    v_policy_id := null;

    if nullif(v_rec->>'linked_policy_number','') is not null then
      select policy_id into v_policy_id
      from tmp_import_policies
      where policy_number=v_rec->>'linked_policy_number'
      limit 1;
    end if;

    if v_policy_id is null and nullif(v_rec->>'company','') is not null then
      select ih.id into v_policy_id
      from public.insurance_history ih
      where ih.car_id=p_car_id
        and ih.source='historical_import'
        and ih.insurance_company=v_rec->>'company'
        and (ih.issue_date is null or ih.issue_date <= (v_rec->>'date')::date)
        and (ih.expiry_date is null or ih.expiry_date >= (v_rec->>'date')::date)
      order by ih.issue_date desc nulls last
      limit 1;
    end if;

    insert into public.insurance_claims(
      user_id,car_id,policy_id,claim_date,odometer_km,is_km_estimated,
      workshop_name,invoice_number,reason,parts_changed,parts_cost,labour_cost,
      insurer_paid_amount,source,import_batch_id
    )
    values(
      v_user,p_car_id,v_policy_id,
      (v_rec->>'date')::date,
      nullif(v_rec->>'odometer_km','')::numeric,
      coalesce((v_rec->>'is_km_estimated')::boolean,false),
      nullif(v_rec->>'workshop',''),
      nullif(v_rec->>'invoice_number',''),
      nullif(v_rec->>'description',''),
      nullif(v_rec->>'parts_changed',''),
      coalesce((v_rec->>'parts_cost')::numeric,0),
      coalesce((v_rec->>'labour_cost')::numeric,0),
      coalesce((v_rec->>'total_cost')::numeric,0),
      'historical_import',
      p_import_batch_id
    );
    v_count_claims := v_count_claims + 1;
  end loop;

  return jsonb_build_object(
    'import_batch_id',p_import_batch_id,
    'records',v_count_records,
    'record_items',v_count_items,
    'puc',v_count_puc,
    'insurance',v_count_insurance,
    'claims',v_count_claims
  );
end;
$$;

revoke execute on function public.import_historical_batch(uuid,text,jsonb) from public,anon;
grant execute on function public.import_historical_batch(uuid,text,jsonb) to authenticated;

notify pgrst,'reload schema';
