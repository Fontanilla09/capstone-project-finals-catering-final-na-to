-- Caterer-managed GCash QR payments with receipt review.
-- Run after supabase_auth_migration.sql and supabase_schema.sql.

alter table public.caterers
    add column if not exists gcash_qr_code text;

grant update (gcash_qr_code) on public.caterers to authenticated;

alter table public.payments
    add column if not exists review_note text;

alter table public.payments
    drop constraint if exists payments_payment_method_check;

alter table public.payments
    add constraint payments_payment_method_check
    check (payment_method in ('e-wallet', 'cash', 'card', 'paypal', 'gcash'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'caterer-gcash-qr',
    'caterer-gcash-qr',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'gcash-payment-receipts',
    'gcash-payment-receipts',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_upload_gcash_payment_receipt(object_name text)
returns boolean
language sql
stable
security definer set search_path = public, storage
as $$
    select auth.uid() is not null
       and (storage.foldername(object_name))[1] = auth.uid()::text
       and (storage.foldername(object_name))[2] is not null
       and exists (
            select 1
            from public.reservations r
            join public.customers c on c.id = r.customer_id
            join public.users u on u.id = c.user_id
            where r.id::text = (storage.foldername(object_name))[2]
              and u.auth_user_id = auth.uid()
              and u.role = 'customer'
       );
$$;

create or replace function public.can_access_gcash_payment_receipt(object_name text)
returns boolean
language sql
stable
security definer set search_path = public, storage
as $$
    select auth.uid() is not null
       and (
           (
               (storage.foldername(object_name))[1] = auth.uid()::text
               and exists (
                    select 1
                    from public.reservations r
                    join public.customers c on c.id = r.customer_id
                    join public.users u on u.id = c.user_id
                    where r.id::text = (storage.foldername(object_name))[2]
                      and u.auth_user_id = auth.uid()
                      and u.role = 'customer'
               )
           )
           or exists (
                select 1
                from public.payments pay
                join public.reservations r on r.id = pay.reservation_id
                join public.caterers ca on ca.id = r.caterer_id
                join public.users u on u.id = ca.user_id
                where pay.receipt_image = object_name
                  and u.auth_user_id = auth.uid()
                  and u.role = 'caterer'
           )
       );
$$;

create or replace function public.can_delete_unsubmitted_gcash_payment_receipt(object_name text)
returns boolean
language sql
stable
security definer set search_path = public, storage
as $$
    select auth.uid() is not null
       and (storage.foldername(object_name))[1] = auth.uid()::text
       and exists (
            select 1
            from public.reservations r
            join public.customers c on c.id = r.customer_id
            join public.users u on u.id = c.user_id
            where r.id::text = (storage.foldername(object_name))[2]
              and u.auth_user_id = auth.uid()
              and u.role = 'customer'
       )
       and not exists (
            select 1 from public.payments pay
            where pay.receipt_image = object_name
       );
$$;

revoke all on function public.can_upload_gcash_payment_receipt(text) from public;
grant execute on function public.can_upload_gcash_payment_receipt(text) to authenticated;
revoke all on function public.can_access_gcash_payment_receipt(text) from public;
grant execute on function public.can_access_gcash_payment_receipt(text) to authenticated;
revoke all on function public.can_delete_unsubmitted_gcash_payment_receipt(text) from public;
grant execute on function public.can_delete_unsubmitted_gcash_payment_receipt(text) to authenticated;

drop policy if exists caterer_gcash_qr_insert_own on storage.objects;
create policy caterer_gcash_qr_insert_own on storage.objects
for insert to authenticated
with check (
    bucket_id = 'caterer-gcash-qr'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
        select 1 from public.caterers c
        join public.users u on u.id = c.user_id
        where u.auth_user_id = auth.uid()
          and u.role = 'caterer'
          and c.id::text = (storage.foldername(name))[2]
    )
);

drop policy if exists caterer_gcash_qr_delete_own on storage.objects;
create policy caterer_gcash_qr_delete_own on storage.objects
for delete to authenticated
using (
    bucket_id = 'caterer-gcash-qr'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists gcash_receipts_insert_own on storage.objects;
create policy gcash_receipts_insert_own on storage.objects
for insert to authenticated
with check (
    bucket_id = 'gcash-payment-receipts'
    and public.can_upload_gcash_payment_receipt(name)
);

drop policy if exists gcash_receipts_select_participants on storage.objects;
create policy gcash_receipts_select_participants on storage.objects
for select to authenticated
using (
    bucket_id = 'gcash-payment-receipts'
    and public.can_access_gcash_payment_receipt(name)
);

drop policy if exists gcash_receipts_delete_own on storage.objects;
create policy gcash_receipts_delete_own on storage.objects
for delete to authenticated
using (
    bucket_id = 'gcash-payment-receipts'
    and public.can_delete_unsubmitted_gcash_payment_receipt(name)
);

create or replace function public.get_my_gcash_payment_options()
returns table (
    reservation_id bigint,
    package_name varchar,
    business_name varchar,
    event_date date,
    reservation_status varchar,
    payment_status varchar,
    total_amount numeric,
    paid_amount numeric,
    gcash_qr_code text,
    payment_type varchar,
    amount numeric,
    latest_submission_status varchar,
    latest_submission_note text
)
language plpgsql
stable
security definer set search_path = public
as $$
declare
    current_customer_id bigint;
begin
    select c.id
    into current_customer_id
    from public.customers c
    join public.users u on u.id = c.user_id
    where u.auth_user_id = auth.uid()
      and u.role = 'customer'
    limit 1;

    if current_customer_id is null then
        raise exception 'Customer access required.';
    end if;

    return query
    select
        r.id,
        p.package_name,
        ca.business_name,
        r.event_date,
        r.reservation_status,
        r.payment_status,
        r.total_amount,
        coalesce((
            select sum(pay.amount)
            from public.payments pay
            where pay.reservation_id = r.id
              and pay.payment_status = 'completed'
        ), 0),
        ca.gcash_qr_code,
        candidate.payment_type,
        candidate.amount,
        latest.payment_status,
        latest.review_note
    from public.reservations r
    join public.packages p on p.id = r.package_id
    join public.caterers ca on ca.id = r.caterer_id
    cross join lateral (
        select 'down_payment'::varchar as payment_type,
               coalesce(nullif(r.advance_payment, 0), round(r.total_amount * 0.30, 2)) as amount
        where r.reservation_status = 'pending'
          and r.payment_status = 'pending'
        union all
        select 'balance'::varchar,
               greatest(r.total_amount - coalesce((
                   select sum(pay.amount)
                   from public.payments pay
                   where pay.reservation_id = r.id
                     and pay.payment_status = 'completed'
               ), 0), 0)
        where r.reservation_status = 'confirmed'
          and r.payment_status = 'partial'
    ) candidate
    left join lateral (
        select pay.payment_status, pay.review_note
        from public.payments pay
        where pay.reservation_id = r.id
          and pay.payment_type = candidate.payment_type
          and pay.payment_method = 'gcash'
        order by pay.created_at desc
        limit 1
    ) latest on true
    where r.customer_id = current_customer_id
      and ca.gcash_qr_code is not null
      and candidate.amount > 0
      and coalesce(latest.payment_status, 'failed') <> 'completed'
    order by r.created_at desc;
end;
$$;

create or replace function public.submit_gcash_payment(
    p_reservation_id bigint,
    p_payment_type varchar,
    p_receipt_path text
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
    current_customer_id bigint;
    booking public.reservations%rowtype;
    expected_amount numeric(10,2);
    payment_id bigint;
begin
    select c.id
    into current_customer_id
    from public.customers c
    join public.users u on u.id = c.user_id
    where u.auth_user_id = auth.uid()
      and u.role = 'customer'
    limit 1;

    if current_customer_id is null then
        raise exception 'Customer access required.';
    end if;
    if p_payment_type is null or p_payment_type not in ('down_payment', 'balance') then
        raise exception 'Invalid payment type.';
    end if;
    if p_receipt_path !~ ('^' || auth.uid()::text || '/' || p_reservation_id::text || '/[A-Za-z0-9._-]+$') then
        raise exception 'Invalid payment receipt path.';
    end if;
    if not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'gcash-payment-receipts'
          and o.name = p_receipt_path
    ) then
        raise exception 'Upload the GCash receipt before submitting it.';
    end if;

    select *
    into booking
    from public.reservations r
    where r.id = p_reservation_id
      and r.customer_id = current_customer_id
    for update;
    if not found then
        raise exception 'Booking not found.';
    end if;
    if not exists (
        select 1 from public.caterers ca
        where ca.id = booking.caterer_id
          and ca.gcash_qr_code is not null
    ) then
        raise exception 'This caterer has not added a GCash QR code.';
    end if;

    if p_payment_type = 'down_payment' then
        if booking.reservation_status <> 'pending' or booking.payment_status <> 'pending' then
            raise exception 'The down payment is not available for this booking.';
        end if;
        expected_amount := coalesce(nullif(booking.advance_payment, 0), round(booking.total_amount * 0.30, 2));
    else
        if booking.reservation_status <> 'confirmed' or booking.payment_status <> 'partial' then
            raise exception 'The balance is not available for this booking.';
        end if;
        select greatest(booking.total_amount - coalesce(sum(pay.amount), 0), 0)
        into expected_amount
        from public.payments pay
        where pay.reservation_id = booking.id
          and pay.payment_status = 'completed';
    end if;

    if expected_amount <= 0 or exists (
        select 1
        from public.payments pay
        where pay.reservation_id = booking.id
          and pay.payment_type = p_payment_type
          and pay.payment_status = 'completed'
    ) then
        raise exception 'This payment has already been completed.';
    end if;
    if exists (
        select 1
        from public.payments pay
        where pay.reservation_id = booking.id
          and pay.payment_type = p_payment_type
          and pay.payment_method = 'gcash'
          and pay.payment_status = 'pending'
    ) then
        raise exception 'A GCash receipt is already waiting for caterer review.';
    end if;

    insert into public.payments (
        reservation_id,
        amount,
        payment_method,
        payment_date,
        receipt_image,
        payment_status,
        provider,
        payment_type,
        payer_name
    )
    select
        booking.id,
        expected_amount,
        'gcash',
        null,
        p_receipt_path,
        'pending',
        'gcash',
        p_payment_type,
        c.full_name
    from public.customers c
    where c.id = current_customer_id
    returning id into payment_id;

    return payment_id;
end;
$$;

create or replace function public.get_caterer_gcash_submissions()
returns table (
    payment_id bigint,
    reservation_id bigint,
    package_name varchar,
    customer_name varchar,
    event_date date,
    payment_type varchar,
    amount numeric,
    receipt_image text,
    submitted_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
    select
        pay.id,
        r.id,
        p.package_name,
        c.full_name,
        r.event_date,
        pay.payment_type,
        pay.amount,
        pay.receipt_image,
        pay.created_at
    from public.payments pay
    join public.reservations r on r.id = pay.reservation_id
    join public.packages p on p.id = r.package_id
    join public.customers c on c.id = r.customer_id
    where r.caterer_id = (select caterer_id from public.get_my_profile())
      and pay.payment_method = 'gcash'
      and pay.payment_status = 'pending'
      and pay.receipt_image is not null
    order by pay.created_at asc;
$$;

create or replace function public.review_gcash_payment(
    p_payment_id bigint,
    p_approve boolean,
    p_review_note text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    payment_row public.payments%rowtype;
    booking public.reservations%rowtype;
begin
    select pay.*
    into payment_row
    from public.payments pay
    join public.reservations r on r.id = pay.reservation_id
    where pay.id = p_payment_id
      and pay.payment_method = 'gcash'
      and pay.payment_status = 'pending'
      and r.caterer_id = (select caterer_id from public.get_my_profile())
    for update of pay;
    if not found then
        raise exception 'This GCash payment is no longer awaiting review.';
    end if;

    select * into booking
    from public.reservations r
    where r.id = payment_row.reservation_id
    for update;
    if not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'gcash-payment-receipts'
          and o.name = payment_row.receipt_image
    ) then
        raise exception 'The GCash receipt image is no longer available.';
    end if;

    if p_approve then
        if payment_row.payment_type = 'down_payment' then
            update public.reservations
            set payment_status = 'partial',
                updated_at = now()
            where id = booking.id
              and reservation_status = 'pending'
              and payment_status = 'pending';
        elsif payment_row.payment_type = 'balance' then
            update public.reservations
            set payment_status = 'completed',
                updated_at = now()
            where id = booking.id
              and reservation_status = 'confirmed'
              and payment_status = 'partial';
        else
            raise exception 'Unsupported GCash payment type.';
        end if;

        if not found then
            raise exception 'The booking status changed before this payment could be confirmed.';
        end if;

        update public.payments
        set payment_status = 'completed',
            payment_date = current_date,
            review_note = null,
            updated_at = now()
        where id = payment_row.id;
    else
        if length(trim(coalesce(p_review_note, ''))) < 5 or length(trim(p_review_note)) > 500 then
            raise exception 'Enter a receipt rejection reason between 5 and 500 characters.';
        end if;
        update public.payments
        set payment_status = 'failed',
            review_note = trim(p_review_note),
            updated_at = now()
        where id = payment_row.id;
    end if;
end;
$$;

revoke all on function public.get_my_gcash_payment_options() from public;
grant execute on function public.get_my_gcash_payment_options() to authenticated;
revoke all on function public.submit_gcash_payment(bigint, varchar, text) from public;
grant execute on function public.submit_gcash_payment(bigint, varchar, text) to authenticated;
revoke all on function public.get_caterer_gcash_submissions() from public;
grant execute on function public.get_caterer_gcash_submissions() to authenticated;
revoke all on function public.review_gcash_payment(bigint, boolean, text) from public;
grant execute on function public.review_gcash_payment(bigint, boolean, text) to authenticated;
