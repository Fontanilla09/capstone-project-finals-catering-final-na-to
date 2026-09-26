-- Customer dashboard data
-- Run after supabase_auth_migration.sql.

create or replace function public.get_customer_dashboard()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
    customer_profile public.customers%rowtype;
    dashboard jsonb;
begin
    select c.*
    into customer_profile
    from public.customers c
    join public.users u on u.id = c.user_id
    where u.auth_user_id = auth.uid() and u.role = 'customer'
    limit 1;

    if customer_profile.id is null then
        raise exception 'Customer access required';
    end if;

    select jsonb_build_object(
        'customer', jsonb_build_object(
            'id', customer_profile.id,
            'full_name', customer_profile.full_name,
            'email', (select email from public.users where id = customer_profile.user_id),
            'phone', customer_profile.phone
        ),
        'reservations', coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'id', r.id,
                    'package_name', p.package_name,
                    'business_name', ca.business_name,
                    'event_date', to_char(r.event_date, 'YYYY-MM-DD'),
                    'event_time', r.event_time,
                    'guest_count', r.guest_count,
                    'total_amount', r.total_amount,
                    'paid_amount', coalesce(
                        (
                            select coalesce(sum(pay.amount), 0)
                            from public.payments pay
                            where pay.reservation_id = r.id and pay.payment_status = 'completed'
                        ),
                        0
                    ),
                    'reservation_status', r.reservation_status,
                    'review_rating', (
                        select rev.rating
                        from public.reviews rev
                        where rev.reservation_id = r.id
                        order by rev.created_at desc
                        limit 1
                    )
                )
                order by r.created_at desc
            ),
            '[]'::jsonb
        )
    )
    into dashboard
    from public.reservations r
    join public.packages p on p.id = r.package_id
    join public.caterers ca on ca.id = r.caterer_id
    where r.customer_id = customer_profile.id;

    return dashboard;
end;
$$;

revoke all on function public.get_customer_dashboard() from public;
grant execute on function public.get_customer_dashboard() to authenticated;
