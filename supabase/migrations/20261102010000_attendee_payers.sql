-- Keep one payment per email while recording every named attendee as a payer.
alter table public."hs-payments"
  add column if not exists payer_email text;

update public."hs-payments" as payment
set payer_email = lower(trim(payer.email))
from public."hs-payers" as payer
where payer.id = payment.payer_id
  and payment.payer_email is null;

alter table public."hs-payments"
  alter column payer_email set not null;

drop index if exists public.hs_payers_email_once_idx;
drop trigger if exists hs_payers_reject_duplicate_email on public."hs-payers";
drop function if exists public.hs_reject_duplicate_payer_email();

create unique index if not exists hs_payments_email_once_idx
  on public."hs-payments" (lower(trim(payer_email)));

alter table public."hs-payment-attendees"
  add column if not exists payer_id uuid;

do $$
declare
  attendee_row record;
  generated_payer_id uuid;
begin
  for attendee_row in
    select
      attendee.id,
      attendee.payment_id,
      attendee.position,
      attendee.name,
      payment.payer_id as parent_payer_id,
      payer.email,
      payer.school_level,
      payer.year_level,
      payer.strand,
      payer.course
    from public."hs-payment-attendees" as attendee
    join public."hs-payments" as payment on payment.id = attendee.payment_id
    join public."hs-payers" as payer on payer.id = payment.payer_id
    where attendee.payer_id is null
    order by attendee.payment_id, attendee.position
  loop
    if attendee_row.position = 1 then
      update public."hs-payment-attendees"
      set payer_id = attendee_row.parent_payer_id
      where id = attendee_row.id;
    else
      generated_payer_id := gen_random_uuid();
      insert into public."hs-payers" (id, name, email, school_level, year_level, strand, course, avatar)
      values (
        generated_payer_id,
        attendee_row.name,
        attendee_row.email,
        attendee_row.school_level,
        attendee_row.year_level,
        attendee_row.strand,
        attendee_row.course,
        upper(left(regexp_replace(attendee_row.name, '[^A-Za-z0-9 ]', '', 'g'), 2))
      );
      update public."hs-payment-attendees"
      set payer_id = generated_payer_id
      where id = attendee_row.id;
    end if;
  end loop;
end;
$$;

alter table public."hs-payment-attendees"
  alter column payer_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hs_payment_attendees_payer_id_fkey'
      and conrelid = 'public."hs-payment-attendees"'::regclass
  ) then
    alter table public."hs-payment-attendees"
      add constraint hs_payment_attendees_payer_id_fkey
      foreign key (payer_id) references public."hs-payers"(id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists hs_payment_attendees_payer_id_idx
  on public."hs-payment-attendees" (payer_id);

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

  new.payer_email = lower(trim(payer_row.email));
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

drop function if exists public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, text, text, jsonb);

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
  attendee_payer_id uuid;
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

  perform pg_advisory_xact_lock(hashtextextended('hs-payment-email:' || normalized_email, 0));
  if exists (
    select 1
    from public."hs-payments"
    where lower(trim(payer_email)) = normalized_email
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
    payer_email,
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
    normalized_email,
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
    if name_index = 1 then
      attendee_payer_id := p_payer_id;
    else
      attendee_payer_id := gen_random_uuid();
      insert into public."hs-payers" (id, name, email, school_level, year_level, strand, course, avatar)
      values (
        attendee_payer_id,
        name_value,
        normalized_email,
        p_school_level,
        normalized_year,
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

  return payment_row;
end;
$$;

revoke execute on function public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, text, text, jsonb) to service_role;

create or replace function public.hs_delete_payer_permanently(p_payer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payer_archived_at timestamptz;
  payment_ids uuid[];
  linked_payer_ids uuid[];
begin
  if not public.hs_is_admin() then
    raise exception 'Only a registered JPCS admin can permanently delete payers.';
  end if;

  select archived_at
    into payer_archived_at
  from public."hs-payers"
  where id = p_payer_id
  for update;

  if not found then
    return;
  end if;

  if payer_archived_at is null then
    raise exception 'Only archived payers can be permanently deleted.';
  end if;

  select coalesce(array_agg(distinct payment.id), array[]::uuid[])
    into payment_ids
  from public."hs-payments" as payment
  where payment.payer_id = p_payer_id
     or exists (
       select 1
       from public."hs-payment-attendees" as attendee
       where attendee.payment_id = payment.id
         and attendee.payer_id = p_payer_id
     );

  select coalesce(array_agg(distinct attendee.payer_id), array[]::uuid[])
    into linked_payer_ids
  from public."hs-payment-attendees" as attendee
  where attendee.payment_id = any(payment_ids);
  linked_payer_ids := array_append(linked_payer_ids, p_payer_id);

  delete from public."hs-email-deliveries"
  where payment_id = any(payment_ids);

  delete from public."hs-payments"
  where id = any(payment_ids);

  delete from public."hs-payers"
  where id = any(linked_payer_ids);
end;
$$;

create or replace function public.hs_delete_offering_permanently(p_offering_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  offering_archived_at timestamptz;
  payer_ids uuid[];
begin
  if not public.hs_is_admin() then
    raise exception 'Only a registered JPCS admin can permanently delete payment types.';
  end if;

  select archived_at
    into offering_archived_at
  from public."hs-offerings"
  where id = p_offering_id
  for update;

  if not found then
    return;
  end if;

  if offering_archived_at is null then
    raise exception 'Only archived payment types can be permanently deleted.';
  end if;

  select coalesce(array_agg(distinct payer_id), array[]::uuid[])
    into payer_ids
  from (
    select payment.payer_id
    from public."hs-payments" as payment
    where payment.offering_id = p_offering_id
    union
    select attendee.payer_id
    from public."hs-payment-attendees" as attendee
    join public."hs-payments" as payment on payment.id = attendee.payment_id
    where payment.offering_id = p_offering_id
  ) as linked_payers;

  delete from public."hs-email-deliveries"
  where payment_id in (
    select id
    from public."hs-payments"
    where offering_id = p_offering_id
  );

  delete from public."hs-payments"
  where offering_id = p_offering_id;

  delete from public."hs-payers" as payer
  where payer.id = any(payer_ids)
    and not exists (
      select 1
      from public."hs-payments" as payment
      where payment.payer_id = payer.id
    )
    and not exists (
      select 1
      from public."hs-payment-attendees" as attendee
      where attendee.payer_id = payer.id
    );

  delete from public."hs-offerings"
  where id = p_offering_id;

  if not found then
    raise exception 'The payment type could not be deleted.';
  end if;
end;
$$;

revoke execute on function public.hs_delete_payer_permanently(uuid) from public, anon;
grant execute on function public.hs_delete_payer_permanently(uuid) to authenticated;
revoke execute on function public.hs_delete_offering_permanently(uuid) from public, anon;
grant execute on function public.hs_delete_offering_permanently(uuid) to authenticated;
