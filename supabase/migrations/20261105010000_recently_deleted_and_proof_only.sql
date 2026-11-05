-- Keep the existing archived_at column for persisted data, but give deleted rows
-- an explicit automatic-purge deadline.
alter table public."hs-payers"
  add column if not exists purge_at timestamptz;

alter table public."hs-offerings"
  add column if not exists purge_at timestamptz;

update public."hs-payers"
set purge_at = archived_at + interval '30 days'
where archived_at is not null
  and purge_at is null;

update public."hs-offerings"
set purge_at = archived_at + interval '30 days'
where archived_at is not null
  and purge_at is null;

create index if not exists hs_payers_purge_at_idx on public."hs-payers" (purge_at);
create index if not exists hs_offerings_purge_at_idx on public."hs-offerings" (purge_at);

create or replace function public.hs_sync_recently_deleted_purge_at()
returns trigger
language plpgsql
as $$
begin
  new.purge_at = case
    when new.archived_at is null then null
    else new.archived_at + interval '30 days'
  end;
  return new;
end;
$$;

drop trigger if exists hs_payers_sync_recently_deleted_purge_at on public."hs-payers";
create trigger hs_payers_sync_recently_deleted_purge_at
before insert or update of archived_at on public."hs-payers"
for each row execute function public.hs_sync_recently_deleted_purge_at();

drop trigger if exists hs_offerings_sync_recently_deleted_purge_at on public."hs-offerings";
create trigger hs_offerings_sync_recently_deleted_purge_at
before insert or update of archived_at on public."hs-offerings"
for each row execute function public.hs_sync_recently_deleted_purge_at();

-- New public submissions use this overload and never write sender account data.
-- The older service-role-only function remains available for already deployed
-- callers, while this wrapper clears those legacy columns in the same transaction.
drop function if exists public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, jsonb);

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
  p_proof_path text,
  p_attendee_names jsonb
)
returns public."hs-payments"
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public."hs-payments"%rowtype;
  legacy_sender_value text := case
    when p_payment_mode = 'PayNow' and p_method in ('GCash', 'MariBank') then 'proof-only'
    else null
  end;
begin
  payment_row := public.hs_submit_payment(
    p_payment_id,
    p_payer_id,
    p_student_name,
    p_email,
    p_school_level,
    p_year_level,
    p_strand,
    p_course,
    p_offering_id,
    p_method,
    p_payment_mode,
    legacy_sender_value,
    legacy_sender_value,
    p_proof_path,
    p_attendee_names
  );

  update public."hs-payments"
  set sender_account_name = null,
      sender_reference = null
  where id = p_payment_id
  returning * into payment_row;

  return payment_row;
end;
$$;

revoke execute on function public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.hs_submit_payment(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, jsonb) to service_role;

