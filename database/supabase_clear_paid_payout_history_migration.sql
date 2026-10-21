-- Permanently remove payout history for the specified caterer only.
-- Payments and reservations are not deleted.
do $$
declare
    target_caterer_id bigint;
    matching_caterer_count integer;
    deleted_payout_count integer;
begin
    select count(*), min(id)
    into matching_caterer_count, target_caterer_id
    from public.caterers
    where lower(trim(business_name)) = lower(trim('John paul Fontanilla'));

    if matching_caterer_count <> 1 then
        raise exception 'Expected exactly one caterer named John paul Fontanilla; found %.', matching_caterer_count;
    end if;

    delete from public.payouts
    where caterer_id = target_caterer_id;

    get diagnostics deleted_payout_count = row_count;
    raise notice 'Deleted % payout records for caterer ID %.', deleted_payout_count, target_caterer_id;
end;
$$;
