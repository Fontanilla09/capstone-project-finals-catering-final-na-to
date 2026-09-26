-- Public package browsing policies
-- Run after supabase_schema.sql and supabase_auth_migration.sql.

create policy caterers_public_verified on public.caterers
for select to anon, authenticated
using (is_verified = true);

create policy packages_public_verified_caterers on public.packages
for select to anon, authenticated
using (exists (
    select 1 from public.caterers c
    where c.id = packages.caterer_id and c.is_verified = true
));

create policy package_images_public on public.package_images
for select to anon, authenticated
using (exists (
    select 1 from public.packages p
    join public.caterers c on c.id = p.caterer_id
    where p.id = package_images.package_id and c.is_verified = true
));
