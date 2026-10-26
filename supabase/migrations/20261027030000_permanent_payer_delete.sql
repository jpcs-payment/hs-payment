create or replace function public.hs_delete_payer_permanently(p_payer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payer_archived_at timestamptz;
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

  delete from public."hs-email-deliveries"
  where payment_id in (
    select id
    from public."hs-payments"
    where payer_id = p_payer_id
  );

  delete from public."hs-payments"
  where payer_id = p_payer_id;

  delete from public."hs-payers"
  where id = p_payer_id;

  if not found then
    raise exception 'The payer could not be deleted.';
  end if;
end;
$$;

revoke execute on function public.hs_delete_payer_permanently(uuid) from public, anon;
grant execute on function public.hs_delete_payer_permanently(uuid) to authenticated;

drop policy if exists hs_payment_proofs_admin_delete on storage.objects;
create policy hs_payment_proofs_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'hs-payment-proofs' and public.hs_is_admin());
