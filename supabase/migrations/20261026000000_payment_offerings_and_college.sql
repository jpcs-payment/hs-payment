alter table public."hs-admins"
  add column if not exists display_name text not null default 'JPCS Admin';

alter table public."hs-offerings"
  add column if not exists applicable_school_levels text[] not null default array['Junior High School', 'Senior High School', 'College']::text[],
  add column if not exists allocations jsonb not null default '[]'::jsonb;

alter table public."hs-payers"
  add column if not exists course text;

alter table public."hs-payments"
  add column if not exists school_level text,
  add column if not exists year_level text,
  add column if not exists strand text,
  add column if not exists course text,
  add column if not exists allocations jsonb not null default '[]'::jsonb,
  add column if not exists approved_by_admin_id uuid references public."hs-admins"(id) on delete set null,
  add column if not exists approved_by_name text,
  add column if not exists approved_by_email text;

alter table public."hs-payers"
  drop constraint if exists "hs-payers_school_level_check",
  drop constraint if exists hs_payers_school_level_check;

alter table public."hs-payers"
  add constraint hs_payers_school_level_check
  check (school_level in ('Junior High School', 'Senior High School', 'College'));

alter table public."hs-offerings"
  drop constraint if exists hs_offerings_applicable_school_levels_check;

alter table public."hs-offerings"
  add constraint hs_offerings_applicable_school_levels_check
  check (
    cardinality(applicable_school_levels) > 0
    and applicable_school_levels <@ array['Junior High School', 'Senior High School', 'College']::text[]
  );

create or replace function public.hs_legacy_allocations(split jsonb, total numeric)
returns jsonb
language plpgsql
immutable
as $$
declare
  jpcs_amount numeric := coalesce(nullif(split ->> 'jpcs', '')::numeric, total);
  ssg_amount numeric := coalesce(nullif(split ->> 'ssg', '')::numeric, 0);
begin
  if jpcs_amount < 0 or ssg_amount < 0 or round(jpcs_amount + ssg_amount, 2) <> round(total, 2) then
    jpcs_amount := total;
    ssg_amount := 0;
  end if;

  if ssg_amount > 0 then
    return jsonb_build_array(
      jsonb_build_object('recipient', 'JPCS', 'amount', jpcs_amount),
      jsonb_build_object('recipient', 'SSG', 'amount', ssg_amount)
    );
  end if;

  return jsonb_build_array(jsonb_build_object('recipient', 'JPCS', 'amount', jpcs_amount));
end;
$$;

create or replace function public.hs_allocations_match_amount(value jsonb, total numeric)
returns boolean
language plpgsql
immutable
as $$
declare
  item jsonb;
  recipient text;
  item_amount numeric;
  allocation_total numeric := 0;
  recipients text[] := '{}'::text[];
begin
  if value is null or jsonb_typeof(value) <> 'array' or jsonb_array_length(value) = 0 then
    return false;
  end if;

  for item in select value_item from jsonb_array_elements(value) as elements(value_item) loop
    recipient := nullif(trim(item ->> 'recipient'), '');
    item_amount := nullif(item ->> 'amount', '')::numeric;
    if recipient is null or item_amount is null or item_amount <= 0 then
      return false;
    end if;
    if lower(recipient) = any(recipients) then
      return false;
    end if;
    recipients := array_append(recipients, lower(recipient));
    allocation_total := allocation_total + item_amount;
  end loop;

  return round(allocation_total, 2) = round(total, 2);
end;
$$;

update public."hs-offerings"
set allocations = public.hs_legacy_allocations(revenue_split, amount),
    applicable_school_levels = array['Junior High School', 'Senior High School', 'College']::text[]
where allocations = '[]'::jsonb;

update public."hs-payments" as payment
set allocations = public.hs_legacy_allocations(payment.revenue_split, payment.amount),
    school_level = payer.school_level,
    year_level = payer.year_level,
    course = payer.course
from public."hs-payers" as payer
where payer.id = payment.payer_id
  and payment.allocations = '[]'::jsonb;

alter table public."hs-payments"
  alter column school_level set not null,
  alter column year_level set not null;

alter table public."hs-offerings"
  drop constraint if exists hs_offerings_allocations_check;

alter table public."hs-offerings"
  add constraint hs_offerings_allocations_check
  check (public.hs_allocations_match_amount(allocations, amount));

alter table public."hs-payments"
  drop constraint if exists hs_payments_allocations_check;

alter table public."hs-payments"
  add constraint hs_payments_allocations_check
  check (public.hs_allocations_match_amount(allocations, amount));

