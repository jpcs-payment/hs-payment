-- Keep public payment submissions allowlisted and keep payment proofs private.
update storage.buckets
set public = false,
    file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'hs-payment-proofs';

update public."hs-payments"
set proof_url = null
where proof_url is not null;

create table if not exists public."hs-submission-attempts" (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists hs_submission_attempts_email_created_idx on public."hs-submission-attempts" (email, created_at desc);
create index if not exists hs_submission_attempts_ip_created_idx on public."hs-submission-attempts" (ip_hash, created_at desc);
alter table public."hs-submission-attempts" enable row level security;
revoke all on public."hs-submission-attempts" from public, anon, authenticated;
grant select, insert on public."hs-submission-attempts" to service_role;

create or replace function public.hs_claim_submission_slot(
  p_email text,
  p_ip_hash text,
  p_email_limit integer default 5,
  p_ip_limit integer default 20,
  p_window_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(nullif(trim(p_email), ''));
  window_start timestamptz := now() - make_interval(secs => greatest(p_window_seconds, 1));
  email_count integer;
  ip_count integer := 0;
begin
  if normalized_email is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('email:' || normalized_email, 0));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('ip:' || p_ip_hash, 0));
  end if;

  select count(*)::integer into email_count
  from public."hs-submission-attempts"
  where email = normalized_email and created_at >= window_start;
  if p_ip_hash is not null then
    select count(*)::integer into ip_count
    from public."hs-submission-attempts"
    where ip_hash = p_ip_hash and created_at >= window_start;
  end if;
  if email_count >= greatest(p_email_limit, 1) or ip_count >= greatest(p_ip_limit, 1) then
    return false;
  end if;

  insert into public."hs-submission-attempts" (email, ip_hash) values (normalized_email, p_ip_hash);
  return true;
end;
$$;

revoke execute on function public.hs_claim_submission_slot(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.hs_claim_submission_slot(text, text, integer, integer, integer) to service_role;

revoke insert on public."hs-payers", public."hs-payments" from anon, authenticated;

drop policy if exists hs_payers_public_insert on public."hs-payers";
drop policy if exists hs_payments_public_insert on public."hs-payments";

drop policy if exists hs_payment_proofs_public_insert on storage.objects;
drop policy if exists hs_payment_proofs_admin_insert on storage.objects;

drop policy if exists hs_payment_proofs_public_read on storage.objects;
drop policy if exists hs_payment_proofs_admin_read on storage.objects;
create policy hs_payment_proofs_admin_read on storage.objects
for select to authenticated
using (bucket_id = 'hs-payment-proofs' and public.hs_is_admin());

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
begin
  select * into offering_row
  from public."hs-offerings"
  where id = new.offering_id;

  if not found or not offering_row.active or offering_row.archived_at is not null then
    raise exception 'The selected offering is not available.';
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
    if new.payment_mode = 'PayLater' then
      new.ticket_id = format('TKT-%s%s', to_char(now() at time zone 'Asia/Manila', 'YY'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
      new.ticket_qr_value = 'JPCS-LCC-TICKET:' || new.ticket_id;
    else
      new.ticket_id = null;
      new.ticket_qr_value = null;
    end if;
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
  p_proof_path text
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
  normalized_name text := nullif(trim(p_student_name), '');
  normalized_email text := lower(nullif(trim(p_email), ''));
  normalized_year text := nullif(trim(p_year_level), '');
  normalized_strand text := nullif(trim(p_strand), '');
  normalized_course text := nullif(trim(p_course), '');
  normalized_sender_name text := nullif(trim(p_sender_account_name), '');
  normalized_sender_reference text := nullif(trim(p_sender_reference), '');
  normalized_proof_path text := nullif(trim(p_proof_path), '');
begin
  if p_payment_id is null or p_payer_id is null then
    raise exception 'Payment identifiers are required.';
  end if;
  if normalized_name is null or length(normalized_name) > 160 then
    raise exception 'A valid student name is required.';
  end if;
  if normalized_email is null or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'A valid email address is required.';
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
    normalized_name,
    normalized_email,
    p_school_level,
    normalized_year,
    normalized_strand,
    normalized_course,
    upper(left(regexp_replace(normalized_name, '[^A-Za-z0-9 ]', '', 'g'), 2))
  );

  insert into public."hs-payments" (
    id,
    reference,
    payer_id,
    offering_id,
    offering_name,
    amount,
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

  return payment_row;
end;
$$;

create or replace function public.hs_delete_unclaimed_payment_proof(
  p_payment_id uuid,
  p_proof_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_payment_id is null or p_proof_path is null or split_part(p_proof_path, '/', 1) <> p_payment_id::text then
    raise exception 'The proof image path is invalid.';
  end if;
  if exists (select 1 from public."hs-payments" where id = p_payment_id) then
    raise exception 'The proof image is already attached to a payment.';
  end if;
  delete from storage.objects
  where bucket_id = 'hs-payment-proofs'
    and name = p_proof_path;
end;
$$;

revoke execute on function public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, text, text) to service_role;
revoke execute on function public.hs_delete_unclaimed_payment_proof(uuid, text) from public, anon, authenticated;
grant execute on function public.hs_delete_unclaimed_payment_proof(uuid, text) to service_role;
