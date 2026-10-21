-- Caterer earnings view
-- Run after supabase_auth_migration.sql and supabase_schema.sql.

create or replace function public.get_caterer_earnings()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
    with current_caterer as (
        select caterer_id from public.get_my_profile()
    ),
    caterer_payouts as (
        select
            po.id,
            po.reservation_id,
            p.package_name,
            r.event_date,
            coalesce(payment.payment_method, 'paypal') as payment_method,
            po.gross_amount,
            po.platform_fee,
            po.caterer_amount,
            po.payout_status,
            po.payout_batch_id,
            po.payout_error,
            po.paid_at,
            po.created_at
        from public.payouts po
        join public.reservations r on r.id = po.reservation_id
        join public.packages p on p.id = r.package_id
        join current_caterer cc on cc.caterer_id = po.caterer_id
        left join public.payments payment on payment.id = po.payment_id
    ),
    caterer_gcash_payments as (
        select
            -pay.id as id,
            pay.reservation_id,
            package.package_name,
            reservation.event_date,
            'gcash'::varchar as payment_method,
            pay.amount as gross_amount,
            0::numeric as platform_fee,
            pay.amount as caterer_amount,
            'paid'::varchar as payout_status,
            null::varchar as payout_batch_id,
            null::text as payout_error,
            pay.updated_at as paid_at,
            pay.created_at
        from public.payments pay
        join public.reservations reservation on reservation.id = pay.reservation_id
        join public.packages package on package.id = reservation.package_id
        join current_caterer cc on cc.caterer_id = reservation.caterer_id
        where pay.payment_method = 'gcash'
          and pay.payment_status = 'completed'
    ),
    caterer_earnings as (
        select * from caterer_payouts
        union all
        select * from caterer_gcash_payments
    )
    select jsonb_build_object(
        'summary', jsonb_build_object(
            'total', coalesce((
                select sum(caterer_amount)
                from caterer_earnings
                where payout_status in ('pending', 'processing', 'paid')
            ), 0),
            'paid', coalesce((select sum(caterer_amount) from caterer_earnings where payout_status = 'paid'), 0),
            'pending', coalesce((select sum(caterer_amount) from caterer_earnings where payout_status in ('pending', 'processing')), 0)
        ),
        'payouts', coalesce((
            select jsonb_agg(to_jsonb(row) - 'created_at' order by row.created_at desc)
            from caterer_earnings row
        ), '[]'::jsonb)
    );
$$;

revoke all on function public.get_caterer_earnings() from public;
grant execute on function public.get_caterer_earnings() to authenticated;