-- CarCare Cloud: STEP 4 — service record transaction workflow
-- Run after Step 2 and Step 3 migrations.
-- These functions keep service record + service items + vehicle KM changes atomic.

create or replace function public.save_service_record(
  p_car_id uuid,
  p_service_date date,
  p_odometer_km numeric,
  p_record_type text,
  p_description text,
  p_parts_cost numeric,
  p_labour_cost numeric,
  p_other_cost numeric,
  p_workshop text,
  p_invoice_no text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_record_id uuid;
  v_current_km numeric;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.cars c where c.id=p_car_id and c.user_id=v_user) then
    raise exception 'Vehicle ownership verification failed';
  end if;
  if p_odometer_km is null or p_odometer_km < 0 then raise exception 'Invalid odometer value'; end if;
  if coalesce(p_parts_cost,0)<0 or coalesce(p_labour_cost,0)<0 or coalesce(p_other_cost,0)<0 then
    raise exception 'Costs cannot be negative';
  end if;
  if p_record_type is null or btrim(p_record_type)='' then raise exception 'Record type is required'; end if;

  select current_km into v_current_km from public.cars where id=p_car_id and user_id=v_user for update;

  insert into public.records(
    user_id,car_id,service_date,odometer_km,record_type,description,
    parts_cost,labour_cost,other_cost,workshop,invoice_no,notes
  ) values (
    v_user,p_car_id,coalesce(p_service_date,current_date),p_odometer_km,p_record_type,p_description,
    coalesce(p_parts_cost,0),coalesce(p_labour_cost,0),coalesce(p_other_cost,0),p_workshop,p_invoice_no,p_notes
  ) returning id into v_record_id;

  insert into public.record_items(record_id,item_name,quantity,brand,part_number,cost,labour,warranty,notes)
  select v_record_id,
         btrim(x.item_name),
         greatest(coalesce(x.quantity,1),0),
         nullif(btrim(x.brand),''),
         nullif(btrim(x.part_number),''),
         greatest(coalesce(x.cost,0),0),
         greatest(coalesce(x.labour,0),0),
         nullif(btrim(x.warranty),''),
         nullif(btrim(x.notes),'')
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(
    item_name text, quantity numeric, brand text, part_number text,
    cost numeric, labour numeric, warranty text, notes text
  )
  where btrim(coalesce(x.item_name,''))<>'';

  if p_odometer_km > coalesce(v_current_km,0) then
    update public.cars set current_km=p_odometer_km where id=p_car_id and user_id=v_user;
  end if;

  return v_record_id;
end;
$$;

create or replace function public.update_service_record(
  p_record_id uuid,
  p_car_id uuid,
  p_service_date date,
  p_odometer_km numeric,
  p_record_type text,
  p_description text,
  p_parts_cost numeric,
  p_labour_cost numeric,
  p_other_cost numeric,
  p_workshop text,
  p_invoice_no text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_current_km numeric;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.cars c where c.id=p_car_id and c.user_id=v_user) then raise exception 'Vehicle ownership verification failed'; end if;
  if not exists(select 1 from public.records r where r.id=p_record_id and r.car_id=p_car_id and r.user_id=v_user) then raise exception 'Service record ownership verification failed'; end if;
  if p_odometer_km is null or p_odometer_km < 0 then raise exception 'Invalid odometer value'; end if;
  if coalesce(p_parts_cost,0)<0 or coalesce(p_labour_cost,0)<0 or coalesce(p_other_cost,0)<0 then raise exception 'Costs cannot be negative'; end if;

  select current_km into v_current_km from public.cars where id=p_car_id and user_id=v_user for update;

  update public.records set
    service_date=coalesce(p_service_date,current_date),odometer_km=p_odometer_km,record_type=p_record_type,
    description=p_description,parts_cost=coalesce(p_parts_cost,0),labour_cost=coalesce(p_labour_cost,0),
    other_cost=coalesce(p_other_cost,0),workshop=p_workshop,invoice_no=p_invoice_no,notes=p_notes
  where id=p_record_id and car_id=p_car_id and user_id=v_user;

  delete from public.record_items where record_id=p_record_id;

  insert into public.record_items(record_id,item_name,quantity,brand,part_number,cost,labour,warranty,notes)
  select p_record_id,btrim(x.item_name),greatest(coalesce(x.quantity,1),0),nullif(btrim(x.brand),''),
         nullif(btrim(x.part_number),''),greatest(coalesce(x.cost,0),0),greatest(coalesce(x.labour,0),0),
         nullif(btrim(x.warranty),''),nullif(btrim(x.notes),'')
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(
    item_name text, quantity numeric, brand text, part_number text,
    cost numeric, labour numeric, warranty text, notes text
  )
  where btrim(coalesce(x.item_name,''))<>'';

  if p_odometer_km > coalesce(v_current_km,0) then
    update public.cars set current_km=p_odometer_km where id=p_car_id and user_id=v_user;
  end if;

  return p_record_id;
end;
$$;

create or replace function public.delete_service_record(
  p_record_id uuid,
  p_car_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  delete from public.records
  where id=p_record_id and car_id=p_car_id and user_id=v_user;
  if not found then raise exception 'Service record ownership verification failed'; end if;
  return true;
end;
$$;

revoke execute on function public.save_service_record(uuid,date,numeric,text,text,numeric,numeric,numeric,text,text,text,jsonb) from public,anon;
revoke execute on function public.update_service_record(uuid,uuid,date,numeric,text,text,numeric,numeric,numeric,text,text,text,jsonb) from public,anon;
revoke execute on function public.delete_service_record(uuid,uuid) from public,anon;
grant execute on function public.save_service_record(uuid,date,numeric,text,text,numeric,numeric,numeric,text,text,text,jsonb) to authenticated;
grant execute on function public.update_service_record(uuid,uuid,date,numeric,text,text,numeric,numeric,numeric,text,text,text,jsonb) to authenticated;
grant execute on function public.delete_service_record(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
