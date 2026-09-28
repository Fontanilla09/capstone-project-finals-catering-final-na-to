-- Run before using balance payments on databases created with the old payout schema.

alter table public.payouts
    drop constraint if exists payouts_reservation_id_key;

alter table public.payouts
    add constraint payouts_payment_id_key unique (payment_id);
