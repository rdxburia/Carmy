begin;
create table if not exists public.ws_onboarding_applications (
 id uuid primary key default gen_random_uuid(),
 workshop_name text not null check(length(btrim(workshop_name)) between 2 and 160),
 owner_name text not null check(length(btrim(owner_name)) between 2 and 120),
 email text not null,
 email_normalized text generated always as(lower(btrim(email))) stored,
 phone text not null,
 phone_normalized text generated always as(regexp_replace(phone,'[^0-9]','','g')) stored,
 city text not null, state text not null, address text, pincode text,
 staff_count integer not null default 1 check(staff_count between 1 and 500),
 service_bays integer not null default 1 check(service_bays between 1 and 100),
 services text[] not null default '{}',
 gstin text,
 job_card_process text not null default 'paper' check(job_card_process in ('paper','spreadsheet','software','none')),
 notes text,
 consent boolean not null check(consent=true),
 status text not null default 'new' check(status in ('new','contacted','approved','rejected','converted')),
 source text not null default 'website',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists ws_onboarding_email_unique on public.ws_onboarding_applications(email_normalized);
create unique index if not exists ws_onboarding_phone_unique on public.ws_onboarding_applications(phone_normalized);
alter table public.ws_onboarding_applications enable row level security;
revoke all on public.ws_onboarding_applications from anon, authenticated;
grant all on public.ws_onboarding_applications to service_role;
commit;