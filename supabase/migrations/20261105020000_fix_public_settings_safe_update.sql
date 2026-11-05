-- Keep global attendee settings in sync without rewriting recently deleted offerings.
create or replace function public.hs_update_public_payment_settings(
  p_is_open boolean,
  p_public_message text,
  p_allow_multiple_names boolean,
  p_max_names integer
)
returns public."hs-site-settings"
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public."hs-site-settings"%rowtype;
  normalized_max integer := coalesce(p_max_names, 10);
  normalized_message text := nullif(trim(p_public_message), '');
begin
  if not public.hs_is_admin() then
    raise exception 'Only a registered JPCS admin can update public payment settings.';
  end if;
  if normalized_max < 1 or normalized_max > 10 or (coalesce(p_allow_multiple_names, false) and normalized_max < 2) then
    raise exception 'The maximum number of names must be between 1 and 10, or at least 2 when multiple names are enabled.';
  end if;
  if normalized_message is null or length(normalized_message) > 300 then
    raise exception 'The public closure message must be between 1 and 300 characters.';
  end if;

  update public."hs-site-settings"
   set is_open = coalesce(p_is_open, false),
       public_message = normalized_message,
       allow_multiple_names = coalesce(p_allow_multiple_names, false),
       max_names = normalized_max,
       updated_at = now()
  where site_key = 'public-payment'
  returning * into updated_row;

  if not found then
    insert into public."hs-site-settings" (site_key, is_open, public_message, allow_multiple_names, max_names)
    values ('public-payment', coalesce(p_is_open, false), normalized_message, coalesce(p_allow_multiple_names, false), normalized_max)
    returning * into updated_row;
  end if;

  update public."hs-offerings"
  set allow_multiple_names = updated_row.allow_multiple_names,
      max_names = case when updated_row.allow_multiple_names then updated_row.max_names else 1 end
  where archived_at is null;

  return updated_row;
end;
$$;

revoke execute on function public.hs_update_public_payment_settings(boolean, text, boolean, integer) from public, anon;
grant execute on function public.hs_update_public_payment_settings(boolean, text, boolean, integer) to authenticated;
