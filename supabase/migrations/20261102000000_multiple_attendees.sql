-- Support one payment contact with multiple named attendees and tickets.
alter table public."hs-offerings"
  add column if not exists allow_multiple_names boolean not null default false,
  add column if not exists max_names integer not null default 10;

alter table public."hs-payments"
  add column if not exists attendee_count integer not null default 1;

update public."hs-offerings"
set max_names = 1
where not allow_multiple_names;

alter table public."hs-offerings"
  alter column max_names set default 10;

alter table public."hs-offerings"
  drop constraint if exists hs_offerings_name_settings_check;

alter table public."hs-offerings"
  add constraint hs_offerings_name_settings_check
  check (max_names between 1 and 10);

create or replace function public.hs_scale_allocations(value jsonb, multiplier integer)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'recipient', element ->> 'recipient',
        'amount', round((element ->> 'amount')::numeric * greatest(multiplier, 1), 2)
      )
      order by ordinal
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(value) with ordinality as items(element, ordinal);
$$;

alter table public."hs-payments"
  drop constraint if exists hs_payments_attendee_count_check;

alter table public."hs-payments"
  add constraint hs_payments_attendee_count_check
  check (attendee_count > 0);

create table if not exists public."hs-payment-attendees" (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public."hs-payments"(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  position integer not null check (position > 0),
  ticket_id text unique,
  ticket_qr_value text unique,
  attended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, position),
  check (ticket_qr_value is null or (ticket_id is not null and ticket_qr_value = 'JPCS-LCC-TICKET:' || ticket_id))
);

create index if not exists hs_payment_attendees_payment_id_idx
  on public."hs-payment-attendees" (payment_id, position);

create index if not exists hs_payment_attendees_ticket_id_idx
  on public."hs-payment-attendees" (ticket_id);

drop trigger if exists hs_payment_attendees_updated_at on public."hs-payment-attendees";
create trigger hs_payment_attendees_updated_at
before update on public."hs-payment-attendees"
for each row execute function public.hs_set_updated_at();

insert into public."hs-payment-attendees" (payment_id, name, position, ticket_id, ticket_qr_value, attended_at)
select payment.id, payer.name, 1, payment.ticket_id, payment.ticket_qr_value, payment.attended_at
from public."hs-payments" as payment
join public."hs-payers" as payer on payer.id = payment.payer_id
where not exists (
  select 1
  from public."hs-payment-attendees" as attendee
  where attendee.payment_id = payment.id
);

alter table public."hs-payment-attendees" enable row level security;

drop policy if exists hs_payment_attendees_admin_read on public."hs-payment-attendees";
create policy hs_payment_attendees_admin_read on public."hs-payment-attendees"
for select to authenticated
using (public.hs_is_admin());

drop policy if exists hs_payment_attendees_admin_update on public."hs-payment-attendees";
create policy hs_payment_attendees_admin_update on public."hs-payment-attendees"
for update to authenticated
using (public.hs_is_admin())
with check (public.hs_is_admin());

revoke all on public."hs-payment-attendees" from anon;
grant select, update on public."hs-payment-attendees" to authenticated;

create or replace function public.hs_set_payment_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  offering_row public."hs-offerings"%rowtype;
  payer_row public."hs-payers"%rowtype;
  method_row public."hs-payment-methods"%rowtype;
  attendee_total integer := greatest(coalesce(new.attendee_count, 1), 1);
