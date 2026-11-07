-- Keep the test site open and provide an admin-only cleanup for test submissions.
create or replace function public.hs_keep_test_site_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.site_key = 'test-payment' then
    new.is_open := true;
  end if;
  return new;
end;
$$;

drop trigger if exists hs_keep_test_site_open on public."hs-site-settings";
create trigger hs_keep_test_site_open
before insert or update on public."hs-site-settings"
for each row execute function public.hs_keep_test_site_open();

update public."hs-site-settings"
set is_open = true,
    updated_at = now()
where site_key = 'test-payment';

create or replace function public.hs_delete_all_test_site_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hs_is_admin() then
    raise exception 'Only a registered JPCS admin can delete test payment data.';
  end if;

  delete from public."hs-email-deliveries"
  where payment_id in (
    select id
    from public."hs-payments"
    where site_key = 'test-payment'
  );

  delete from public."hs-payments"
  where site_key = 'test-payment';

  delete from public."hs-payers" as payer
  where payer.site_key = 'test-payment'
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
end;
$$;

revoke execute on function public.hs_delete_all_test_site_data() from public, anon;
grant execute on function public.hs_delete_all_test_site_data() to authenticated;
