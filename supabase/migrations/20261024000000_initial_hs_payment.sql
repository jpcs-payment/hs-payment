create extension if not exists pgcrypto;

create table if not exists public."hs-admins" (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public."hs-offerings" (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  amount numeric(10, 2) not null check (amount > 0),
  active boolean not null default true,
  available_methods text[] not null default array['Cash', 'GCash', 'MariBank']::text[],
  revenue_split jsonb not null default '{"jpcs": 60, "ssg": 0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public."hs-payment-methods" (
  id text primary key check (id in ('Cash', 'GCash', 'MariBank')),
  enabled boolean not null default true,
  account_name text not null,
  account_number text not null,
  instructions text not null,
  qr_image text,
  updated_at timestamptz not null default now()
);

create table if not exists public."hs-payers" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  school_level text not null check (school_level in ('Junior High School', 'Senior High School')),
  year_level text not null,
  strand text,
  avatar text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public."hs-payments" (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  payer_id uuid not null references public."hs-payers"(id) on delete restrict,
  offering_id uuid not null references public."hs-offerings"(id) on delete restrict,
  offering_name text not null,
  amount numeric(10, 2) not null check (amount > 0),
  revenue_split jsonb not null default '{"jpcs": 60, "ssg": 0}'::jsonb,
  method text not null check (method in ('Cash', 'GCash', 'MariBank')),
  sender_account_name text,
  sender_reference text,
  proof_path text,
  proof_url text,
  submitted_at timestamptz not null default now(),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  rejection_reason text,
  approved_at timestamptz,
  receipt_number text unique,
  ticket_id text unique,
  ticket_qr_value text,
  email_delivery_status text check (email_delivery_status in ('Sending', 'Sent', 'Failed')),
  email_sent_at timestamptz,
  email_id text,
  email_delivery_error text,
  attended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public."hs-email-deliveries" (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public."hs-payments"(id) on delete cascade,
  provider text not null default 'Brevo',
  provider_message_id text,
  status text not null check (status in ('Sent', 'Failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists hs_payments_status_idx on public."hs-payments" (status);
create index if not exists hs_payments_submitted_at_idx on public."hs-payments" (submitted_at desc);
create index if not exists hs_payments_payer_id_idx on public."hs-payments" (payer_id);
create index if not exists hs_email_deliveries_payment_id_idx on public."hs-email-deliveries" (payment_id);

grant usage on schema public to anon, authenticated;
grant select on public."hs-offerings", public."hs-payment-methods" to anon, authenticated;
grant select on public."hs-admins" to authenticated;
grant insert on public."hs-payers", public."hs-payments" to anon, authenticated;
grant select on public."hs-payers", public."hs-payments" to authenticated;
grant update on public."hs-payments" to authenticated;
grant all on public."hs-offerings", public."hs-payment-methods", public."hs-email-deliveries" to authenticated;

create or replace function public.hs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hs_offerings_updated_at on public."hs-offerings";
create trigger hs_offerings_updated_at
before update on public."hs-offerings"
for each row execute function public.hs_set_updated_at();

drop trigger if exists hs_payment_methods_updated_at on public."hs-payment-methods";
create trigger hs_payment_methods_updated_at
before update on public."hs-payment-methods"
for each row execute function public.hs_set_updated_at();

drop trigger if exists hs_payments_updated_at on public."hs-payments";
create trigger hs_payments_updated_at
before update on public."hs-payments"
for each row execute function public.hs_set_updated_at();

create or replace function public.hs_set_payment_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  offering_row public."hs-offerings"%rowtype;
begin
  select * into offering_row
  from public."hs-offerings"
  where id = new.offering_id;

  if not found or not offering_row.active then
    raise exception 'The selected offering is not available.';
  end if;

  new.offering_name = offering_row.name;
  new.amount = offering_row.amount;
  new.revenue_split = offering_row.revenue_split;
  return new;
end;
$$;

drop trigger if exists hs_payment_snapshot on public."hs-payments";
create trigger hs_payment_snapshot
before insert or update of offering_id on public."hs-payments"
for each row execute function public.hs_set_payment_snapshot();

create or replace function public.hs_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."hs-admins"
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant execute on function public.hs_is_admin() to anon, authenticated;

alter table public."hs-admins" enable row level security;
alter table public."hs-offerings" enable row level security;
alter table public."hs-payment-methods" enable row level security;
alter table public."hs-payers" enable row level security;
alter table public."hs-payments" enable row level security;
alter table public."hs-email-deliveries" enable row level security;

drop policy if exists hs_admins_self_read on public."hs-admins";
create policy hs_admins_self_read on public."hs-admins"
for select to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists hs_offerings_public_read on public."hs-offerings";
create policy hs_offerings_public_read on public."hs-offerings"
for select to anon, authenticated
using (active = true);

drop policy if exists hs_offerings_admin_all on public."hs-offerings";
create policy hs_offerings_admin_all on public."hs-offerings"
for all to authenticated
using (public.hs_is_admin())
with check (public.hs_is_admin());

drop policy if exists hs_methods_public_read on public."hs-payment-methods";
create policy hs_methods_public_read on public."hs-payment-methods"
for select to anon, authenticated
using (enabled = true);

drop policy if exists hs_methods_admin_all on public."hs-payment-methods";
create policy hs_methods_admin_all on public."hs-payment-methods"
for all to authenticated
using (public.hs_is_admin())
with check (public.hs_is_admin());

drop policy if exists hs_payers_public_insert on public."hs-payers";
create policy hs_payers_public_insert on public."hs-payers"
for insert to anon, authenticated
with check (true);

drop policy if exists hs_payers_admin_read on public."hs-payers";
create policy hs_payers_admin_read on public."hs-payers"
for select to authenticated
using (public.hs_is_admin());

drop policy if exists hs_payments_public_insert on public."hs-payments";
create policy hs_payments_public_insert on public."hs-payments"
for insert to anon, authenticated
with check (status = 'Pending' and approved_at is null);

drop policy if exists hs_payments_admin_read on public."hs-payments";
create policy hs_payments_admin_read on public."hs-payments"
for select to authenticated
using (public.hs_is_admin());

drop policy if exists hs_payments_admin_update on public."hs-payments";
create policy hs_payments_admin_update on public."hs-payments"
for update to authenticated
using (public.hs_is_admin())
with check (public.hs_is_admin());

drop policy if exists hs_email_deliveries_admin_all on public."hs-email-deliveries";
create policy hs_email_deliveries_admin_all on public."hs-email-deliveries"
for all to authenticated
using (public.hs_is_admin())
with check (public.hs_is_admin());

insert into public."hs-admins" (email)
values ('jpcs.payment@gmail.com')
on conflict (email) do nothing;

delete from public."hs-email-deliveries";
delete from public."hs-payments";
delete from public."hs-payers";
delete from public."hs-offerings" where slug <> 'film-showing';
delete from public."hs-payment-methods" where id not in ('Cash', 'GCash', 'MariBank');

insert into public."hs-offerings" (slug, name, description, amount, active, available_methods, revenue_split)
values (
  'film-showing',
  'JPCS Film Showing',
  'Admission payment for the JPCS Film Showing.',
  60,
  true,
  array['Cash', 'GCash', 'MariBank']::text[],
  '{"jpcs": 60, "ssg": 0}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  amount = excluded.amount,
  active = excluded.active,
  available_methods = excluded.available_methods,
  revenue_split = excluded.revenue_split;

insert into public."hs-payment-methods" (id, enabled, account_name, account_number, instructions)
values
  ('Cash', true, 'JPCS - LCC Cashier', 'Visit the JPCS - LCC cashier', 'Pay the exact ₱60 amount at the cashier and enter the cashier reference.'),
  ('GCash', true, 'JPCS - LCC Student Activities', 'Configure your GCash number', 'Send exactly ₱60, then upload the payment screenshot and enter the sender reference.'),
  ('MariBank', true, 'JPCS - LCC Student Activities', 'Configure your MariBank number', 'Send exactly ₱60, then upload the payment screenshot and enter the sender reference.')
on conflict (id) do update set
  enabled = excluded.enabled,
  account_name = excluded.account_name,
  account_number = excluded.account_number,
  instructions = excluded.instructions;

insert into storage.buckets (id, name, public)
values ('hs-payment-proofs', 'hs-payment-proofs', true)
on conflict (id) do update set public = true;

drop policy if exists hs_payment_proofs_public_insert on storage.objects;
create policy hs_payment_proofs_public_insert on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'hs-payment-proofs');

drop policy if exists hs_payment_proofs_public_read on storage.objects;
create policy hs_payment_proofs_public_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'hs-payment-proofs');
