-- Allow customers to submit a support request without an existing reservation.
-- Run after supabase_customer_support_migration.sql.

alter table public.customer_reports
    drop constraint if exists customer_reports_target_type_check;

alter table public.customer_reports
    add constraint customer_reports_target_type_check
    check (target_type in ('caterer', 'package', 'support'));

drop policy if exists customer_reports_submit_own on public.customer_reports;
create policy customer_reports_submit_own on public.customer_reports
for insert to authenticated
with check (
    status = 'open'
    and admin_note is null
    and handled_by is null
    and handled_at is null
    and exists (
        select 1
        from public.customers c
        join public.users u on u.id = c.user_id
        where c.id = customer_reports.customer_id
          and u.auth_user_id = auth.uid()
    )
    and (
        (
            target_type = 'support'
            and target_name = 'Customer Support'
            and caterer_id is null
            and package_id is null
            and reservation_id is null
        )
        or (
            target_type = 'caterer'
            and package_id is null
            and exists (select 1 from public.caterers c where c.id = customer_reports.caterer_id)
        )
        or (
            target_type = 'package'
            and exists (
                select 1 from public.packages p
                where p.id = customer_reports.package_id
                  and p.caterer_id = customer_reports.caterer_id
            )
        )
    )
);

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
    report_target_type varchar(20);
    report_target_name varchar(150);
    report_caterer_id bigint;
    report_package_id bigint;
    reason_text text;
    details_text text;
begin
    reason_text := nullif(trim(coalesce(p_reason, '')), '');
    details_text := trim(coalesce(p_details, ''));

    if reason_text is null or length(reason_text) > 80 then
        raise exception 'Select a valid support request type.';
    end if;
    if char_length(details_text) < 10 or char_length(details_text) > 2000 then
        raise exception 'Support details must be between 10 and 2000 characters.';
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

    if p_reservation_id is null then
        report_target_type := 'support';
        report_target_name := 'Customer Support';
    else
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

        report_target_type := 'package';
        report_target_name := package_row.package_name;
        report_caterer_id := caterer_row.id;
        report_package_id := package_row.id;
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
        report_target_type,
        report_target_name,
        report_caterer_id,
        report_package_id,
        p_reservation_id,
        case
            when p_reservation_id is null then 'General support: ' || reason_text
            else 'Booking issue: ' || reason_text
        end,
        details_text
    )
    returning id into report_id;

    return report_id;
end;
$$;

revoke all on function public.submit_customer_booking_issue(bigint, text, text) from public;
grant execute on function public.submit_customer_booking_issue(bigint, text, text) to authenticated;
