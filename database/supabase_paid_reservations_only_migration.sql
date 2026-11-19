-- Unpaid checkout attempts are not active reservations. A down payment must
-- be recorded before a reservation appears to caterers or holds the event date.
-- Run after supabase_show_unpaid_caterer_reservations_migration.sql and
-- supabase_caterer_date_booking_migration.sql.

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
      and r.payment_status <> 'pending'
    order by r.event_date asc, r.created_at desc;
$$;

revoke all on function public.get_caterer_reservations() from public;
grant execute on function public.get_caterer_reservations() to authenticated;

create or replace function public.enforce_single_active_caterer_booking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    if new.reservation_status in ('pending', 'confirmed')
       and new.payment_status <> 'pending' then
        perform pg_advisory_xact_lock(new.caterer_id);

        if exists (
            select 1
            from public.reservations existing
            where existing.caterer_id = new.caterer_id
              and existing.event_date = new.event_date
              and existing.reservation_status in ('pending', 'confirmed')
              and existing.payment_status <> 'pending'
              and existing.id <> new.id
        ) then
            raise exception using
                errcode = 'P0001',
                message = 'Caterer already has a booking on this date.';
        end if;
    end if;

    return new;
end;
$$;

revoke all on function public.enforce_single_active_caterer_booking() from public;

drop trigger if exists reservations_single_active_caterer_booking on public.reservations;
create trigger reservations_single_active_caterer_booking
before insert or update of caterer_id, event_date, reservation_status, payment_status on public.reservations
for each row
execute function public.enforce_single_active_caterer_booking();

drop index if exists public.reservations_one_active_caterer_booking_per_date;
create unique index reservations_one_active_caterer_booking_per_date
    on public.reservations (caterer_id, event_date)
    where reservation_status in ('pending', 'confirmed')
      and payment_status <> 'pending';

create or replace function public.is_caterer_available_on_date(
    p_caterer_id bigint,
    p_event_date date
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
    select p_caterer_id is not null
       and p_event_date is not null
       and not exists (
           select 1
           from public.reservations r
           where r.caterer_id = p_caterer_id
             and r.event_date = p_event_date
             and r.reservation_status in ('pending', 'confirmed')
             and r.payment_status <> 'pending'
       );
$$;

revoke all on function public.is_caterer_available_on_date(bigint, date) from public;
grant execute on function public.is_caterer_available_on_date(bigint, date) to anon, authenticated;

notify pgrst, 'reload schema';
