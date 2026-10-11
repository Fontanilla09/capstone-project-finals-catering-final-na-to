-- Customer help and booking issue submissions.
-- Run after supabase_customer_reports_migration.sql and supabase_customer_dashboard_migration.sql.

alter table public.customer_reports
    add column if not exists reservation_id bigint
        references public.reservations(id) on delete set null;

create index if not exists idx_customer_reports_reservation
    on public.customer_reports(reservation_id);

create or replace function public.get_my_support_bookings()
returns table (
    reservation_id bigint,
    package_name varchar,
    caterer_name varchar,
    event_date date,
    reservation_status varchar
)
language sql
stable
security definer set search_path = public
as $$
    select
        reservation.id,
        package.package_name,
        caterer.business_name,
        reservation.event_date,
        reservation.reservation_status
    from public.reservations reservation
    join public.customers customer on customer.id = reservation.customer_id
    join public.users account on account.id = customer.user_id
    join public.packages package on package.id = reservation.package_id
    join public.caterers caterer on caterer.id = reservation.caterer_id
    where account.auth_user_id = auth.uid()
      and account.role = 'customer'
    order by reservation.created_at desc;
$$;

create or replace function public.submit_customer_booking_issue(
    p_reservation_id bigint,
    p_reason text,
    p_details text
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
    customer_row public.customers%rowtype;
    account_email varchar(100);
    package_row public.packages%rowtype;
    caterer_row public.caterers%rowtype;
    report_id bigint;
    reason_text text;
    details_text text;
begin
    reason_text := nullif(trim(coalesce(p_reason, '')), '');
    details_text := trim(coalesce(p_details, ''));

    if reason_text is null or length(reason_text) > 80 then
        raise exception 'Select a valid booking issue type.';
    end if;
    if char_length(details_text) < 10 or char_length(details_text) > 2000 then
        raise exception 'Issue details must be between 10 and 2000 characters.';
    end if;

    select customer.*
    into customer_row
    from public.customers customer
    join public.users account on account.id = customer.user_id
    where account.auth_user_id = auth.uid()
      and account.role = 'customer'
    limit 1;
    if customer_row.id is null then
        raise exception 'Customer access required.';
    end if;

    select account.email
    into account_email
    from public.users account
    where account.id = customer_row.user_id;

    select package.*
    into package_row
    from public.reservations reservation
    join public.packages package on package.id = reservation.package_id
    where reservation.id = p_reservation_id
      and reservation.customer_id = customer_row.id;
    if package_row.id is null then
        raise exception 'Choose one of your own bookings.';
    end if;

    select caterer.*
    into caterer_row
    from public.reservations reservation
    join public.caterers caterer on caterer.id = reservation.caterer_id
    where reservation.id = p_reservation_id
      and reservation.customer_id = customer_row.id;
    if caterer_row.id is null then
        raise exception 'Choose one of your own bookings.';
    end if;

    insert into public.customer_reports (
        customer_id,
        reporter_name,
        reporter_email,
        target_type,
        target_name,
        caterer_id,
        package_id,
        reservation_id,
        reason,
        details
    )
    values (
        customer_row.id,
        customer_row.full_name,
        account_email,
        'package',
        package_row.package_name,
        caterer_row.id,
        package_row.id,
        p_reservation_id,
        'Booking issue: ' || reason_text,
        details_text
    )
    returning id into report_id;

    return report_id;
end;
$$;

revoke all on function public.get_my_support_bookings() from public;
grant execute on function public.get_my_support_bookings() to authenticated;
revoke all on function public.submit_customer_booking_issue(bigint, text, text) from public;
grant execute on function public.submit_customer_booking_issue(bigint, text, text) to authenticated;

grant select (reservation_id) on public.customer_reports to authenticated;