begin
  select * into offering_row
  from public."hs-offerings"
  where id = new.offering_id;

  if not found or not offering_row.active or offering_row.archived_at is not null then
    raise exception 'The selected offering is not available.';
  end if;

  if not offering_row.allow_multiple_names and attendee_total <> 1 then
    raise exception 'Multiple names are not enabled for this payment type.';
  end if;
  if attendee_total > offering_row.max_names then
    raise exception 'The selected payment type allows at most % names.', offering_row.max_names;
  end if;

  select * into payer_row
  from public."hs-payers"
  where id = new.payer_id;

  if not found or payer_row.archived_at is not null then
    raise exception 'The selected payer is not available.';
  end if;

  select * into method_row
  from public."hs-payment-methods"
  where id = new.method;

  if not found or not method_row.enabled then
    raise exception 'The selected payment method is not enabled.';
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

  if not (new.method = any(offering_row.available_methods)) then
    raise exception 'The selected payment method is not available for this offering.';
  end if;

  if new.payment_mode = 'PayLater' then
    if not (new.method = any(offering_row.pay_later_methods)) then
      raise exception 'Pay Later is not enabled for this payment method.';
    end if;
    if offering_row.pay_later_deadline_at is null or offering_row.pay_later_deadline_at <= now() then
      raise exception 'The Pay Later deadline has passed or is not configured.';
    end if;
    new.payment_deadline_at = offering_row.pay_later_deadline_at;
    new.payment_state = 'Unpaid';
  else
    new.payment_deadline_at = null;
    new.payment_state = 'AwaitingReview';
  end if;

  if new.payment_mode = 'PayNow' and new.method in ('GCash', 'MariBank') then
    if nullif(trim(new.sender_account_name), '') is null or nullif(trim(new.sender_reference), '') is null then
      raise exception 'Sender account and payment reference are required for cashless payments.';
    end if;
    if nullif(trim(new.proof_path), '') is null then
      raise exception 'Proof of payment is required for cashless payments.';
    end if;
  end if;

  if new.proof_path is not null then
    if split_part(new.proof_path, '/', 1) <> new.id::text
       or not (lower(new.proof_path) like '%.jpg' or lower(new.proof_path) like '%.jpeg' or lower(new.proof_path) like '%.png' or lower(new.proof_path) like '%.webp') then
      raise exception 'The proof image path is invalid.';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'hs-payment-proofs' and name = new.proof_path) then
      raise exception 'The proof image could not be verified.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.status = 'Pending';
    new.rejection_reason = null;
    new.approved_at = null;
    new.approved_by_admin_id = null;
    new.approved_by_name = null;
    new.approved_by_email = null;
    new.paid_at = null;
    new.paid_by_admin_id = null;
    new.paid_by_name = null;
    new.paid_by_email = null;
    new.receipt_number = null;
    new.attended_at = null;
    new.email_delivery_status = null;
    new.email_sent_at = null;
    new.email_id = null;
    new.email_delivery_error = null;
    new.proof_url = null;
    new.ticket_id = null;
    new.ticket_qr_value = null;
  end if;

  new.attendee_count = attendee_total;
  new.offering_name = offering_row.name;
  new.amount = round(offering_row.amount * attendee_total, 2);
  new.allocations = public.hs_scale_allocations(offering_row.allocations, attendee_total);
  new.school_level = payer_row.school_level;
  new.year_level = payer_row.year_level;
  new.strand = payer_row.strand;
  new.course = payer_row.course;
  return new;
end;
$$;

drop trigger if exists hs_payment_snapshot on public."hs-payments";
create trigger hs_payment_snapshot
before insert or update of offering_id, payer_id, attendee_count on public."hs-payments"
for each row execute function public.hs_set_payment_snapshot();

drop function if exists public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, text, text);

create or replace function public.hs_submit_payment(
  p_payment_id uuid,
  p_payer_id uuid,
  p_student_name text,
  p_email text,
  p_school_level text,
  p_year_level text,
  p_strand text,
  p_course text,
  p_offering_id uuid,
  p_method text,
  p_payment_mode text,
  p_sender_account_name text,
  p_sender_reference text,
  p_proof_path text,
  p_attendee_names jsonb
)
returns public."hs-payments"
language plpgsql
security definer
set search_path = public
as $$
declare
  offering_row public."hs-offerings"%rowtype;
  method_row public."hs-payment-methods"%rowtype;
  payment_row public."hs-payments"%rowtype;
  names_json jsonb := coalesce(p_attendee_names, jsonb_build_array(p_student_name));
  name_item jsonb;
  name_value text;
  normalized_names text[] := '{}'::text[];
  normalized_name_keys text[] := '{}'::text[];
  attendee_total integer;
  name_index integer := 0;
  normalized_email text := lower(nullif(trim(p_email), ''));
  normalized_year text := nullif(trim(p_year_level), '');
  normalized_strand text := nullif(trim(p_strand), '');
  normalized_course text := nullif(trim(p_course), '');
  normalized_sender_name text := nullif(trim(p_sender_account_name), '');
  normalized_sender_reference text := nullif(trim(p_sender_reference), '');
  normalized_proof_path text := nullif(trim(p_proof_path), '');
  generated_ticket text;
