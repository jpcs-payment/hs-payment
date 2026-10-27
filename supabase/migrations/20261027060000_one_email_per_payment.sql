-- Allow each normalized email address to submit only one payment record.
do $$
begin
  if exists (
    select lower(trim(email))
    from public."hs-payers"
    group by lower(trim(email))
    having count(*) > 1
  ) then
    raise exception 'Duplicate payer emails must be resolved before enforcing one payment per email.';
  end if;
end;
$$;

create unique index if not exists hs_payers_email_once_idx
  on public."hs-payers" (lower(trim(email)));

create or replace function public.hs_reject_duplicate_payer_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(nullif(trim(new.email), ''));
begin
  if normalized_email is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('hs-payer-email:' || normalized_email, 0));

  if exists (
    select 1
    from public."hs-payers"
    where lower(trim(email)) = normalized_email
  ) then
    raise exception 'email has been used'
      using errcode = 'P0001', detail = 'email_already_used';
  end if;

  return new;
end;
$$;

drop trigger if exists hs_payers_reject_duplicate_email on public."hs-payers";
create trigger hs_payers_reject_duplicate_email
before insert on public."hs-payers"
for each row execute function public.hs_reject_duplicate_payer_email();

revoke execute on function public.hs_reject_duplicate_payer_email() from public, anon, authenticated;
