-- Caterer package CRUD and image storage policies
-- Run after the previous Supabase migrations.

alter table public.packages enable row level security;
alter table public.package_images enable row level security;

create policy packages_owner_insert on public.packages
for insert to authenticated
with check (caterer_id = (select caterer_id from public.get_my_profile()));

create policy packages_owner_update on public.packages
for update to authenticated
using (caterer_id = (select caterer_id from public.get_my_profile()))
with check (caterer_id = (select caterer_id from public.get_my_profile()));

create policy packages_owner_delete on public.packages
for delete to authenticated
using (caterer_id = (select caterer_id from public.get_my_profile()));

create policy package_images_owner_insert on public.package_images
for insert to authenticated
with check (exists (
    select 1 from public.packages p
    where p.id = package_images.package_id
      and p.caterer_id = (select caterer_id from public.get_my_profile())
));

create policy package_images_owner_delete on public.package_images
for delete to authenticated
using (exists (
    select 1 from public.packages p
    where p.id = package_images.package_id
      and p.caterer_id = (select caterer_id from public.get_my_profile())
));

insert into storage.buckets (id, name, public)
values ('package-images', 'package-images', true)
on conflict (id) do nothing;

drop policy if exists package_images_storage_insert on storage.objects;
create policy package_images_storage_insert on storage.objects
for insert to authenticated
with check (
    bucket_id = 'package-images'
    and (storage.foldername(name))[1] = (select caterer_id from public.get_my_profile())::text
);

drop policy if exists package_images_storage_delete on storage.objects;
create policy package_images_storage_delete on storage.objects
for delete to authenticated
using (
    bucket_id = 'package-images'
    and (storage.foldername(name))[1] = (select caterer_id from public.get_my_profile())::text
);
