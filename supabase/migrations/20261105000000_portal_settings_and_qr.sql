-- Add global public-portal controls and per-payment-type attendance QR settings.
alter table public."hs-offerings"
  add column if not exists generate_qr boolean not null default true;

alter table public."hs-payments"
  add column if not exists generate_qr boolean not null default true;

create table if not exists public."hs-site-settings" (
  site_key text primary key check (site_key = 'public-payment'),
  is_open boolean not null default true,
  public_message text not null default 'The payment portal is temporarily closed while we update it. Please check back soon.' check (length(trim(public_message)) between 1 and 300),
  allow_multiple_names boolean not null default false,
  max_names integer not null default 10 check (max_names between 1 and 10),
  updated_at timestamptz not null default now()
);

do $$
declare
  existing_allow boolean;
  existing_max integer;
begin
  select
    coalesce(bool_or(allow_multiple_names), false),
    coalesce(max(max_names) filter (where allow_multiple_names), 10)
  into existing_allow, existing_max
  from public."hs-offerings"
  where archived_at is null;

  insert into public."hs-site-settings" (site_key, is_open, public_message, allow_multiple_names, max_names)
  values (
    'public-payment',
    true,
    'The payment portal is temporarily closed while we update it. Please check back soon.',
    existing_allow,
    case when existing_allow then greatest(2, least(10, existing_max)) else 10 end
  )
  on conflict (site_key) do nothing;
end;
$$;

update public."hs-offerings" as offering
set allow_multiple_names = settings.allow_multiple_names,
    max_names = case when settings.allow_multiple_names then settings.max_names else 1 end
from public."hs-site-settings" as settings
where settings.site_key = 'public-payment';

alter table public."hs-site-settings" enable row level security;

drop policy if exists hs_site_settings_public_read on public."hs-site-settings";
create policy hs_site_settings_public_read on public."hs-site-settings"
for select to anon, authenticated
using (site_key = 'public-payment');

revoke all on public."hs-site-settings" from anon, authenticated;
grant select on public."hs-site-settings" to anon, authenticated;

create or replace function public.hs_update_public_payment_settings(
  p_is_open boolean,
  p_public_message text,
  p_allow_multiple_names boolean,
  p_max_names integer
)
returns public."hs-site-settings"
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public."hs-site-settings"%rowtype;
  normalized_max integer := coalesce(p_max_names, 10);
  normalized_message text := nullif(trim(p_public_message), '');
begin
  if not public.hs_is_admin() then
    raise exception 'Only a registered JPCS admin can update public payment settings.';
  end if;
  if normalized_max < 1 or normalized_max > 10 or (coalesce(p_allow_multiple_names, false) and normalized_max < 2) then
    raise exception 'The maximum number of names must be between 1 and 10, or at least 2 when multiple names are enabled.';
  end if;
  if normalized_message is null or length(normalized_message) > 300 then
    raise exception 'The public closure message must be between 1 and 300 characters.';
  end if;

  update public."hs-site-settings"
   set is_open = coalesce(p_is_open, false),
       public_message = normalized_message,
       allow_multiple_names = coalesce(p_allow_multiple_names, false),
       max_names = normalized_max,
       updated_at = now()
  where site_key = 'public-payment'
  returning * into updated_row;

  if not found then
    insert into public."hs-site-settings" (site_key, is_open, public_message, allow_multiple_names, max_names)
    values ('public-payment', coalesce(p_is_open, false), normalized_message, coalesce(p_allow_multiple_names, false), normalized_max)
    returning * into updated_row;
  end if;

  update public."hs-offerings"
  set allow_multiple_names = updated_row.allow_multiple_names,
      max_names = case when updated_row.allow_multiple_names then updated_row.max_names else 1 end;

  return updated_row;
end;
$$;

revoke execute on function public.hs_update_public_payment_settings(boolean, text, boolean, integer) from public, anon;
grant execute on function public.hs_update_public_payment_settings(boolean, text, boolean, integer) to authenticated;

create or replace function public.hs_sync_offering_name_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public."hs-site-settings"%rowtype;
begin
  select * into settings_row
  from public."hs-site-settings"
  where site_key = 'public-payment';

  if not found then
    raise exception 'Public payment settings are not configured.';
  end if;

  new.allow_multiple_names = settings_row.allow_multiple_names;
  new.max_names = case when settings_row.allow_multiple_names then settings_row.max_names else 1 end;
  return new;
