-- Repair displayed totals for reservations created with a zero total_amount.
-- Run after supabase_caterer_reservation_balance_migration.sql.

with missing_totals as (
    select
        r.id,
        round(coalesce(nullif(r.advance_payment, 0) / 0.30, p.price), 2) as total_amount,
        nullif(r.advance_payment, 0) as advance_payment
    from public.reservations r
    join public.packages p on p.id = r.package_id
    where coalesce(r.total_amount, 0) <= 0
),
repaired_reservations as (
    select
        id,
        total_amount,
        coalesce(advance_payment, round(total_amount * 0.30, 2)) as advance_payment
    from missing_totals
)
update public.reservations r
set total_amount = repaired.total_amount,
    advance_payment = repaired.advance_payment,
    balance_amount = greatest(repaired.total_amount - repaired.advance_payment, 0)
from repaired_reservations repaired
where r.id = repaired.id
  and repaired.total_amount > 0;

drop function if exists public.get_caterer_reservations();

create or replace function public.get_caterer_reservations()
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
    cross join lateral (
        select coalesce(nullif(r.total_amount, 0), p.price) as total_amount
    ) amounts
    where r.caterer_id = (select caterer_id from public.get_my_profile())
      and r.caterer_dismissed_at is null
    order by r.event_date asc, r.created_at desc;
$$;

revoke all on function public.get_caterer_reservations() from public;
grant execute on function public.get_caterer_reservations() to authenticated;
