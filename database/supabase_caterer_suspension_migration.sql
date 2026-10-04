-- Reversible caterer restrictions controlled by administrators.
-- Run after supabase_customer_reports_migration.sql and supabase_package_management_migration.sql.
--
-- Suspended caterers retain their account and data, but cannot access the
-- caterer dashboard, manage packages, accept bookings, or appear in the
-- public package catalog. The restriction can be lifted by an administrator.

alter table public.caterers
    add column if not exists is_suspended boolean not null default false,
    add column if not exists suspension_reason text,
    add column if not exists suspended_at timestamptz,
    add column if not exists suspended_by bigint references public.users(id) on delete set null;

drop policy if exists caterers_select_admin on public.caterers;
create policy caterers_select_admin on public.caterers
for select to authenticated
using (public.is_admin());

drop policy if exists caterers_public_verified on public.caterers;
create policy caterers_public_verified on public.caterers
for select to anon, authenticated
using (is_verified = true and is_suspended = false);

drop policy if exists packages_public_verified_caterers on public.packages;
create policy packages_public_verified_caterers on public.packages
for select to anon, authenticated
using (exists (
    select 1
    from public.caterers c
    where c.id = packages.caterer_id
      and c.is_verified = true
      and c.is_suspended = false
));

drop policy if exists package_images_public on public.package_images;
create policy package_images_public on public.package_images
for select to anon, authenticated
using (exists (
    select 1
    from public.packages p
    join public.caterers c on c.id = p.caterer_id
    where p.id = package_images.package_id
      and c.is_verified = true
      and c.is_suspended = false
));

drop policy if exists packages_owner_insert on public.packages;
create policy packages_owner_insert on public.packages
for insert to authenticated
with check (
    caterer_id = (select caterer_id from public.get_my_profile())
    and not exists (
        select 1 from public.caterers c
        where c.id = packages.caterer_id and c.is_suspended
    )
);

drop policy if exists packages_owner_update on public.packages;
create policy packages_owner_update on public.packages
for update to authenticated
using (
    caterer_id = (select caterer_id from public.get_my_profile())
    and not exists (
        select 1 from public.caterers c
        where c.id = packages.caterer_id and c.is_suspended
    )
)
with check (
    caterer_id = (select caterer_id from public.get_my_profile())
    and not exists (
        select 1 from public.caterers c
        where c.id = packages.caterer_id and c.is_suspended
    )
);

drop policy if exists packages_owner_delete on public.packages;
create policy packages_owner_delete on public.packages
for delete to authenticated
using (
    caterer_id = (select caterer_id from public.get_my_profile())
    and not exists (
        select 1 from public.caterers c
        where c.id = packages.caterer_id and c.is_suspended
    )
);

drop policy if exists package_images_owner_insert on public.package_images;
create policy package_images_owner_insert on public.package_images
for insert to authenticated
with check (exists (
    select 1
    from public.packages p
    join public.caterers c on c.id = p.caterer_id
    where p.id = package_images.package_id
      and p.caterer_id = (select caterer_id from public.get_my_profile())
      and c.is_suspended = false
));

drop policy if exists package_images_owner_delete on public.package_images;
create policy package_images_owner_delete on public.package_images
for delete to authenticated
using (exists (
    select 1
    from public.packages p
    join public.caterers c on c.id = p.caterer_id
    where p.id = package_images.package_id
      and p.caterer_id = (select caterer_id from public.get_my_profile())
      and c.is_suspended = false
));

create or replace function public.get_my_profile()
returns table (
    user_id bigint,
    role varchar,
    customer_id bigint,
    caterer_id bigint,
    display_name varchar,
    is_verified boolean
)
language sql
stable
security definer set search_path = public
as $$
    select
        u.id,
        u.role,
        c.id,
        case when ca.is_suspended then null else ca.id end,
        coalesce(c.full_name, ca.business_name),
        case when u.role = 'caterer'
            then coalesce(ca.is_verified, false) and not coalesce(ca.is_suspended, false)
            else coalesce(c.is_verified, ca.is_verified, false)
        end
    from public.users u
    left join public.customers c on c.user_id = u.id
    left join public.caterers ca on ca.user_id = u.id
    where u.auth_user_id = auth.uid()
    limit 1;
$$;

create or replace function public.set_caterer_suspension(
    p_caterer_id bigint,
    p_is_suspended boolean,
    p_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    admin_id bigint;
    target_name varchar(150);
    reason_text text;
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    reason_text := nullif(trim(p_reason), '');
    if p_is_suspended and (reason_text is null or char_length(reason_text) < 5) then
        raise exception 'A suspension reason of at least 5 characters is required';
    end if;

    select id into admin_id
    from public.users
    where auth_user_id = auth.uid() and role = 'admin';

    update public.caterers
    set is_suspended = p_is_suspended,
        suspension_reason = case when p_is_suspended then reason_text else null end,
        suspended_at = case when p_is_suspended then now() else null end,
        suspended_by = case when p_is_suspended then admin_id else null end
    where id = p_caterer_id
    returning business_name into target_name;

    if target_name is null then
        raise exception 'Caterer not found';
    end if;

    insert into public.admin_activity_log (admin_user_id, action, details)
    values (
        admin_id,
        case when p_is_suspended then 'suspend_caterer' else 'reinstate_caterer' end,
        left(
            case when p_is_suspended then 'Restricted ' else 'Restored ' end
            || target_name || ' (#' || p_caterer_id || ')'
            || case when p_is_suspended then ': ' || reason_text else '' end,
            255
        )
    );
end;
$$;

create or replace function public.get_my_caterer_suspension_reason()
returns text
language sql
stable
security definer set search_path = public
as $$
    select ca.suspension_reason
    from public.users u
    join public.caterers ca on ca.user_id = u.id
    where u.auth_user_id = auth.uid()
      and ca.is_suspended = true
    limit 1;
$$;

revoke all on function public.set_caterer_suspension(bigint, boolean, text) from public;
grant execute on function public.set_caterer_suspension(bigint, boolean, text) to authenticated;
revoke all on function public.get_my_caterer_suspension_reason() from public;
grant execute on function public.get_my_caterer_suspension_reason() to authenticated;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

revoke update on public.caterers from authenticated;
grant update (
    business_name,
    phone,
    address,
    city,
    description,
    paypal_email,
    profile_image
) on public.caterers to authenticated;
