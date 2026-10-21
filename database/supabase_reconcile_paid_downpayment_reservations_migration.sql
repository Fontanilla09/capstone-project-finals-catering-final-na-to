-- Make existing pending bookings visible when their down payment was already saved as completed.
update public.reservations r
set payment_status = 'partial',
    updated_at = now()
where r.reservation_status = 'pending'
  and r.payment_status = 'pending'
  and r.advance_payment > 0
  and exists (
      select 1
      from public.payments p
      where p.reservation_id = r.id
        and p.payment_type = 'down_payment'
        and p.payment_status = 'completed'
        and p.amount = r.advance_payment
  );
