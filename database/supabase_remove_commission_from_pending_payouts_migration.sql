-- Remove the former 2.5% platform commission from payouts not yet sent.
-- Processing and paid payout records are intentionally unchanged.
update public.payouts
set platform_fee = 0,
    caterer_amount = gross_amount
where payout_status = 'pending';
