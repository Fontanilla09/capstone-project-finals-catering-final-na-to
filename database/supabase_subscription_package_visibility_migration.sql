-- Hide package listings and images unless the verified caterer has an active,
-- unexpired subscription. Existing package records remain intact and become
-- visible again when the caterer renews.
-- Run after supabase_paymongo_subscriptions_migration.sql.

create or replace function public.caterer_is_publicly_listable(p_caterer_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.caterers c
        join public.caterer_subscriptions s on s.caterer_id = c.id
        where c.id = p_caterer_id
          and c.is_verified = true
          and c.is_suspended = false
          and s.status = 'active'
          and s.expires_at > now()
    );
$$;

revoke all on function public.caterer_is_publicly_listable(bigint) from public;
grant execute on function public.caterer_is_publicly_listable(bigint) to anon, authenticated;

drop policy if exists packages_public_verified_caterers on public.packages;
create policy packages_public_verified_caterers on public.packages
for select to anon, authenticated
using (public.caterer_is_publicly_listable(caterer_id));

drop policy if exists packages_admin_select on public.packages;
create policy packages_admin_select on public.packages
for select to authenticated
using (public.is_admin());

drop policy if exists package_images_public on public.package_images;
create policy package_images_public on public.package_images
for select to anon, authenticated
using (exists (
    select 1
    from public.packages p
    where p.id = package_images.package_id
      and public.caterer_is_publicly_listable(p.caterer_id)
));

drop policy if exists package_images_admin_select on public.package_images;
create policy package_images_admin_select on public.package_images
for select to authenticated
using (public.is_admin());

notify pgrst, 'reload schema';
