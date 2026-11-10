-- Allow admins to monitor caterer subscription history.
-- Run after supabase_admin_migration.sql and supabase_paymongo_subscriptions_migration.sql.

-- Undo the account suspension previously applied as a side effect of subscription deactivation.
update public.caterers
set is_suspended = false,
    suspension_reason = null,
    suspended_at = null,
    suspended_by = null,
    updated_at = now()
where is_suspended = true
  and suspension_reason = 'Admin deactivated subscription access';

create or replace function public.get_admin_caterer_subscriptions()
returns table (
    subscription_id bigint,
    caterer_id bigint,
    business_name varchar,
    email varchar,
    plan text,
    amount integer,
    status text,
    created_at timestamptz,
    started_at timestamptz,
    expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    return query
    with latest_subscription as (
        select distinct on (s.caterer_id) s.*
        from public.caterer_subscriptions s
        order by s.caterer_id, s.created_at desc
    )
    select
        ls.id,
        c.id,
        c.business_name,
        u.email,
        coalesce(ls.plan, 'none'),
        coalesce(ls.amount, 0),
        case
            when ls.id is null then 'not_subscribed'
            when ls.status = 'pending' then 'pending'
            when ls.status = 'failed' then 'failed'
            when ls.status = 'active' and (ls.expires_at is null or ls.expires_at <= now()) then 'expired'
            when ls.status = 'active' then 'active'
            else coalesce(ls.status, 'not_subscribed')
        end,
        ls.created_at,
        ls.started_at,
        ls.expires_at
    from public.caterers c
    join public.users u on u.id = c.user_id
    left join latest_subscription ls on ls.caterer_id = c.id
    where c.is_verified = true
    order by c.business_name asc;
end;
$$;

revoke all on function public.get_admin_caterer_subscriptions() from public, anon;
grant execute on function public.get_admin_caterer_subscriptions() to authenticated;

create or replace function public.admin_activate_caterer_subscription(p_subscription_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    subscription_row public.caterer_subscriptions%rowtype;
    admin_id bigint;
    renewal_interval interval;
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    select * into subscription_row
    from public.caterer_subscriptions
    where id = p_subscription_id
    for update;

    if not found then
        raise exception 'Subscription not found';
    end if;

    select id into admin_id
    from public.users
    where auth_user_id = auth.uid() and role = 'admin';

    renewal_interval := case subscription_row.plan
        when 'yearly' then interval '1 year'
        else interval '1 month'
    end;

    update public.caterer_subscriptions
    set status = 'active',
        started_at = now(),
        expires_at = now() + renewal_interval,
        updated_at = now()
    where id = p_subscription_id;

    insert into public.admin_activity_log (admin_user_id, action, details)
    values (
        admin_id,
        'activate_caterer_subscription',
        'Activated ' || coalesce((select business_name from public.caterers where id = subscription_row.caterer_id), 'caterer')
        || ' (#' || subscription_row.caterer_id || ') with a ' || subscription_row.plan || ' subscription.'
    );
end;
$$;

create or replace function public.admin_deactivate_caterer_subscription(p_subscription_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    subscription_row public.caterer_subscriptions%rowtype;
    admin_id bigint;
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    select * into subscription_row
    from public.caterer_subscriptions
    where id = p_subscription_id
    for update;

    if not found then
        raise exception 'Subscription not found';
    end if;

    select id into admin_id
    from public.users
    where auth_user_id = auth.uid() and role = 'admin';

    update public.caterer_subscriptions
    set status = 'expired',
        expires_at = now(),
        updated_at = now()
    where id = p_subscription_id;

    insert into public.admin_activity_log (admin_user_id, action, details)
    values (
        admin_id,
        'deactivate_caterer_subscription',
        'Deactivated ' || coalesce((select business_name from public.caterers where id = subscription_row.caterer_id), 'caterer')
        || ' (#' || subscription_row.caterer_id || ') subscription access.'
    );
end;
$$;

create or replace function public.admin_activate_caterer_subscription_for_caterer(
    p_caterer_id bigint,
    p_plan text default 'monthly',
    p_amount integer default 49900
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    admin_id bigint;
    existing_subscription public.caterer_subscriptions%rowtype;
    renewal_interval interval;
    effective_plan text;
    effective_amount integer;
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    if p_plan not in ('monthly', 'yearly') then
        raise exception 'Plan must be monthly or yearly';
    end if;

    effective_plan := p_plan;
    effective_amount := p_amount;

    select * into existing_subscription
    from public.caterer_subscriptions
    where caterer_id = p_caterer_id
    order by created_at desc
    limit 1
    for update;

    if existing_subscription.id is null then
        insert into public.caterer_subscriptions (
            caterer_id,
            plan,
            amount,
            currency,
            status,
            paymongo_checkout_session_id,
            reference_number,
            started_at,
            expires_at,
            created_at,
            updated_at
        )
        values (
            p_caterer_id,
            effective_plan,
            effective_amount,
            'PHP',
            'active',
            'admin-override-' || p_caterer_id || '-' || replace(gen_random_uuid()::text, '-', ''),
            'ADMIN-' || p_caterer_id || '-' || replace(gen_random_uuid()::text, '-', ''),
            now(),
            now() + case effective_plan when 'yearly' then interval '1 year' else interval '1 month' end,
            now(),
            now()
        );
    else
        renewal_interval := case effective_plan
            when 'yearly' then interval '1 year'
            else interval '1 month'
        end;

        update public.caterer_subscriptions
        set plan = effective_plan,
            amount = effective_amount,
            status = 'active',
            started_at = now(),
            expires_at = now() + renewal_interval,
            updated_at = now()
        where id = existing_subscription.id;
    end if;

    select id into admin_id
    from public.users
    where auth_user_id = auth.uid() and role = 'admin';

    insert into public.admin_activity_log (admin_user_id, action, details)
    values (
        admin_id,
        'activate_caterer_subscription',
        'Activated ' || coalesce((select business_name from public.caterers where id = p_caterer_id), 'caterer')
        || ' (#' || p_caterer_id || ') with admin override for ' || effective_plan || '.'
    );
end;
$$;

revoke all on function public.admin_activate_caterer_subscription(bigint) from public, anon;
grant execute on function public.admin_activate_caterer_subscription(bigint) to authenticated;
revoke all on function public.admin_deactivate_caterer_subscription(bigint) from public, anon;
grant execute on function public.admin_deactivate_caterer_subscription(bigint) to authenticated;
revoke all on function public.admin_activate_caterer_subscription_for_caterer(bigint, text, integer) from public, anon;
grant execute on function public.admin_activate_caterer_subscription_for_caterer(bigint, text, integer) to authenticated;

-- Keep package and image management locked whenever the subscription is inactive
-- or expired, even if an older migration recreated the policies without this check.
create or replace function public.caterer_has_active_subscription_for_auth_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.caterer_subscriptions s
        join public.caterers c on c.id = s.caterer_id
        join public.users u on u.id = c.user_id
        where u.auth_user_id = auth.uid()
          and c.is_suspended = false
          and s.status = 'active'
          and s.expires_at > now()
    );
$$;

revoke all on function public.caterer_has_active_subscription_for_auth_user() from public, anon;
grant execute on function public.caterer_has_active_subscription_for_auth_user() to authenticated;

drop policy if exists packages_owner_insert on public.packages;
create policy packages_owner_insert on public.packages
for insert to authenticated
with check (
    caterer_id = (select caterer_id from public.get_my_profile())
    and public.caterer_has_active_subscription_for_auth_user()
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
    and public.caterer_has_active_subscription_for_auth_user()
    and not exists (
        select 1 from public.caterers c
        where c.id = packages.caterer_id and c.is_suspended
    )
)
with check (
    caterer_id = (select caterer_id from public.get_my_profile())
    and public.caterer_has_active_subscription_for_auth_user()
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
    and public.caterer_has_active_subscription_for_auth_user()
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
      and public.caterer_has_active_subscription_for_auth_user()
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
      and public.caterer_has_active_subscription_for_auth_user()
      and c.is_suspended = false
));

drop policy if exists package_images_storage_insert on storage.objects;
create policy package_images_storage_insert on storage.objects
for insert to authenticated
with check (
    bucket_id = 'package-images'
    and (storage.foldername(name))[1] = (select caterer_id from public.get_my_profile())::text
    and public.caterer_has_active_subscription_for_auth_user()
    and exists (
        select 1 from public.caterers c
        where c.id = (select caterer_id from public.get_my_profile())
          and c.is_suspended = false
    )
);

drop policy if exists package_images_storage_delete on storage.objects;
create policy package_images_storage_delete on storage.objects
for delete to authenticated
using (
    bucket_id = 'package-images'
    and (storage.foldername(name))[1] = (select caterer_id from public.get_my_profile())::text
    and public.caterer_has_active_subscription_for_auth_user()
    and exists (
        select 1 from public.caterers c
        where c.id = (select caterer_id from public.get_my_profile())
          and c.is_suspended = false
    )
);

drop policy if exists ai_generated_images_select_own on public.ai_generated_images;
create policy ai_generated_images_select_own on public.ai_generated_images
for select to authenticated
using (
    user_id = auth.uid()
    and public.caterer_has_active_subscription_for_auth_user()
);

drop policy if exists ai_generated_images_delete_own on public.ai_generated_images;
create policy ai_generated_images_delete_own on public.ai_generated_images
for delete to authenticated
using (
    user_id = auth.uid()
    and public.caterer_has_active_subscription_for_auth_user()
);

notify pgrst, 'reload schema';