end;
$$;

drop trigger if exists hs_offerings_sync_name_settings on public."hs-offerings";
create trigger hs_offerings_sync_name_settings
before insert or update on public."hs-offerings"
for each row execute function public.hs_sync_offering_name_settings();

create or replace function public.hs_payment_portal_settings_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public."hs-site-settings"%rowtype;
  offering_row public."hs-offerings"%rowtype;
  attendee_total integer := greatest(coalesce(new.attendee_count, 1), 1);
begin
  if tg_op = 'INSERT' then
    select * into settings_row
    from public."hs-site-settings"
    where site_key = 'public-payment';

    if not found or (tg_op = 'INSERT' and not settings_row.is_open) then
      raise exception 'The payment portal is temporarily closed while we update it.';
    end if;
    if not settings_row.allow_multiple_names and attendee_total <> 1 then
      raise exception 'Multiple attendee names are currently disabled.';
    end if;
    if attendee_total > settings_row.max_names then
      raise exception 'The payment portal allows at most % attendee names.', settings_row.max_names;
    end if;
  elsif new.attendee_count is distinct from old.attendee_count then
    select * into settings_row
    from public."hs-site-settings"
    where site_key = 'public-payment';
    if not found then
      raise exception 'Public payment settings are not configured.';
    end if;
    if not settings_row.allow_multiple_names and attendee_total <> 1 then
      raise exception 'Multiple attendee names are currently disabled.';
    end if;
    if attendee_total > settings_row.max_names then
      raise exception 'The payment portal allows at most % attendee names.', settings_row.max_names;
    end if;
  end if;

  if tg_op = 'INSERT' then
    select * into offering_row
    from public."hs-offerings"
    where id = new.offering_id;
    if not found then
      raise exception 'The selected payment type is not available.';
    end if;
    new.generate_qr = coalesce(offering_row.generate_qr, true);
  elsif new.offering_id is distinct from old.offering_id then
    select * into offering_row
    from public."hs-offerings"
    where id = new.offering_id;
    if not found then
      raise exception 'The selected payment type is not available.';
    end if;
    new.generate_qr = coalesce(offering_row.generate_qr, true);
  end if;

  if not coalesce(new.generate_qr, true) then
    new.ticket_id = null;
    new.ticket_qr_value = null;
  end if;
  return new;
end;
$$;

drop trigger if exists hs_payment_portal_settings_snapshot on public."hs-payments";
create trigger hs_payment_portal_settings_snapshot
before insert or update on public."hs-payments"
for each row execute function public.hs_payment_portal_settings_snapshot();

create or replace function public.hs_payment_ticket_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(new.generate_qr, true) then
    new.ticket_id = null;
    new.ticket_qr_value = null;
  end if;
  return new;
end;
$$;

drop trigger if exists hs_payment_ticket_policy on public."hs-payments";
create trigger hs_payment_ticket_policy
before insert or update of generate_qr, ticket_id, ticket_qr_value on public."hs-payments"
for each row execute function public.hs_payment_ticket_policy();

create or replace function public.hs_attendee_ticket_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_generate_qr boolean;
begin
  select generate_qr into payment_generate_qr
  from public."hs-payments"
  where id = new.payment_id;
  if not coalesce(payment_generate_qr, true) then
    new.ticket_id = null;
    new.ticket_qr_value = null;
  end if;
  return new;
end;
$$;

drop trigger if exists hs_attendee_ticket_policy on public."hs-payment-attendees";
create trigger hs_attendee_ticket_policy
before insert or update of ticket_id, ticket_qr_value on public."hs-payment-attendees"
for each row execute function public.hs_attendee_ticket_policy();

create or replace function public.hs_validate_strand()
returns trigger
language plpgsql
as $$
begin
  if new.school_level = 'Senior High School' then
    new.strand = upper(nullif(trim(new.strand), ''));
    if new.strand is null or new.strand not in ('ABM', 'GAS', 'HUMSS', 'STEM', 'HE', 'ICT') then
      raise exception 'Choose a valid Senior High School strand.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists hs_payers_validate_strand on public."hs-payers";
create trigger hs_payers_validate_strand
before insert or update on public."hs-payers"
for each row execute function public.hs_validate_strand();
