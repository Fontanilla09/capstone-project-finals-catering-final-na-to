-- Expose reservation totals and remaining balances to the caterer dashboard.
-- Run after supabase_caterer_cancelled_booking_migration.sql.

drop function if exists public.get_caterer_reservations();

create function public.get_caterer_reservations()
returns table (
    id bigint,
    package_name varchar,
    customer_name varchar,
    event_date date,
    event_time time,
    guest_count integer,
    location text,
    payment_status varchar,
    advance_payment numeric,
    total_amount numeric,
    balance_amount numeric,
    reservation_status varchar
)
language sql
stable
security definer set search_path = public
as $$
    select
        r.id,
        p.package_name,
        c.full_name,
        r.event_date,
        r.event_time,
        r.guest_count,
        r.location,
        r.payment_status,
        r.advance_payment,
        r.total_amount,
        case
            when r.payment_status = 'completed' then 0::numeric
            else coalesce(r.balance_amount, greatest(r.total_amount - coalesce(r.advance_payment, 0), 0))
        end,
        r.reservation_status
    from public.reservations r
    join public.packages p on p.id = r.package_id
    join public.customers c on c.id = r.customer_id
    where r.caterer_id = (select caterer_id from public.get_my_profile())
      and r.caterer_dismissed_at is null
    order by r.event_date asc, r.created_at desc;
$$;

revoke all on function public.get_caterer_reservations() from public;
grant execute on function public.get_caterer_reservations() to authenticated;
