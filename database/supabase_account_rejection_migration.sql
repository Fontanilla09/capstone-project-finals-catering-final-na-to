-- Add admin rejection reasons for customer and caterer account verification.
-- Run after supabase_auth_migration.sql and supabase_admin_migration.sql.

alter table public.customers
    add column if not exists rejection_reason text;

alter table public.caterers
    add column if not exists rejection_reason text;

drop function if exists public.get_admin_accounts();

create function public.get_admin_accounts()
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
    paypal_email varchar,
    customer_verified boolean,
    caterer_verified boolean,
    business_permit varchar,
    customer_id bigint,
    caterer_id bigint,
    caterer_verification_submitted boolean,
    rejection_reason text
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
        ca.paypal_email,
        c.is_verified, ca.is_verified, ca.business_permit,
        c.id, ca.id, ca.verification_submitted,
        coalesce(c.rejection_reason, ca.rejection_reason)
    from public.users u
    left join public.customers c on c.user_id = u.id
    left join public.caterers ca on ca.user_id = u.id
    order by u.created_at desc;
end;
$$;

drop function if exists public.set_customer_verification(bigint, boolean);
drop function if exists public.set_customer_verification(bigint, boolean, text);

create function public.set_customer_verification(
    customer_id bigint,
    approved boolean,
    p_rejection_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    if not approved and (
        p_rejection_reason is null
        or length(btrim(p_rejection_reason)) < 5
        or length(btrim(p_rejection_reason)) > 500
    ) then
        raise exception 'A rejection reason between 5 and 500 characters is required';
    end if;

    update public.customers c
    set is_verified = approved,
        rejection_reason = case when approved then null else btrim(p_rejection_reason) end,
        updated_at = now()
    where c.id = customer_id;

    if not found then
        return;
    end if;

    insert into public.admin_activity_log (admin_user_id, action, details)
    select id,
        case when approved then 'approve_customer' else 'reject_customer' end,
        'Customer profile #' || customer_id
    from public.users
    where auth_user_id = auth.uid();
end;
$$;

drop function if exists public.set_caterer_verification(bigint, boolean);
drop function if exists public.set_caterer_verification(bigint, boolean, text);

create function public.set_caterer_verification(
    caterer_id bigint,
    approved boolean,
    p_rejection_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    if not approved and (
        p_rejection_reason is null
        or length(btrim(p_rejection_reason)) < 5
        or length(btrim(p_rejection_reason)) > 500
    ) then
        raise exception 'A rejection reason between 5 and 500 characters is required';
    end if;

    update public.caterers c
    set is_verified = approved,
        verification_submitted = true,
        rejection_reason = case when approved then null else btrim(p_rejection_reason) end,
        updated_at = now()
    where c.id = caterer_id;

    if not found then
        return;
    end if;

    insert into public.admin_activity_log (admin_user_id, action, details)
    select id,
        case when approved then 'approve_caterer' else 'reject_caterer' end,
        'Caterer profile #' || caterer_id
    from public.users
    where auth_user_id = auth.uid();
end;
$$;

create or replace function public.get_my_rejection_reason()
returns text
language sql
stable
security definer set search_path = public
as $$
    select coalesce(c.rejection_reason, ca.rejection_reason)
    from public.users u
    left join public.customers c on c.user_id = u.id
    left join public.caterers ca on ca.user_id = u.id
    where u.auth_user_id = auth.uid()
    limit 1;
$$;

create or replace function public.save_my_caterer_permit(permit_path varchar)
returns void
language sql
security definer set search_path = public
as $$
    update public.caterers
    set business_permit = permit_path,
        verification_submitted = true,
        rejection_reason = null,
        updated_at = now()
    where user_id = (select user_id from public.get_my_profile());
$$;

revoke all on function public.get_admin_accounts() from public;
revoke all on function public.set_customer_verification(bigint, boolean, text) from public;
revoke all on function public.set_caterer_verification(bigint, boolean, text) from public;
revoke all on function public.get_my_rejection_reason() from public;
revoke all on function public.save_my_caterer_permit(varchar) from public;

grant execute on function public.get_admin_accounts() to authenticated;
grant execute on function public.set_customer_verification(bigint, boolean, text) to authenticated;
grant execute on function public.set_caterer_verification(bigint, boolean, text) to authenticated;
grant execute on function public.get_my_rejection_reason() to authenticated;
grant execute on function public.save_my_caterer_permit(varchar) to authenticated;
