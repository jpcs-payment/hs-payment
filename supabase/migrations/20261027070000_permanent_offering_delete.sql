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
  from public."hs-payments"
  where offering_id = p_offering_id;

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
      from public."hs-payments"
      where payer_id = payer.id
    );

  delete from public."hs-offerings"
  where id = p_offering_id;

  if not found then
    raise exception 'The payment type could not be deleted.';
  end if;
end;
$$;

revoke execute on function public.hs_delete_offering_permanently(uuid) from public, anon;
grant execute on function public.hs_delete_offering_permanently(uuid) to authenticated;
