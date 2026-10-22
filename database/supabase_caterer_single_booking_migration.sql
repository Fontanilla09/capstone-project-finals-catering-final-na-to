-- Limit each caterer to one active booking across all of their packages.
-- Pending and confirmed reservations occupy the caterer's capacity.
-- Cancelled and completed reservations do not.

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
              and existing.reservation_status in ('pending', 'confirmed')
              and existing.id <> new.id
        ) then
            raise exception using
                errcode = 'P0001',
                message = 'Caterer already has an active booking.';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists reservations_single_active_caterer_booking on public.reservations;
create trigger reservations_single_active_caterer_booking
before insert or update of caterer_id, reservation_status on public.reservations
for each row execute function public.enforce_single_active_caterer_booking();

create or replace function public.get_unavailable_caterer_ids()
returns table (caterer_id bigint)
language sql
stable
security definer set search_path = public
as $$
    select distinct r.caterer_id
    from public.reservations r
    where r.reservation_status in ('pending', 'confirmed');
$$;

revoke all on function public.get_unavailable_caterer_ids() from public;
grant execute on function public.get_unavailable_caterer_ids() to anon, authenticated;
revoke all on function public.enforce_single_active_caterer_booking() from public;