update public."hs-admins"
set display_name = 'JPCS Admin'
where display_name is null or trim(display_name) = '';

create or replace function public.hs_set_payment_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  offering_row public."hs-offerings"%rowtype;
  payer_row public."hs-payers"%rowtype;
begin
  select * into offering_row
  from public."hs-offerings"
  where id = new.offering_id;

  if not found or not offering_row.active then
    raise exception 'The selected offering is not available.';
  end if;

  select * into payer_row
  from public."hs-payers"
  where id = new.payer_id;

  if not found then
    raise exception 'The selected payer does not exist.';
  end if;

  if payer_row.school_level = 'Senior High School' and nullif(trim(payer_row.strand), '') is null then
    raise exception 'A strand is required for Senior High School payers.';
  end if;

  if payer_row.school_level = 'College' and nullif(trim(payer_row.course), '') is null then
    raise exception 'A course is required for College payers.';
  end if;

  if not (payer_row.school_level = any(offering_row.applicable_school_levels)) then
    raise exception 'The selected payment offering is not available for this school level.';
  end if;

  new.offering_name = offering_row.name;
  new.amount = offering_row.amount;
  new.allocations = offering_row.allocations;
  new.school_level = payer_row.school_level;
  new.year_level = payer_row.year_level;
  new.strand = payer_row.strand;
  new.course = payer_row.course;
  return new;
end;
$$;

drop trigger if exists hs_payment_snapshot on public."hs-payments";
create trigger hs_payment_snapshot
before insert or update of offering_id, payer_id on public."hs-payments"
for each row execute function public.hs_set_payment_snapshot();

create or replace function public.hs_approve_payment(
  p_payment_id uuid,
  p_receipt_number text,
  p_ticket_id text,
  p_ticket_qr_value text
)
returns public."hs-payments"
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row public."hs-admins"%rowtype;
  updated_payment public."hs-payments"%rowtype;
begin
  select * into admin_row
  from public."hs-admins"
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;

  if not found then
    raise exception 'Only a registered JPCS admin can approve payments.';
  end if;

  if nullif(trim(p_receipt_number), '') is null
     or nullif(trim(p_ticket_id), '') is null
     or nullif(trim(p_ticket_qr_value), '') is null then
    raise exception 'Receipt and ticket details are required.';
  end if;

  update public."hs-payments"
  set status = 'Approved',
      approved_at = now(),
      approved_by_admin_id = admin_row.id,
      approved_by_name = coalesce(nullif(trim(admin_row.display_name), ''), admin_row.email),
      approved_by_email = admin_row.email,
      receipt_number = trim(p_receipt_number),
      ticket_id = trim(p_ticket_id),
      ticket_qr_value = trim(p_ticket_qr_value),
      rejection_reason = null
  where id = p_payment_id
    and status in ('Pending', 'Rejected')
  returning * into updated_payment;

  if found then
    return updated_payment;
  end if;

  select * into updated_payment
  from public."hs-payments"
  where id = p_payment_id;

  if not found then
    raise exception 'The payment could not be found.';
  end if;

  return updated_payment;
end;
$$;

create or replace function public.hs_reject_payment(
  p_payment_id uuid,
  p_reason text
)
returns public."hs-payments"
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_payment public."hs-payments"%rowtype;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception 'A rejection reason is required.';
  end if;

  update public."hs-payments"
  set status = 'Rejected',
      rejection_reason = trim(p_reason),
      approved_at = null,
      approved_by_admin_id = null,
      approved_by_name = null,
      approved_by_email = null,
      receipt_number = null,
      ticket_id = null,
      ticket_qr_value = null
  where id = p_payment_id
    and status <> 'Approved'
  returning * into updated_payment;

  if found then
    return updated_payment;
  end if;

  select * into updated_payment
  from public."hs-payments"
  where id = p_payment_id;

  if not found then
    raise exception 'The payment could not be found.';
  end if;

  return updated_payment;
end;
$$;

revoke update on public."hs-payments" from authenticated;
grant update (
  email_delivery_status,
  email_sent_at,
  email_id,
  email_delivery_error,
  attended_at
) on public."hs-payments" to authenticated;

revoke execute on function public.hs_approve_payment(uuid, text, text, text) from public, anon;
revoke execute on function public.hs_reject_payment(uuid, text) from public, anon;
grant execute on function public.hs_approve_payment(uuid, text, text, text) to authenticated;
grant execute on function public.hs_reject_payment(uuid, text) to authenticated;
