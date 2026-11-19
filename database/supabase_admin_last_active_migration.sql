-- Track and display last-active timestamps for admin accounts.
-- Run after supabase_user_activity_migration.sql and supabase_business_permit_expiry_migration.sql.

update public.users u
set last_active_at = au.last_sign_in_at
from auth.users au
where au.id = u.auth_user_id
  and u.role = 'admin'
  and u.last_active_at is null
  and au.last_sign_in_at is not null;

create or replace function public.record_my_activity()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not exists (
        select 1
        from public.users
        where auth_user_id = auth.uid()
          and role in ('customer', 'caterer', 'admin')
    ) then
        raise exception 'Account access required';
    end if;

    update public.users
    set last_active_at = now()
    where auth_user_id = auth.uid()
      and role in ('customer', 'caterer', 'admin')
      and (last_active_at is null or last_active_at <= now() - interval '1 minute');
end;
$$;

drop function if exists public.get_admin_accounts();
create function public.get_admin_accounts()
returns table (
    id bigint,
    email varchar,
    role varchar,
    created_at timestamptz,
    last_active_at timestamptz,
    full_name varchar,
    business_name varchar,
    phone varchar,
    address text,
    city varchar,
    paypal_email varchar,
    customer_verified boolean,
    caterer_verified boolean,
    business_permit varchar,
    business_permit_expiry date,
    business_permit_verified boolean,
    business_permit_reviewed_at timestamptz,
    business_permit_submitted_at timestamptz,
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
    select u.id, u.email, u.role, u.created_at, u.last_active_at,
        c.full_name, ca.business_name,
        coalesce(c.phone, ca.phone), coalesce(c.address, ca.address), coalesce(c.city, ca.city),
        ca.paypal_email,
        c.is_verified, ca.is_verified, ca.business_permit,
        ca.business_permit_expiry, ca.business_permit_verified,
        ca.business_permit_reviewed_at, ca.business_permit_submitted_at,
        c.id, ca.id, ca.verification_submitted,
        coalesce(c.rejection_reason, ca.rejection_reason)
    from public.users u
    left join public.customers c on c.user_id = u.id
    left join public.caterers ca on ca.user_id = u.id
    order by u.created_at desc;
end;
$$;

revoke all on function public.record_my_activity() from public, anon;
revoke all on function public.get_admin_accounts() from public, anon;
grant execute on function public.record_my_activity() to authenticated;
grant execute on function public.get_admin_accounts() to authenticated;

notify pgrst, 'reload schema';
