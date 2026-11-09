-- Keep GCash down payments aligned with the method selected for the booking.
-- Balance payments remain available through either GCash or PayPal.

create or replace function public.require_gcash_down_payment_booking_method()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    if new.payment_method = 'gcash'
       and new.payment_type = 'down_payment'
       and not exists (
           select 1
           from public.reservations r
           where r.id = new.reservation_id
             and r.booking_payment_method = 'gcash'
       ) then
        raise exception 'GCash is only available for the down payment when selected for the booking.';
    end if;

    return new;
end;
$$;

drop trigger if exists require_gcash_down_payment_booking_method on public.payments;

create trigger require_gcash_down_payment_booking_method
before insert or update on public.payments
for each row
execute function public.require_gcash_down_payment_booking_method();
