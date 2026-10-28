-- Report admin earnings from paid CaterAI subscriptions, not booking commissions.
-- Run after supabase_admin_migration.sql and supabase_paymongo_subscriptions_migration.sql.

create or replace function public.get_admin_overview()
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
        'stats', jsonb_build_object(
            'customers', (select count(*) from public.customers),
            'caterers', (select count(*) from public.caterers),
            'verified', (select count(*) from public.caterers where is_verified = true),
            'pending', (select count(*) from public.caterers where is_verified = false),
            'customer_pending', (select count(*) from public.customers where is_verified = false)
        ),
        'analytics', jsonb_build_object(
            'bookings', (select count(*) from public.reservations where reservation_status <> 'cancelled'),
            'statuses', coalesce((select jsonb_object_agg(reservation_status, status_count) from (
                select reservation_status, count(*) as status_count
                from public.reservations
                group by reservation_status
            ) status_rows), '{}'::jsonb)
        )
    ) into result;

    return result;
end;
$$;

revoke all on function public.get_admin_overview() from public;
grant execute on function public.get_admin_overview() to authenticated;

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
        count(*),
        'monthly_earnings',
        coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'month', to_char(months.month_start, 'Mon'),
                    'amount', coalesce(month_totals.amount, 0),
                    'subscribers', coalesce(month_totals.subscribers, 0)
                )
                order by months.month_start
            )
            from generate_series(
                date_trunc('month', now()) - interval '5 months',
                date_trunc('month', now()),
                interval '1 month'
            ) as months(month_start)
            left join (
                select date_trunc('month', paid.started_at) as month_start,
                    sum(paid.amount)::numeric / 100 as amount,
                    count(*) as subscribers
                from public.caterer_subscriptions paid
                where paid.status in ('active', 'expired')
                  and paid.started_at >= date_trunc('month', now()) - interval '5 months'
                group by date_trunc('month', paid.started_at)
            ) month_totals on month_totals.month_start = months.month_start
        ), '[]'::jsonb)
    )
    into result
    from public.caterer_subscriptions s
    where s.status in ('active', 'expired');

    return result;
end;
$$;

revoke all on function public.get_admin_subscription_earnings() from public, anon;
grant execute on function public.get_admin_subscription_earnings() to authenticated;