begin
  if p_payment_id is null or p_payer_id is null then
    raise exception 'Payment identifiers are required.';
  end if;
  if jsonb_typeof(names_json) <> 'array' then
    raise exception 'Attendee names must be a list.';
  end if;
  attendee_total := jsonb_array_length(names_json);
  if attendee_total < 1 then
    raise exception 'At least one attendee name is required.';
  end if;
  if p_school_level not in ('Junior High School', 'Senior High School', 'College') then
    raise exception 'The selected school level is invalid.';
  end if;
  if normalized_year is null or length(normalized_year) > 80 then
    raise exception 'A valid year level is required.';
  end if;
  if p_school_level = 'Senior High School' and normalized_strand is null then
    raise exception 'A strand is required for Senior High School payers.';
  end if;
  if p_school_level = 'College' and normalized_course is null then
    raise exception 'A course is required for College payers.';
  end if;
  if normalized_email is null or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'A valid email address is required.';
  end if;
  if p_method not in ('Cash', 'GCash', 'MariBank') then
    raise exception 'The selected payment method is invalid.';
  end if;
  if p_payment_mode not in ('PayNow', 'PayLater') then
    raise exception 'The selected payment timing is invalid.';
  end if;

  select * into offering_row
  from public."hs-offerings"
  where id = p_offering_id
    and active = true
    and archived_at is null;
  if not found then
    raise exception 'The selected offering is not available.';
  end if;
  if not offering_row.allow_multiple_names and attendee_total <> 1 then
    raise exception 'Multiple names are not enabled for this payment type.';
  end if;
  if attendee_total > offering_row.max_names then
    raise exception 'The selected payment type allows at most % names.', offering_row.max_names;
  end if;

  for name_item in select value from jsonb_array_elements(names_json) loop
    name_value := nullif(trim(name_item #>> '{}'), '');
    if name_value is null or length(name_value) > 160 then
      raise exception 'Each attendee must have a valid name.';
    end if;
    if lower(name_value) = any(normalized_name_keys) then
      raise exception 'Each attendee name must be unique.';
    end if;
    normalized_names := array_append(normalized_names, name_value);
    normalized_name_keys := array_append(normalized_name_keys, lower(name_value));
  end loop;

  select * into method_row
  from public."hs-payment-methods"
  where id = p_method;
  if not found or not method_row.enabled then
    raise exception 'The selected payment method is not enabled.';
  end if;
  if not (p_school_level = any(offering_row.applicable_school_levels)) then
    raise exception 'The selected payment offering is not available for this school level.';
  end if;
  if not (p_method = any(offering_row.available_methods)) then
    raise exception 'The selected payment method is not available for this offering.';
  end if;
  if p_payment_mode = 'PayLater' and (not (p_method = any(offering_row.pay_later_methods)) or offering_row.pay_later_deadline_at is null or offering_row.pay_later_deadline_at <= now()) then
    raise exception 'The Pay Later deadline has passed or is not configured.';
  end if;
  if p_payment_mode = 'PayNow' and p_method in ('GCash', 'MariBank') then
    if normalized_sender_name is null or normalized_sender_reference is null or normalized_proof_path is null then
      raise exception 'Sender account, payment reference, and proof are required for cashless payments.';
    end if;
  end if;
  if normalized_proof_path is not null and split_part(normalized_proof_path, '/', 1) <> p_payment_id::text then
    raise exception 'The proof image path is invalid.';
  end if;
  if normalized_proof_path is not null and not exists (select 1 from storage.objects where bucket_id = 'hs-payment-proofs' and name = normalized_proof_path) then
    raise exception 'The proof image could not be verified.';
  end if;

  insert into public."hs-payers" (id, name, email, school_level, year_level, strand, course, avatar)
  values (
    p_payer_id,
    normalized_names[1],
    normalized_email,
    p_school_level,
    normalized_year,
    normalized_strand,
    normalized_course,
    upper(left(regexp_replace(normalized_names[1], '[^A-Za-z0-9 ]', '', 'g'), 2))
  );

  insert into public."hs-payments" (
    id,
    reference,
    payer_id,
    offering_id,
    offering_name,
    amount,
    attendee_count,
    allocations,
    method,
    payment_mode,
    payment_state,
    payment_deadline_at,
    sender_account_name,
    sender_reference,
    proof_path,
    proof_url,
    submitted_at,
    status
  )
  values (
    p_payment_id,
    format('PAY-%s-%s', to_char(now() at time zone 'Asia/Manila', 'YYMMDD'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
    p_payer_id,
    p_offering_id,
    offering_row.name,
    offering_row.amount,
    attendee_total,
    offering_row.allocations,
    p_method,
    p_payment_mode,
    case when p_payment_mode = 'PayLater' then 'Unpaid' else 'AwaitingReview' end,
    case when p_payment_mode = 'PayLater' then offering_row.pay_later_deadline_at else null end,
    case when p_payment_mode = 'PayNow' then normalized_sender_name else null end,
    case when p_payment_mode = 'PayNow' then normalized_sender_reference else null end,
    normalized_proof_path,
    null,
    now(),
    'Pending'
  )
  returning * into payment_row;

  foreach name_value in array normalized_names loop
    name_index := name_index + 1;
    if p_payment_mode = 'PayLater' then
      generated_ticket := format('TKT-%s%s', to_char(now() at time zone 'Asia/Manila', 'YY'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
    else
      generated_ticket := null;
    end if;
    insert into public."hs-payment-attendees" (payment_id, name, position, ticket_id, ticket_qr_value)
    values (
      p_payment_id,
      name_value,
      name_index,
      generated_ticket,
      case when generated_ticket is null then null else 'JPCS-LCC-TICKET:' || generated_ticket end
    );
  end loop;

  return payment_row;
end;
$$;

revoke execute on function public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, text, text, jsonb) to service_role;

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
  attendee_row public."hs-payment-attendees"%rowtype;
  first_ticket text;
  first_qr text;
  generated_ticket text;
begin
  select * into admin_row
  from public."hs-admins"
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
  if not found then
    raise exception 'Only a registered JPCS admin can approve payments.';
  end if;
  if nullif(trim(p_receipt_number), '') is null then
    raise exception 'A receipt number is required.';
  end if;

  update public."hs-payments"
  set status = 'Approved',
      payment_state = 'Paid',
      paid_at = coalesce(paid_at, now()),
      paid_by_admin_id = admin_row.id,
      paid_by_name = coalesce(nullif(trim(admin_row.display_name), ''), admin_row.email),
      paid_by_email = admin_row.email,
      approved_at = now(),
      approved_by_admin_id = admin_row.id,
      approved_by_name = coalesce(nullif(trim(admin_row.display_name), ''), admin_row.email),
      approved_by_email = admin_row.email,
      receipt_number = trim(p_receipt_number),
      ticket_id = null,
      ticket_qr_value = null,
      rejection_reason = null
  where id = p_payment_id
    and status in ('Pending', 'Rejected')
    and payment_mode = 'PayNow'
  returning * into updated_payment;

  if not found then
    select * into updated_payment from public."hs-payments" where id = p_payment_id;
    if not found then raise exception 'The payment could not be found.'; end if;
    return updated_payment;
  end if;

  for attendee_row in select * from public."hs-payment-attendees" where payment_id = p_payment_id order by position for update loop
    generated_ticket := format('TKT-%s%s', to_char(now() at time zone 'Asia/Manila', 'YY'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
    update public."hs-payment-attendees"
    set ticket_id = generated_ticket,
        ticket_qr_value = 'JPCS-LCC-TICKET:' || generated_ticket,
        attended_at = null
    where id = attendee_row.id;
    if first_ticket is null then
      first_ticket := generated_ticket;
      first_qr := 'JPCS-LCC-TICKET:' || generated_ticket;
    end if;
  end loop;

  if first_ticket is null then
    first_ticket := coalesce(nullif(trim(p_ticket_id), ''), format('TKT-%s%s', to_char(now() at time zone 'Asia/Manila', 'YY'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))));
    first_qr := 'JPCS-LCC-TICKET:' || first_ticket;
  end if;

  update public."hs-payments"
  set ticket_id = first_ticket,
      ticket_qr_value = first_qr
  where id = p_payment_id;

  select * into updated_payment from public."hs-payments" where id = p_payment_id;
  return updated_payment;
end;
$$;

create or replace function public.hs_mark_pay_later_received(
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
  current_payment public."hs-payments"%rowtype;
  updated_payment public."hs-payments"%rowtype;
  attendee_row public."hs-payment-attendees"%rowtype;
  first_ticket text;
  first_qr text;
  generated_ticket text;
begin
  select * into admin_row
  from public."hs-admins"
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
  if not found then raise exception 'Only a registered JPCS admin can mark payment received.'; end if;
  if nullif(trim(p_receipt_number), '') is null then raise exception 'A receipt number is required.'; end if;

  select * into current_payment from public."hs-payments" where id = p_payment_id for update;
  if not found then raise exception 'The payment could not be found.'; end if;
  if current_payment.payment_mode <> 'PayLater' then raise exception 'Only Pay Later payments can use this action.'; end if;
  if current_payment.status = 'Approved' and current_payment.payment_state = 'Paid' then return current_payment; end if;
  if current_payment.payment_state <> 'Unpaid' then raise exception 'This Pay Later payment is no longer unpaid.'; end if;

  update public."hs-payments"
  set status = 'Approved',
      payment_state = 'Paid',
      paid_at = now(),
      paid_by_admin_id = admin_row.id,
      paid_by_name = coalesce(nullif(trim(admin_row.display_name), ''), admin_row.email),
      paid_by_email = admin_row.email,
      approved_at = now(),
      approved_by_admin_id = admin_row.id,
      approved_by_name = coalesce(nullif(trim(admin_row.display_name), ''), admin_row.email),
      approved_by_email = admin_row.email,
      receipt_number = trim(p_receipt_number),
      rejection_reason = null
  where id = p_payment_id
  returning * into updated_payment;

  for attendee_row in select * from public."hs-payment-attendees" where payment_id = p_payment_id order by position for update loop
    generated_ticket := coalesce(attendee_row.ticket_id, format('TKT-%s%s', to_char(now() at time zone 'Asia/Manila', 'YY'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))));
    update public."hs-payment-attendees"
    set ticket_id = generated_ticket,
        ticket_qr_value = 'JPCS-LCC-TICKET:' || generated_ticket
    where id = attendee_row.id;
    if first_ticket is null then
      first_ticket := generated_ticket;
      first_qr := 'JPCS-LCC-TICKET:' || generated_ticket;
    end if;
  end loop;

  update public."hs-payments"
  set ticket_id = coalesce(first_ticket, ticket_id),
      ticket_qr_value = coalesce(first_qr, ticket_qr_value)
  where id = p_payment_id;

  select * into updated_payment from public."hs-payments" where id = p_payment_id;
  return updated_payment;
end;
$$;

create or replace function public.hs_reject_payment(p_payment_id uuid, p_reason text)
returns public."hs-payments"
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row public."hs-admins"%rowtype;
  updated_payment public."hs-payments"%rowtype;
begin
  select * into admin_row from public."hs-admins" where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1;
  if not found then raise exception 'Only a registered JPCS admin can reject payments.'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'A rejection reason is required.'; end if;

  update public."hs-payments"
  set status = 'Rejected',
      payment_state = case when payment_mode = 'PayLater' then 'Unpaid' else 'Rejected' end,
      rejection_reason = trim(p_reason),
      approved_at = null,
      approved_by_admin_id = null,
      approved_by_name = null,
      approved_by_email = null,
      receipt_number = null,
      ticket_id = case when payment_mode = 'PayLater' then ticket_id else null end,
      ticket_qr_value = case when payment_mode = 'PayLater' then ticket_qr_value else null end
  where id = p_payment_id
    and status <> 'Approved'
  returning * into updated_payment;

  if found then
    if updated_payment.payment_mode = 'PayNow' then
      update public."hs-payment-attendees"
      set ticket_id = null,
          ticket_qr_value = null,
          attended_at = null
      where payment_id = p_payment_id;
    end if;
    return updated_payment;
  end if;

  select * into updated_payment from public."hs-payments" where id = p_payment_id;
  if not found then raise exception 'The payment could not be found.'; end if;
  return updated_payment;
end;
$$;

grant execute on function public.hs_approve_payment(uuid, text, text, text) to authenticated;
grant execute on function public.hs_mark_pay_later_received(uuid, text, text, text) to authenticated;
grant execute on function public.hs_reject_payment(uuid, text) to authenticated;
