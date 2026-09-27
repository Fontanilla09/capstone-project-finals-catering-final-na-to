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
            po.gross_amount,
            po.platform_fee,
            po.caterer_amount,
            po.payout_status,
            po.paid_at,
            po.created_at
        from public.payouts po
        join public.reservations r on r.id = po.reservation_id
        join public.packages p on p.id = r.package_id
        join current_caterer cc on cc.caterer_id = po.caterer_id
    )
    select jsonb_build_object(
        'summary', jsonb_build_object(
            'total', coalesce((select sum(caterer_amount) from caterer_payouts), 0),
            'paid', coalesce((select sum(caterer_amount) from caterer_payouts where payout_status = 'paid'), 0),
            'pending', coalesce((select sum(caterer_amount) from caterer_payouts where payout_status in ('pending', 'processing')), 0)
        ),
        'payouts', coalesce((
            select jsonb_agg(to_jsonb(row) - 'created_at' order by row.created_at desc)
            from caterer_payouts row
        ), '[]'::jsonb)
    );
$$;

revoke all on function public.get_caterer_earnings() from public;
grant execute on function public.get_caterer_earnings() to authenticated;