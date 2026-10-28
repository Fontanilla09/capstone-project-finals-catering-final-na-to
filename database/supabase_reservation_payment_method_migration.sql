-- Backfill the selected payment method for reservations created before it was saved.
-- Run after supabase_reservation_end_time_migration.sql.

alter table public.reservations
    add column if not exists booking_payment_method varchar(20);

update public.reservations r
set booking_payment_method = (
    select pay.payment_method
    from public.payments pay
    where pay.reservation_id = r.id
    order by
        case pay.payment_status
            when 'completed' then 0
            when 'pending' then 1
            else 2
        end,
        pay.created_at asc,
        pay.id asc
    limit 1
)
where r.booking_payment_method is null
  and exists (
      select 1
      from public.payments pay
      where pay.reservation_id = r.id
  );
