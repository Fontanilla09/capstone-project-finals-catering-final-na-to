-- Add end times to customer bookings and expose them in customer and caterer dashboards.
-- Run after the current customer dashboard and caterer reservation migrations.

alter table public.reservations
    add column if not exists event_end_time time;

alter table public.reservations
    add column if not exists venue_name text,
    add column if not exists venue_address text,
    add column if not exists venue_city varchar(100),
    add column if not exists venue_barangay varchar(100),
    add column if not exists venue_postal varchar(20),
    add column if not exists venue_street text,
    add column if not exists booking_payment_method varchar(20);

alter table public.reservations
    drop constraint if exists reservations_event_time_range_check;

alter table public.reservations
    add constraint reservations_event_time_range_check
    check (event_end_time is null or (event_time is not null and event_end_time > event_time));

drop function if exists public.get_caterer_reservations();

create function public.get_caterer_reservations()
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
      and not (r.reservation_status = 'pending' and r.payment_status = 'pending')
    order by r.event_date asc, r.created_at desc;
$$;

revoke all on function public.get_caterer_reservations() from public;
grant execute on function public.get_caterer_reservations() to authenticated;

create or replace function public.get_customer_dashboard()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
    customer_profile public.customers%rowtype;
    dashboard jsonb;
begin
    select c.*
    into customer_profile
    from public.customers c
    join public.users u on u.id = c.user_id
    where u.auth_user_id = auth.uid() and u.role = 'customer'
    limit 1;

    if customer_profile.id is null then
        raise exception 'Customer access required';
    end if;

    select jsonb_build_object(
        'customer', jsonb_build_object(
            'id', customer_profile.id,
            'full_name', customer_profile.full_name,
            'email', (select email from public.users where id = customer_profile.user_id),
            'phone', customer_profile.phone
        ),
        'reservations', coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'id', r.id,
                    'package_id', r.package_id,
                    'caterer_id', r.caterer_id,
                    'package_name', p.package_name,
                    'business_name', ca.business_name,
                    'event_date', to_char(r.event_date, 'YYYY-MM-DD'),
                    'event_time', r.event_time,
                    'event_end_time', r.event_end_time,
                    'event_type', r.event_type,
                    'venue_name', r.venue_name,
                    'venue_address', r.venue_address,
                    'venue_city', r.venue_city,
                    'venue_barangay', r.venue_barangay,
                    'venue_postal', r.venue_postal,
                    'venue_street', r.venue_street,
                    'booking_payment_method', r.booking_payment_method,
                    'guest_count', r.guest_count,
                    'total_amount', r.total_amount,
                    'paid_amount', coalesce(
                        (
                            select sum(pay.amount)
                            from public.payments pay
                            where pay.reservation_id = r.id and pay.payment_status = 'completed'
                        ),
                        0
                    ),
                    'payments', coalesce(
                        (
                            select jsonb_agg(
                                jsonb_build_object(
                                    'amount', pay.amount,
                                    'payment_date', pay.payment_date,
                                    'created_at', pay.created_at,
                                    'transaction_id', pay.external_id,
                                    'order_id', pay.reference_number,
                                    'payment_method', pay.payment_method,
                                    'payment_type', pay.payment_type,
                                    'payer_name', pay.payer_name,
                                    'payer_email', pay.payer_email,
                                    'payee_email', pay.payee_email
                                ) order by pay.created_at desc
                            )
                            from public.payments pay
                            where pay.reservation_id = r.id and pay.payment_status = 'completed'
                        ),
                        '[]'::jsonb
                    ),
                    'reservation_status', r.reservation_status,
                    'rejection_reason', r.rejection_reason,
                    'review_rating', (
                        select rev.rating
                        from public.reviews rev
                        where rev.reservation_id = r.id
                        order by rev.created_at desc
                        limit 1
                    )
                )
                order by r.created_at desc
            ),
            '[]'::jsonb
        )
    )
    into dashboard
    from public.reservations r
    join public.packages p on p.id = r.package_id
    join public.caterers ca on ca.id = r.caterer_id
    where r.customer_id = customer_profile.id
      and r.customer_dismissed_at is null;

    return dashboard;
end;
$$;

revoke all on function public.get_customer_dashboard() from public;
grant execute on function public.get_customer_dashboard() to authenticated;
