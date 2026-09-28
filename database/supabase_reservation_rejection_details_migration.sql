-- Run after the caterer reservations, customer dashboard, PayPal receipts, and initial rejection migrations.

alter table public.reservations
    add column if not exists rejection_reason text,
    add column if not exists customer_dismissed_at timestamptz;

drop function if exists public.reject_caterer_reservation(bigint);
drop function if exists public.reject_caterer_reservation(bigint, text);

create function public.reject_caterer_reservation(p_reservation_id bigint, p_rejection_reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if length(trim(coalesce(p_rejection_reason, ''))) < 5 or length(trim(p_rejection_reason)) > 500 then
        raise exception 'Enter a rejection reason between 5 and 500 characters.';
    end if;

    update public.reservations
    set reservation_status = 'cancelled',
        rejection_reason = trim(p_rejection_reason),
        updated_at = now()
    where id = p_reservation_id
      and caterer_id = (select caterer_id from public.get_my_profile())
      and reservation_status = 'pending'
      and payment_status = 'pending';

    if not found then
        raise exception 'Only unpaid pending reservations can be rejected.';
    end if;
end;
$$;

revoke all on function public.reject_caterer_reservation(bigint, text) from public;
grant execute on function public.reject_caterer_reservation(bigint, text) to authenticated;

create or replace function public.dismiss_cancelled_reservation(p_reservation_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_customer_id bigint;
begin
    select c.id
    into v_customer_id
    from public.customers c
    join public.users u on u.id = c.user_id
    where u.auth_user_id = auth.uid() and u.role = 'customer'
    limit 1;

    if v_customer_id is null then
        raise exception 'Customer access required.';
    end if;

    update public.reservations
    set customer_dismissed_at = now(),
        updated_at = now()
    where id = p_reservation_id
      and customer_id = v_customer_id
      and reservation_status = 'cancelled'
      and customer_dismissed_at is null;

    if not found then
        raise exception 'This rejected reservation cannot be removed.';
    end if;
end;
$$;

revoke all on function public.dismiss_cancelled_reservation(bigint) from public;
grant execute on function public.dismiss_cancelled_reservation(bigint) to authenticated;

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
                            select sum(pay.amount)
                            from public.payments pay
                            where pay.reservation_id = r.id and pay.payment_status = 'completed'
                        ),
                        0
                    ),
                    'payments', coalesce(
                        (
                            select jsonb_agg(
                                jsonb_build_object(
                                    'amount', pay.amount,
                                    'payment_date', pay.payment_date,
                                    'created_at', pay.created_at,
                                    'transaction_id', pay.external_id,
                                    'order_id', pay.reference_number,
                                    'payment_method', pay.payment_method,
                                    'payment_type', pay.payment_type,
                                    'payer_name', pay.payer_name,
                                    'payer_email', pay.payer_email
                                ) order by pay.created_at desc
                            )
                            from public.payments pay
                            where pay.reservation_id = r.id and pay.payment_status = 'completed'
                        ),
                        '[]'::jsonb
                    ),
                    'reservation_status', r.reservation_status,
                    'rejection_reason', r.rejection_reason,
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
    where r.customer_id = customer_profile.id
      and r.customer_dismissed_at is null;

    return dashboard;
end;
$$;

revoke all on function public.get_customer_dashboard() from public;
grant execute on function public.get_customer_dashboard() to authenticated;