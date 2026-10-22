-- Report admin earnings from paid CaterAI subscriptions.
-- Run after supabase_admin_migration.sql and supabase_paymongo_subscriptions_migration.sql.

create or replace function public.get_admin_subscription_earnings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    result jsonb;
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    select jsonb_build_object(
        'subscription_earnings',
        coalesce(sum(s.amount), 0)::numeric / 100,
        'paid_subscriptions',
        count(*)
    )
    into result
    from public.caterer_subscriptions s
    where s.status in ('active', 'expired');

    return result;
end;
$$;

revoke all on function public.get_admin_subscription_earnings() from public, anon;
grant execute on function public.get_admin_subscription_earnings() to authenticated;
