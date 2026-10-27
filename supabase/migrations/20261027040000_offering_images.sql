alter table public."hs-offerings"
  add column if not exists image_path text,
  add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('hs-offering-images', 'hs-offering-images', true)
on conflict (id) do update set public = true;

drop policy if exists hs_offering_images_public_read on storage.objects;
create policy hs_offering_images_public_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'hs-offering-images');

drop policy if exists hs_offering_images_admin_insert on storage.objects;
create policy hs_offering_images_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'hs-offering-images' and public.hs_is_admin());

drop policy if exists hs_offering_images_admin_update on storage.objects;
create policy hs_offering_images_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'hs-offering-images' and public.hs_is_admin())
with check (bucket_id = 'hs-offering-images' and public.hs_is_admin());

drop policy if exists hs_offering_images_admin_delete on storage.objects;
create policy hs_offering_images_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'hs-offering-images' and public.hs_is_admin());
