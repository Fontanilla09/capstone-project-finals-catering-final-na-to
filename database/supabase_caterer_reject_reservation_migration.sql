create or replace function public.reject_caterer_reservation(reservation_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    update public.reservations
    set reservation_status = 'cancelled',
        updated_at = now()
    where id = reservation_id
      and caterer_id = (select caterer_id from public.get_my_profile())
      and reservation_status = 'pending'
      and payment_status = 'pending';

    if not found then
        raise exception 'Only unpaid pending reservations can be rejected.';
    end if;
end;
$$;

revoke all on function public.reject_caterer_reservation(bigint) from public;
grant execute on function public.reject_caterer_reservation(bigint) to authenticated;