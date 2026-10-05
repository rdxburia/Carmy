-- CarCare Cloud: STEP 5 — ownership profile, compliance history & sold lifecycle
-- Run AFTER Steps 1–4. Do not run this file before the previous migrations.

create table if not exists public.user_profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address text,
  city text,
  state text,
  pincode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.insurance_history(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  insurance_company text,
  policy_number text,
  insurance_type text[] default '{}',
  insurance_addons text[] default '{}',
  issue_date date,
  expiry_date date,
  event_type text not null default 'snapshot',
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.puc_history(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  certificate_number text,
  state text,
  validity_months int,
  issue_date date,
  expiry_date date,
  event_type text not null default 'snapshot',
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.policy_renewals(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  policy_type text not null check(policy_type in ('insurance','puc')),
  old_expiry date,
  new_expiry date,
  old_policy_number text,
  new_policy_number text,
  old_certificate_number text,
  new_certificate_number text,
  renewal_date date not null default current_date,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_history(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  buyer_name text not null,
  buyer_relation text,
  buyer_relation_name text,
  buyer_age int,
  buyer_address text,
  buyer_rto text,
  sale_date date not null,
  financier text,
  form_document_id uuid references public.documents(id) on delete set null,
  status text not null default 'completed' check(status in ('completed','cancelled')),
  created_at timestamptz not null default now()
);

alter table public.cars add column if not exists vehicle_status text not null default 'active';
alter table public.cars add column if not exists sold_at timestamptz;
alter table public.cars add column if not exists sold_to_name text;
alter table public.cars add column if not exists sale_history_id uuid;
alter table public.cars drop constraint if exists cars_vehicle_status_check;
alter table public.cars add constraint cars_vehicle_status_check check(vehicle_status in ('active','sold'));

create index if not exists insurance_history_car_created_idx on public.insurance_history(car_id,created_at desc);
create index if not exists puc_history_car_created_idx on public.puc_history(car_id,created_at desc);
create index if not exists policy_renewals_car_date_idx on public.policy_renewals(car_id,renewal_date desc);
create index if not exists sale_history_car_date_idx on public.sale_history(car_id,sale_date desc);
create index if not exists cars_status_idx on public.cars(user_id,vehicle_status);

alter table public.user_profiles enable row level security;
alter table public.insurance_history enable row level security;
alter table public.puc_history enable row level security;
alter table public.policy_renewals enable row level security;
alter table public.sale_history enable row level security;

drop policy if exists user_profiles_owner on public.user_profiles;
create policy user_profiles_owner on public.user_profiles for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists insurance_history_owner on public.insurance_history;
create policy insurance_history_owner on public.insurance_history for all to authenticated using(auth.uid()=user_id and exists(select 1 from public.cars c where c.id=car_id and c.user_id=auth.uid())) with check(auth.uid()=user_id and exists(select 1 from public.cars c where c.id=car_id and c.user_id=auth.uid()));
drop policy if exists puc_history_owner on public.puc_history;
create policy puc_history_owner on public.puc_history for all to authenticated using(auth.uid()=user_id and exists(select 1 from public.cars c where c.id=car_id and c.user_id=auth.uid())) with check(auth.uid()=user_id and exists(select 1 from public.cars c where c.id=car_id and c.user_id=auth.uid()));
drop policy if exists policy_renewals_owner on public.policy_renewals;
create policy policy_renewals_owner on public.policy_renewals for all to authenticated using(auth.uid()=user_id and exists(select 1 from public.cars c where c.id=car_id and c.user_id=auth.uid())) with check(auth.uid()=user_id and exists(select 1 from public.cars c where c.id=car_id and c.user_id=auth.uid()));
drop policy if exists sale_history_owner on public.sale_history;
create policy sale_history_owner on public.sale_history for all to authenticated using(auth.uid()=user_id and exists(select 1 from public.cars c where c.id=car_id and c.user_id=auth.uid())) with check(auth.uid()=user_id and exists(select 1 from public.cars c where c.id=car_id and c.user_id=auth.uid()));

create or replace function public.record_car_compliance_history()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if tg_op='INSERT' then
    insert into public.insurance_history(user_id,car_id,insurance_company,policy_number,insurance_type,insurance_addons,expiry_date,event_type,source)
    values(NEW.user_id,NEW.id,NEW.insurance_company,NEW.insurance_number,coalesce(NEW.insurance_type,'{}'),coalesce(NEW.insurance_addons,'{}'),NEW.insurance_expiry,'created','car_profile');
    insert into public.puc_history(user_id,car_id,certificate_number,state,validity_months,expiry_date,event_type,source)
    values(NEW.user_id,NEW.id,NEW.puc_certificate_no,NEW.puc_state,NEW.puc_validity_months,NEW.puc_expiry,'created','car_profile');
  else
    if NEW.insurance_company is distinct from OLD.insurance_company or NEW.insurance_number is distinct from OLD.insurance_number or NEW.insurance_type is distinct from OLD.insurance_type or NEW.insurance_addons is distinct from OLD.insurance_addons or NEW.insurance_expiry is distinct from OLD.insurance_expiry then
      insert into public.insurance_history(user_id,car_id,insurance_company,policy_number,insurance_type,insurance_addons,expiry_date,event_type,source)
      values(NEW.user_id,NEW.id,NEW.insurance_company,NEW.insurance_number,coalesce(NEW.insurance_type,'{}'),coalesce(NEW.insurance_addons,'{}'),NEW.insurance_expiry,'updated','car_profile');
    end if;
    if NEW.puc_certificate_no is distinct from OLD.puc_certificate_no or NEW.puc_state is distinct from OLD.puc_state or NEW.puc_validity_months is distinct from OLD.puc_validity_months or NEW.puc_expiry is distinct from OLD.puc_expiry then
      insert into public.puc_history(user_id,car_id,certificate_number,state,validity_months,expiry_date,event_type,source)
      values(NEW.user_id,NEW.id,NEW.puc_certificate_no,NEW.puc_state,NEW.puc_validity_months,NEW.puc_expiry,'updated','car_profile');
    end if;
  end if;
  if tg_op='UPDATE' and NEW.insurance_expiry is distinct from OLD.insurance_expiry and NEW.insurance_expiry is not null then
    insert into public.policy_renewals(user_id,car_id,policy_type,old_expiry,new_expiry,old_policy_number,new_policy_number,renewal_date,source)
    values(NEW.user_id,NEW.id,'insurance',OLD.insurance_expiry,NEW.insurance_expiry,OLD.insurance_number,NEW.insurance_number,current_date,'car_profile');
  end if;
  if tg_op='UPDATE' and NEW.puc_expiry is distinct from OLD.puc_expiry and NEW.puc_expiry is not null then
    insert into public.policy_renewals(user_id,car_id,policy_type,old_expiry,new_expiry,old_certificate_number,new_certificate_number,renewal_date,source)
    values(NEW.user_id,NEW.id,'puc',OLD.puc_expiry,NEW.puc_expiry,OLD.puc_certificate_no,NEW.puc_certificate_no,current_date,'car_profile');
  end if;
  return NEW;
end; $$;

drop trigger if exists cars_compliance_history_trigger on public.cars;
create trigger cars_compliance_history_trigger after insert or update of insurance_company,insurance_number,insurance_type,insurance_addons,insurance_expiry,puc_certificate_no,puc_state,puc_validity_months,puc_expiry on public.cars for each row execute function public.record_car_compliance_history();

create or replace function public.complete_vehicle_sale(
  p_car_id uuid,
  p_buyer_name text,
  p_buyer_relation text,
  p_buyer_relation_name text,
  p_buyer_age int,
  p_buyer_address text,
  p_buyer_rto text,
  p_sale_date date,
  p_financier text,
  p_form_document_id uuid default null
) returns uuid language plpgsql security invoker set search_path=public as $$
declare v_user uuid:=auth.uid(); v_sale_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_buyer_name is null or btrim(p_buyer_name)='' then raise exception 'Buyer name is required'; end if;
  if p_sale_date is null then raise exception 'Sale date is required'; end if;
  if not exists(select 1 from public.cars where id=p_car_id and user_id=v_user) then raise exception 'Vehicle ownership verification failed'; end if;
  if exists(select 1 from public.cars where id=p_car_id and user_id=v_user and vehicle_status='sold') then raise exception 'Vehicle is already marked as sold'; end if;
  insert into public.sale_history(user_id,car_id,buyer_name,buyer_relation,buyer_relation_name,buyer_age,buyer_address,buyer_rto,sale_date,financier,form_document_id)
  values(v_user,p_car_id,btrim(p_buyer_name),p_buyer_relation,p_buyer_relation_name,p_buyer_age,p_buyer_address,p_buyer_rto,p_sale_date,p_financier,p_form_document_id)
  returning id into v_sale_id;
  update public.cars set vehicle_status='sold',sold_at=now(),sold_to_name=btrim(p_buyer_name),sale_history_id=v_sale_id where id=p_car_id and user_id=v_user;
  return v_sale_id;
end; $$;

revoke all on table public.user_profiles,public.insurance_history,public.puc_history,public.policy_renewals,public.sale_history from anon;
revoke execute on function public.complete_vehicle_sale(uuid,text,text,text,int,text,text,date,text,uuid) from public,anon;
grant execute on function public.complete_vehicle_sale(uuid,text,text,text,int,text,text,date,text,uuid) to authenticated;
notify pgrst,'reload schema';