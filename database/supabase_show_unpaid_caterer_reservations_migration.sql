-- Show all bookings, including pending bookings without a down payment, to caterers.
-- Run after supabase_reservation_end_time_migration.sql.

create or replace function public.get_caterer_reservations()
returns table (
    id bigint,
    package_name varchar,
    customer_name varchar,
    event_date date,
    event_time time,
    event_end_time time,
    event_type varchar,
    venue_name text,
    venue_address text,
    venue_city varchar,
    venue_barangay varchar,
    venue_postal varchar,
    venue_street text,
    booking_payment_method varchar,
    guest_count integer,
    location text,
    customer_email varchar,
    customer_phone varchar,
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
        r.event_end_time,
        r.event_type,
        r.venue_name,
        r.venue_address,
        r.venue_city,
        r.venue_barangay,
        r.venue_postal,
        r.venue_street,
        r.booking_payment_method,
        r.guest_count,
        r.location,
        u.email,
        c.phone,
        r.payment_status,
        coalesce(nullif(r.advance_payment, 0), round(amounts.total_amount * 0.30, 2)),
        amounts.total_amount,
        case
            when r.payment_status = 'completed' then 0::numeric
            else greatest(
                amounts.total_amount - coalesce(nullif(r.advance_payment, 0), round(amounts.total_amount * 0.30, 2)),
                0
            )
        end,
        r.reservation_status
    from public.reservations r
    join public.packages p on p.id = r.package_id
    join public.customers c on c.id = r.customer_id
    join public.users u on u.id = c.user_id
    cross join lateral (
        select coalesce(nullif(r.total_amount, 0), p.price) as total_amount
    ) amounts
    where r.caterer_id = (select caterer_id from public.get_my_profile())
      and r.caterer_dismissed_at is null
    order by r.event_date asc, r.created_at desc;
$$;

revoke all on function public.get_caterer_reservations() from public;
grant execute on function public.get_caterer_reservations() to authenticated;
