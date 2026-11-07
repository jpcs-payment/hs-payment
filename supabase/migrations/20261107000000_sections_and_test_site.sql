-- Add shared Section suggestions and an isolated public test site.
alter table public."hs-payers"
  add column if not exists site_key text not null default 'public-payment',
  add column if not exists section text;

alter table public."hs-payments"
  add column if not exists site_key text not null default 'public-payment',
  add column if not exists section text;

update public."hs-payers"
set site_key = 'public-payment'
where site_key is null;

update public."hs-payments" as payment
set site_key = coalesce(payment.site_key, 'public-payment'),
    section = coalesce(payment.section, payer.section)
from public."hs-payers" as payer
where payer.id = payment.payer_id;

alter table public."hs-payers"
  drop constraint if exists hs_payers_site_key_check;

alter table public."hs-payers"
  add constraint hs_payers_site_key_check
  check (site_key in ('public-payment', 'test-payment'));

alter table public."hs-payments"
  drop constraint if exists hs_payments_site_key_check;

alter table public."hs-payments"
  add constraint hs_payments_site_key_check
  check (site_key in ('public-payment', 'test-payment'));

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public."hs-site-settings"'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%site_key%'
  loop
    execute format('alter table public."hs-site-settings" drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public."hs-site-settings"
  add constraint hs_site_settings_site_key_check
  check (site_key in ('public-payment', 'test-payment'));

insert into public."hs-site-settings" (
  site_key,
  is_open,
  public_message,
  allow_multiple_names,
  max_names,
  visible_school_levels
)
select
  'test-payment',
  true,
  public_message,
  allow_multiple_names,
  max_names,
  visible_school_levels
from public."hs-site-settings"
where site_key = 'public-payment'
on conflict (site_key) do nothing;

drop policy if exists hs_site_settings_public_read on public."hs-site-settings";
create policy hs_site_settings_public_read on public."hs-site-settings"
for select to anon, authenticated
using (site_key in ('public-payment', 'test-payment'));

create table if not exists public."hs-sections" (
  section text primary key check (length(trim(section)) between 1 and 80),
  created_at timestamptz not null default now()
);

create unique index if not exists hs_sections_normalized_idx
  on public."hs-sections" (lower(trim(section)));

insert into public."hs-sections" (section)
select distinct trim(section)
from public."hs-payers"
where nullif(trim(section), '') is not null
on conflict do nothing;

alter table public."hs-sections" enable row level security;

drop policy if exists hs_sections_public_read on public."hs-sections";
create policy hs_sections_public_read on public."hs-sections"
for select to anon, authenticated
using (true);

revoke all on public."hs-sections" from anon, authenticated;
grant select on public."hs-sections" to anon, authenticated;

drop index if exists public.hs_payments_email_once_idx;
create unique index if not exists hs_payments_email_once_idx
  on public."hs-payments" (site_key, lower(trim(payer_email)));

create or replace function public.hs_validate_visible_school_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  visible_levels text[];
begin
  select visible_school_levels
    into visible_levels
    from public."hs-site-settings"
   where site_key = coalesce(new.site_key, 'public-payment');

  if not found or new.school_level is null or not (new.school_level = any(visible_levels)) then
    raise exception 'That school level is not currently available.';
  end if;
  return new;
end;
$$;

drop trigger if exists hs_payers_visible_school_level on public."hs-payers";
create trigger hs_payers_visible_school_level
before insert or update of site_key, school_level on public."hs-payers"
for each row execute function public.hs_validate_visible_school_level();

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
  if payer_row.site_key <> coalesce(new.site_key, 'public-payment') then
    raise exception 'The payer and payment site do not match.';
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

  new.site_key = payer_row.site_key;
  new.payer_email = lower(trim(payer_row.email));
  new.attendee_count = attendee_total;
  new.offering_name = offering_row.name;
  new.amount = round(offering_row.amount * attendee_total, 2);
  new.allocations = public.hs_scale_allocations(offering_row.allocations, attendee_total);
  new.school_level = payer_row.school_level;
  new.year_level = payer_row.year_level;
  new.section = payer_row.section;
  new.strand = payer_row.strand;
  new.course = payer_row.course;
  return new;
end;
$$;

drop trigger if exists hs_payment_snapshot on public."hs-payments";
create trigger hs_payment_snapshot
before insert or update of offering_id, payer_id, attendee_count, site_key on public."hs-payments"
for each row execute function public.hs_set_payment_snapshot();

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
    where site_key = coalesce(new.site_key, 'public-payment');

    if not found or not settings_row.is_open then
      raise exception 'The payment portal is temporarily closed while we update it.';
    end if;
    if not settings_row.allow_multiple_names and attendee_total <> 1 then
      raise exception 'Multiple attendee names are currently disabled.';
    end if;
    if attendee_total > settings_row.max_names then
      raise exception 'The payment portal allows at most % attendee names.', settings_row.max_names;
    end if;
  elsif new.attendee_count is distinct from old.attendee_count or new.site_key is distinct from old.site_key then
    select * into settings_row
    from public."hs-site-settings"
    where site_key = coalesce(new.site_key, 'public-payment');
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

create or replace function public.hs_sync_test_site_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.site_key = 'public-payment' then
    update public."hs-site-settings"
    set public_message = new.public_message,
        allow_multiple_names = new.allow_multiple_names,
        max_names = new.max_names,
        visible_school_levels = new.visible_school_levels,
        is_open = true,
        updated_at = now()
    where site_key = 'test-payment';
  end if;
  return new;
end;
$$;

drop trigger if exists hs_sync_test_site_settings on public."hs-site-settings";
create trigger hs_sync_test_site_settings
after insert or update of public_message, allow_multiple_names, max_names, visible_school_levels on public."hs-site-settings"
for each row execute function public.hs_sync_test_site_settings();

create or replace function public.hs_submit_payment_for_site(
  p_payment_id uuid,
  p_payer_id uuid,
  p_site_key text,
  p_student_name text,
  p_email text,
  p_school_level text,
  p_year_level text,
  p_section text,
  p_strand text,
  p_course text,
  p_offering_id uuid,
  p_method text,
  p_payment_mode text,
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
  attendee_payer_id uuid;
  normalized_site_key text := coalesce(nullif(trim(p_site_key), ''), 'public-payment');
  normalized_email text := lower(nullif(trim(p_email), ''));
  normalized_year text := nullif(trim(p_year_level), '');
  normalized_section text := nullif(trim(p_section), '');
  normalized_strand text := nullif(trim(p_strand), '');
  normalized_course text := nullif(trim(p_course), '');
  normalized_proof_path text := nullif(trim(p_proof_path), '');
  legacy_sender_value text := case when p_payment_mode = 'PayNow' and p_method in ('GCash', 'MariBank') then 'proof-only' else null end;
  generated_ticket text;
begin
  if p_payment_id is null or p_payer_id is null then
    raise exception 'Payment identifiers are required.';
  end if;
  if normalized_site_key not in ('public-payment', 'test-payment') then
    raise exception 'The selected payment site is invalid.';
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
  if normalized_section is null or length(normalized_section) > 80 then
    raise exception 'A valid section is required.';
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
  if p_school_level = 'Senior High School' and normalized_strand is null then
    raise exception 'A strand is required for Senior High School payers.';
  end if;
  if p_school_level = 'College' and normalized_course is null then
    raise exception 'A course is required for College payers.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('hs-payment-email:' || normalized_site_key || ':' || normalized_email, 0));
  if exists (
    select 1
    from public."hs-payments"
    where site_key = normalized_site_key
      and lower(trim(payer_email)) = normalized_email
  ) then
    raise exception 'email has been used'
      using errcode = 'P0001', detail = 'email_already_used';
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
  if p_payment_mode = 'PayNow' and p_method in ('GCash', 'MariBank') and normalized_proof_path is null then
    raise exception 'Proof is required for cashless payments.';
  end if;
  if normalized_proof_path is not null and split_part(normalized_proof_path, '/', 1) <> p_payment_id::text then
    raise exception 'The proof image path is invalid.';
  end if;
  if normalized_proof_path is not null and not exists (select 1 from storage.objects where bucket_id = 'hs-payment-proofs' and name = normalized_proof_path) then
    raise exception 'The proof image could not be verified.';
  end if;

  insert into public."hs-sections" (section)
  values (normalized_section)
  on conflict do nothing;

  insert into public."hs-payers" (id, site_key, name, email, school_level, year_level, section, strand, course, avatar)
  values (
    p_payer_id,
    normalized_site_key,
    normalized_names[1],
    normalized_email,
    p_school_level,
    normalized_year,
    normalized_section,
    normalized_strand,
    normalized_course,
    upper(left(regexp_replace(normalized_names[1], '[^A-Za-z0-9 ]', '', 'g'), 2))
  );

  insert into public."hs-payments" (
    id, reference, payer_id, payer_email, site_key, offering_id, offering_name, amount,
    attendee_count, allocations, method, payment_mode, payment_state, payment_deadline_at,
    sender_account_name, sender_reference, proof_path, proof_url, school_level, year_level,
    section, strand, course, submitted_at, status
  )
  values (
    p_payment_id,
    format('PAY-%s-%s', to_char(now() at time zone 'Asia/Manila', 'YYMMDD'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
    p_payer_id,
    normalized_email,
    normalized_site_key,
    p_offering_id,
    offering_row.name,
    offering_row.amount,
    attendee_total,
    offering_row.allocations,
    p_method,
    p_payment_mode,
    case when p_payment_mode = 'PayLater' then 'Unpaid' else 'AwaitingReview' end,
    case when p_payment_mode = 'PayLater' then offering_row.pay_later_deadline_at else null end,
    legacy_sender_value,
    legacy_sender_value,
    normalized_proof_path,
    null,
    p_school_level,
    normalized_year,
    normalized_section,
    normalized_strand,
    normalized_course,
    now(),
    'Pending'
  )
  returning * into payment_row;

  update public."hs-payments"
  set sender_account_name = null,
      sender_reference = null
  where id = p_payment_id;

  foreach name_value in array normalized_names loop
    name_index := name_index + 1;
    if name_index = 1 then
      attendee_payer_id := p_payer_id;
    else
      attendee_payer_id := gen_random_uuid();
      insert into public."hs-payers" (id, site_key, name, email, school_level, year_level, section, strand, course, avatar)
      values (
        attendee_payer_id,
        normalized_site_key,
        name_value,
        normalized_email,
        p_school_level,
        normalized_year,
        normalized_section,
        normalized_strand,
        normalized_course,
        upper(left(regexp_replace(name_value, '[^A-Za-z0-9 ]', '', 'g'), 2))
      );
    end if;

    if p_payment_mode = 'PayLater' then
      generated_ticket := format('TKT-%s%s', to_char(now() at time zone 'Asia/Manila', 'YY'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
    else
      generated_ticket := null;
    end if;
    insert into public."hs-payment-attendees" (payment_id, payer_id, name, position, ticket_id, ticket_qr_value)
    values (
      p_payment_id,
      attendee_payer_id,
      name_value,
      name_index,
      generated_ticket,
      case when generated_ticket is null then null else 'JPCS-LCC-TICKET:' || generated_ticket end
    );
  end loop;

  select * into payment_row
  from public."hs-payments"
  where id = p_payment_id;
  return payment_row;
end;
$$;

revoke execute on function public.hs_submit_payment_for_site(uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.hs_submit_payment_for_site(uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, text, text, jsonb) to service_role;
