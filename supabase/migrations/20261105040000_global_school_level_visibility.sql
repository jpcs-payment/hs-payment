-- Add global public controls for which school levels can start a payment.
alter table public."hs-site-settings"
  add column if not exists visible_school_levels text[] not null default array['Junior High School', 'Senior High School', 'College']::text[];

alter table public."hs-site-settings"
  drop constraint if exists hs_site_settings_visible_school_levels_check;

alter table public."hs-site-settings"
  add constraint hs_site_settings_visible_school_levels_check
  check (
    cardinality(visible_school_levels) > 0
    and visible_school_levels <@ array['Junior High School', 'Senior High School', 'College']::text[]
  );

drop function if exists public.hs_update_public_payment_settings(boolean, text, boolean, integer);

create or replace function public.hs_update_public_payment_settings(
  p_is_open boolean,
  p_public_message text,
  p_allow_multiple_names boolean,
  p_max_names integer,
  p_visible_school_levels text[]
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
  normalized_visible_school_levels text[] := array[]::text[];
begin
  if not public.hs_is_admin() then
    raise exception 'Only a registered JPCS admin can update public payment settings.';
  end if;
  if normalized_max < 1 or normalized_max > 20 or (coalesce(p_allow_multiple_names, false) and normalized_max < 2) then
    raise exception 'The maximum number of names must be between 1 and 20, or at least 2 when multiple names are enabled.';
  end if;
  if normalized_message is null or length(normalized_message) > 300 then
    raise exception 'The public closure message must be between 1 and 300 characters.';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_visible_school_levels, array[]::text[])) as requested(level)
    where requested.level not in ('Junior High School', 'Senior High School', 'College')
  ) then
    raise exception 'The visible school levels are invalid.';
  end if;

  if 'Junior High School' = any(coalesce(p_visible_school_levels, array[]::text[])) then
    normalized_visible_school_levels := array_append(normalized_visible_school_levels, 'Junior High School');
  end if;
  if 'Senior High School' = any(coalesce(p_visible_school_levels, array[]::text[])) then
    normalized_visible_school_levels := array_append(normalized_visible_school_levels, 'Senior High School');
  end if;
  if 'College' = any(coalesce(p_visible_school_levels, array[]::text[])) then
    normalized_visible_school_levels := array_append(normalized_visible_school_levels, 'College');
  end if;
  if cardinality(normalized_visible_school_levels) = 0 then
    raise exception 'Keep at least one school level visible on the public form.';
  end if;

  update public."hs-site-settings"
   set is_open = coalesce(p_is_open, false),
       public_message = normalized_message,
       allow_multiple_names = coalesce(p_allow_multiple_names, false),
       max_names = normalized_max,
       visible_school_levels = normalized_visible_school_levels,
       updated_at = now()
  where site_key = 'public-payment'
  returning * into updated_row;

  if not found then
    insert into public."hs-site-settings" (site_key, is_open, public_message, allow_multiple_names, max_names, visible_school_levels)
    values ('public-payment', coalesce(p_is_open, false), normalized_message, coalesce(p_allow_multiple_names, false), normalized_max, normalized_visible_school_levels)
    returning * into updated_row;
  end if;

  update public."hs-offerings"
  set allow_multiple_names = updated_row.allow_multiple_names,
      max_names = case when updated_row.allow_multiple_names then updated_row.max_names else 1 end
  where archived_at is null;

  return updated_row;
end;
$$;

revoke execute on function public.hs_update_public_payment_settings(boolean, text, boolean, integer, text[]) from public, anon;
grant execute on function public.hs_update_public_payment_settings(boolean, text, boolean, integer, text[]) to authenticated;

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
   where site_key = 'public-payment';

  if not found or new.school_level is null or not (new.school_level = any(visible_levels)) then
    raise exception 'That school level is not currently available.';
  end if;
  return new;
end;
$$;

drop trigger if exists hs_payers_visible_school_level on public."hs-payers";
create trigger hs_payers_visible_school_level
before insert or update of school_level on public."hs-payers"
for each row execute function public.hs_validate_visible_school_level();