create or replace function public.hs_expired_recently_deleted_assets()
returns table (
  payer_ids uuid[],
  offering_ids uuid[],
  proof_paths text[],
  offering_image_paths text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and not public.hs_is_admin() then
    raise exception 'Only a registered JPCS admin or purge worker can inspect expired deleted records.';
  end if;

  return query
  with expired_payers as (
    select id
    from public."hs-payers"
    where archived_at is not null
      and purge_at is not null
      and purge_at <= now()
  ),
  expired_offerings as (
    select id
    from public."hs-offerings"
    where archived_at is not null
      and purge_at is not null
      and purge_at <= now()
  ),
  expired_payments as (
    select distinct payment.id
    from public."hs-payments" as payment
    left join public."hs-payment-attendees" as attendee on attendee.payment_id = payment.id
    where payment.payer_id in (select id from expired_payers)
       or payment.offering_id in (select id from expired_offerings)
       or attendee.payer_id in (select id from expired_payers)
  )
  select
    coalesce(array(select id from expired_payers), '{}'::uuid[]),
    coalesce(array(select id from expired_offerings), '{}'::uuid[]),
    coalesce(array(
      select distinct payment.proof_path
      from public."hs-payments" as payment
      where payment.id in (select id from expired_payments)
        and payment.proof_path is not null
    ), '{}'::text[]),
    coalesce(array(
      select distinct offering.image_path
      from public."hs-offerings" as offering
      where offering.id in (select id from expired_offerings)
        and offering.image_path is not null
    ), '{}'::text[]);
end;
$$;

revoke execute on function public.hs_expired_recently_deleted_assets() from public, anon, authenticated;
grant execute on function public.hs_expired_recently_deleted_assets() to service_role;

create or replace function public.hs_purge_expired_recently_deleted(
  p_payer_ids uuid[] default '{}',
  p_offering_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_payer_id uuid;
  target_offering_id uuid;
  payment_ids uuid[];
  linked_payer_ids uuid[];
  payment_count integer := 0;
  payer_count integer := 0;
  offering_count integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Only the purge worker can permanently delete expired records.';
  end if;

  foreach target_offering_id in array coalesce(p_offering_ids, '{}'::uuid[]) loop
    if not exists (
      select 1
      from public."hs-offerings"
      where id = target_offering_id
        and archived_at is not null
        and purge_at is not null
        and purge_at <= now()
    ) then
      continue;
    end if;

    select coalesce(array_agg(payment.id), '{}'::uuid[])
    into payment_ids
    from public."hs-payments" as payment
    where payment.offering_id = target_offering_id;

    select coalesce(array_agg(distinct linked.payer_id), '{}'::uuid[])
    into linked_payer_ids
    from (
      select payment.payer_id
      from public."hs-payments" as payment
      where payment.id = any(payment_ids)
      union
      select attendee.payer_id
      from public."hs-payment-attendees" as attendee
      where attendee.payment_id = any(payment_ids)
    ) as linked;

    payment_count := payment_count + cardinality(payment_ids);
    delete from public."hs-email-deliveries"
    where payment_id = any(payment_ids);
    delete from public."hs-payments"
    where id = any(payment_ids);

    delete from public."hs-payers" as payer
    where payer.id = any(linked_payer_ids)
      and not exists (select 1 from public."hs-payments" where payer_id = payer.id)
      and not exists (select 1 from public."hs-payment-attendees" where payer_id = payer.id);

    delete from public."hs-offerings" as offering
    where offering.id = target_offering_id;
    if found then
      offering_count := offering_count + 1;
    end if;
  end loop;

  foreach target_payer_id in array coalesce(p_payer_ids, '{}'::uuid[]) loop
    if not exists (
      select 1
      from public."hs-payers"
      where id = target_payer_id
        and archived_at is not null
        and purge_at is not null
        and purge_at <= now()
    ) then
      continue;
    end if;

    select coalesce(array_agg(distinct payment.id), '{}'::uuid[])
    into payment_ids
    from public."hs-payments" as payment
    where payment.payer_id = target_payer_id
       or exists (
         select 1
         from public."hs-payment-attendees" as attendee
         where attendee.payment_id = payment.id
            and attendee.payer_id = target_payer_id
        );

    select coalesce(array_agg(distinct linked.payer_id), '{}'::uuid[])
    into linked_payer_ids
    from (
      select payment.payer_id
      from public."hs-payments" as payment
      where payment.id = any(payment_ids)
      union
      select attendee.payer_id
      from public."hs-payment-attendees" as attendee
      where attendee.payment_id = any(payment_ids)
    ) as linked;
    linked_payer_ids := array_append(linked_payer_ids, target_payer_id);

    payment_count := payment_count + cardinality(payment_ids);
    delete from public."hs-email-deliveries"
    where payment_id = any(payment_ids);
    delete from public."hs-payments"
    where id = any(payment_ids);

    delete from public."hs-payers" as payer
    where payer.id = any(linked_payer_ids)
      and not exists (select 1 from public."hs-payments" where payer_id = payer.id)
      and not exists (select 1 from public."hs-payment-attendees" where payer_id = payer.id);
    if found then
      payer_count := payer_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'payers', payer_count,
    'offerings', offering_count,
    'payments', payment_count
  );
end;
$$;

revoke execute on function public.hs_purge_expired_recently_deleted(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.hs_purge_expired_recently_deleted(uuid[], uuid[]) to service_role;
