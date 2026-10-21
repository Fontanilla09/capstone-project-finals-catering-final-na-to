-- Fix GCash receipt storage policies when related public tables have RLS enabled.
-- Run this in Supabase SQL Editor after the GCash manual-payments migration.

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
