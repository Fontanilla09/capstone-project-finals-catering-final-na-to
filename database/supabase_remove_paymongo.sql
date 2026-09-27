-- Remove legacy PayMongo fields now that CaterAI uses PayPal only.
alter table public.reservations
    drop column if exists paymongo_checkout_session_id,
    drop column if exists paymongo_payment_intent_id,
    drop column if exists paymongo_payment_id,
    drop column if exists webhook_received_at;

drop index if exists public.idx_paymongo_session;
drop index if exists public.idx_paymongo_payment;

alter table public.payments
    alter column provider set default 'paypal';

update public.payments
set provider = 'paypal'
where provider is null or provider = 'paymongo';