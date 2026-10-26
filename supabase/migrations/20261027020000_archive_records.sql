alter table public."hs-payers"
  add column if not exists archived_at timestamptz;

alter table public."hs-offerings"
  add column if not exists archived_at timestamptz;

create index if not exists hs_payers_archived_at_idx on public."hs-payers" (archived_at);
create index if not exists hs_offerings_archived_at_idx on public."hs-offerings" (archived_at);

grant update (archived_at) on public."hs-payers" to authenticated;

drop policy if exists hs_offerings_public_read on public."hs-offerings";
create policy hs_offerings_public_read on public."hs-offerings"
for select to anon, authenticated
using (active = true and archived_at is null);

drop policy if exists hs_payers_public_insert on public."hs-payers";
create policy hs_payers_public_insert on public."hs-payers"
for insert to anon, authenticated
with check (archived_at is null);

drop policy if exists hs_payers_admin_update on public."hs-payers";
create policy hs_payers_admin_update on public."hs-payers"
for update to authenticated
using (public.hs_is_admin())
with check (public.hs_is_admin());

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

  if not found or not offering_row.active or offering_row.archived_at is not null then
    raise exception 'The selected offering is not available.';
  end if;

  select * into payer_row
  from public."hs-payers"
  where id = new.payer_id;

  if not found or payer_row.archived_at is not null then
    raise exception 'The selected payer is not available.';
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
