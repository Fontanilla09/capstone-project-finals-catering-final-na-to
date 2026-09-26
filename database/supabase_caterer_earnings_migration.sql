-- Caterer earnings view
-- Run after supabase_auth_migration.sql and supabase_schema.sql.

create or replace function public.get_caterer_earnings()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
    with current_caterer as (
        select caterer_id
        from public.get_my_profile()
    ),
    paypal_payments as (
        select
            pay.id,
            pay.reservation_id,
            p.package_name,
            r.event_date,
            pay.amount as gross_amount,
            0::numeric as platform_fee,
            pay.amount as caterer_amount,
            pay.payment_status as payout_status,
            pay.payment_date as paid_at,
            pay.created_at
        from public.payments pay
        join public.reservations r on r.id = pay.reservation_id
        join public.packages p on p.id = r.package_id
        join current_caterer cc on cc.caterer_id = r.caterer_id
        where pay.provider = 'paypal'
    )
    select jsonb_build_object(
        'summary', jsonb_build_object(
            'total', coalesce((select sum(gross_amount) from paypal_payments), 0),
            'paid', coalesce((select sum(gross_amount) from paypal_payments where payout_status = 'completed'), 0),
            'pending', 0
        ),
        'payouts', coalesce((
            select jsonb_agg(to_jsonb(row) - 'created_at' order by row.created_at desc)
            from paypal_payments row
        ), '[]'::jsonb)
    );
$$;

revoke all on function public.get_caterer_earnings() from public;
grant execute on function public.get_caterer_earnings() to authenticated;