-- Customer directory for the admin workspace.
-- Run after supabase_admin_migration.sql and supabase_account_rejection_migration.sql.

drop function if exists public.get_admin_customers();

create or replace function public.get_admin_customers()
returns table (
    customer_id bigint,
    email varchar,
    full_name varchar,
    phone varchar,
    address text,
    city varchar,
    is_verified boolean,
    rejection_reason text,
    created_at timestamptz,
    total_bookings bigint,
    total_spent numeric
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
    select
        c.id,
        u.email,
        c.full_name,
        c.phone,
        c.address,
        c.city,
        c.is_verified,
        c.rejection_reason,
        c.created_at,
        count(distinct r.id) filter (where r.reservation_status <> 'cancelled'),
        coalesce(sum(p.amount), 0)
    from public.customers c
    join public.users u on u.id = c.user_id
    left join public.reservations r on r.customer_id = c.id
    left join public.payments p on p.reservation_id = r.id and p.payment_status = 'completed'
    group by c.id, u.email;
end;
$$;

revoke all on function public.get_admin_customers() from public;
grant execute on function public.get_admin_customers() to authenticated;
