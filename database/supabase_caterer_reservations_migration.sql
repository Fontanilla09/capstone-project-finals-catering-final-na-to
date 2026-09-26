-- Caterer reservation views and actions
-- Run after supabase_auth_migration.sql and supabase_schema.sql.

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
    order by r.event_date asc, r.created_at desc;
$$;

create or replace function public.accept_caterer_reservation(reservation_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    update public.reservations
    set reservation_status = 'confirmed',
        accepted_by = (select user_id from public.get_my_profile()),
        accepted_at = now(),
        updated_at = now()
    where id = reservation_id
      and caterer_id = (select caterer_id from public.get_my_profile())
      and reservation_status = 'pending'
      and payment_status = 'partial';

    if not found then
        raise exception 'Reservation cannot be accepted.';
    end if;
end;
$$;

revoke all on function public.get_caterer_reservations() from public;
grant execute on function public.get_caterer_reservations() to authenticated;
revoke all on function public.accept_caterer_reservation(bigint) from public;
grant execute on function public.accept_caterer_reservation(bigint) to authenticated;