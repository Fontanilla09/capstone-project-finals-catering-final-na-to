-- Run after supabase_caterer_reservations_migration.sql.

alter table public.reservations
    add column if not exists caterer_dismissed_at timestamptz;

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
        r.reservation_status
    from public.reservations r
    join public.packages p on p.id = r.package_id
    join public.customers c on c.id = r.customer_id
    where r.caterer_id = (select caterer_id from public.get_my_profile())
      and r.caterer_dismissed_at is null
    order by r.event_date asc, r.created_at desc;
$$;

create or replace function public.dismiss_caterer_cancelled_reservation(p_reservation_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    update public.reservations
    set caterer_dismissed_at = now(),
        updated_at = now()
    where id = p_reservation_id
      and caterer_id = (select caterer_id from public.get_my_profile())
      and reservation_status = 'cancelled'
      and payment_status = 'pending'
      and caterer_dismissed_at is null;

    if not found then
        raise exception 'Only unpaid cancelled reservations can be removed.';
    end if;
end;
$$;

revoke all on function public.dismiss_caterer_cancelled_reservation(bigint) from public;
grant execute on function public.dismiss_caterer_cancelled_reservation(bigint) to authenticated;