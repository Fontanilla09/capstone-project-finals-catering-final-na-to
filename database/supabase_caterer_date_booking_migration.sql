-- Reserve a caterer for a date, rather than blocking all future dates.
-- Pending and confirmed reservations occupy their event date.

create or replace function public.enforce_single_active_caterer_booking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    if new.reservation_status in ('pending', 'confirmed') then
        perform pg_advisory_xact_lock(new.caterer_id);

        if exists (
            select 1
            from public.reservations existing
            where existing.caterer_id = new.caterer_id
              and existing.event_date = new.event_date
              and existing.reservation_status in ('pending', 'confirmed')
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

create unique index if not exists reservations_one_active_caterer_booking_per_date
    on public.reservations (caterer_id, event_date)
    where reservation_status in ('pending', 'confirmed');

drop trigger if exists reservations_single_active_caterer_booking on public.reservations;
create trigger reservations_single_active_caterer_booking
before insert or update of caterer_id, event_date, reservation_status on public.reservations
for each row execute function public.enforce_single_active_caterer_booking();

drop function if exists public.get_unavailable_caterer_ids();

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
       );
$$;

revoke all on function public.is_caterer_available_on_date(bigint, date) from public;
grant execute on function public.is_caterer_available_on_date(bigint, date) to anon, authenticated;
revoke all on function public.enforce_single_active_caterer_booking() from public;
