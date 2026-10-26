-- Remove the auto-generated pre-College check so College submissions can be saved.
alter table public."hs-payers"
  drop constraint if exists "hs-payers_school_level_check",
  drop constraint if exists hs_payers_school_level_check;

alter table public."hs-payers"
  add constraint hs_payers_school_level_check
  check (school_level in ('Junior High School', 'Senior High School', 'College'));
