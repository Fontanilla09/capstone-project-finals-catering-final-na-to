-- Admin dashboard overview and account verification
-- Run after supabase_admin_setup.sql.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
    select exists (
        select 1 from public.users
        where auth_user_id = auth.uid() and role = 'admin'
    );
$$;

create or replace function public.get_admin_overview()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
    result jsonb;
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    select jsonb_build_object(
        'stats', jsonb_build_object(
            'customers', (select count(*) from public.customers),
            'caterers', (select count(*) from public.caterers),
            'verified', (select count(*) from public.caterers where is_verified = true),
            'pending', (select count(*) from public.caterers where verification_submitted = true and is_verified = false),
            'customer_pending', (select count(*) from public.customers where is_verified = false)
        ),
        'analytics', jsonb_build_object(
            'bookings', (select count(*) from public.reservations where reservation_status <> 'cancelled'),
            'revenue', coalesce((select sum(amount) from public.payments where payment_status = 'completed'), 0),
            'completed_payments', (select count(*) from public.payments where payment_status = 'completed'),
            'average_booking', coalesce((select avg(total_amount) from public.reservations where reservation_status <> 'cancelled'), 0),
            'statuses', coalesce((select jsonb_object_agg(reservation_status, status_count) from (
                select reservation_status, count(*) as status_count
                from public.reservations
                group by reservation_status
            ) status_rows), '{}'::jsonb)
        )
    ) into result;

    return result;
end;
$$;

create or replace function public.get_admin_accounts()
returns table (
    id bigint,
    email varchar,
    role varchar,
    created_at timestamptz,
    full_name varchar,
    business_name varchar,
    phone varchar,
    address text,
    city varchar,
    customer_verified boolean,
    caterer_verified boolean,
    business_permit varchar,
    customer_id bigint,
    caterer_id bigint,
    caterer_verification_submitted boolean
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    return query
    select u.id, u.email, u.role, u.created_at,
        c.full_name, ca.business_name,
        coalesce(c.phone, ca.phone), coalesce(c.address, ca.address), coalesce(c.city, ca.city),
        c.is_verified, ca.is_verified, ca.business_permit,
        c.id, ca.id, ca.verification_submitted
    from public.users u
    left join public.customers c on c.user_id = u.id
    left join public.caterers ca on ca.user_id = u.id
    order by u.created_at desc;
end;
$$;

create or replace function public.set_customer_verification(customer_id bigint, approved boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    target_user_id bigint;
    target_auth_user_id uuid;
begin
    if not public.is_admin() then raise exception 'Admin access required'; end if;

    if approved then
        update public.customers
        set is_verified = true,
            updated_at = now()
        where id = customer_id;
        return;
    end if;

    select user_id into target_user_id from public.customers where id = customer_id;
    if target_user_id is null then
        return;
    end if;

    select auth_user_id into target_auth_user_id from public.users where id = target_user_id;

    delete from public.customers where id = customer_id;
    delete from public.users where id = target_user_id;

    if target_auth_user_id is not null then
        delete from auth.users where id = target_auth_user_id;
    end if;
end;
$$;

create or replace function public.set_caterer_verification(caterer_id bigint, approved boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    target_user_id bigint;
    target_auth_user_id uuid;
begin
    if not public.is_admin() then raise exception 'Admin access required'; end if;

    if approved then
        update public.caterers
        set is_verified = true,
            verification_submitted = true,
            updated_at = now()
        where id = caterer_id;
        return;
    end if;

    select user_id into target_user_id from public.caterers where id = caterer_id;
    if target_user_id is null then
        return;
    end if;

    select auth_user_id into target_auth_user_id from public.users where id = target_user_id;

    delete from public.caterers where id = caterer_id;
    delete from public.users where id = target_user_id;

    if target_auth_user_id is not null then
        delete from auth.users where id = target_auth_user_id;
    end if;
end;
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.get_admin_overview() from public;
revoke all on function public.get_admin_accounts() from public;
revoke all on function public.set_customer_verification(bigint, boolean) from public;
revoke all on function public.set_caterer_verification(bigint, boolean) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.get_admin_overview() to authenticated;
grant execute on function public.get_admin_accounts() to authenticated;
grant execute on function public.set_customer_verification(bigint, boolean) to authenticated;
grant execute on function public.set_caterer_verification(bigint, boolean) to authenticated;
