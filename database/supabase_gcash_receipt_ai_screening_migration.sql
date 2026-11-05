-- Require server-side Sightengine screening before a new GCash receipt can be submitted.
-- Run after supabase_gcash_manual_payments_migration.sql and
-- supabase_gcash_receipt_rls_fix_migration.sql.

create table if not exists public.gcash_receipt_ai_checks (
    receipt_path text primary key,
    customer_auth_user_id uuid not null references auth.users(id) on delete cascade,
    reservation_id bigint not null references public.reservations(id) on delete cascade,
    payment_type varchar not null check (payment_type in ('down_payment', 'balance')),
    ai_generated_probability numeric(6,5) not null check (ai_generated_probability between 0 and 1),
    requires_manual_review boolean not null,
    sightengine_request_id text not null,
    checked_at timestamptz not null default now()
);

alter table public.gcash_receipt_ai_checks enable row level security;
revoke all on public.gcash_receipt_ai_checks from public, anon, authenticated;
grant all on public.gcash_receipt_ai_checks to service_role;

create or replace function public.require_gcash_receipt_ai_screening()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    if new.payment_method = 'gcash'
       and new.payment_status = 'pending'
       and new.receipt_image is not null
       and not exists (
            select 1
            from public.gcash_receipt_ai_checks screening
            join public.reservations r on r.id = new.reservation_id
            join public.customers c on c.id = r.customer_id
            join public.users u on u.id = c.user_id
            where screening.receipt_path = new.receipt_image
              and screening.reservation_id = new.reservation_id
              and screening.payment_type = new.payment_type
              and screening.customer_auth_user_id = u.auth_user_id
              and not exists (
                  select 1
                  from public.payments previously_submitted
                  where previously_submitted.receipt_image = screening.receipt_path
              )
       ) then
        raise exception 'Screen the GCash receipt before submitting it.';
    end if;
    return new;
end;
$$;

drop trigger if exists require_gcash_receipt_ai_screening on public.payments;
create trigger require_gcash_receipt_ai_screening
before insert on public.payments
for each row
execute function public.require_gcash_receipt_ai_screening();

drop policy if exists gcash_receipts_insert_own on storage.objects;
revoke all on function public.can_upload_gcash_payment_receipt(text) from public, anon, authenticated;

drop function if exists public.get_caterer_gcash_submissions();
create function public.get_caterer_gcash_submissions()
returns table (
    payment_id bigint,
    reservation_id bigint,
    package_name varchar,
    customer_name varchar,
    event_date date,
    payment_type varchar,
    amount numeric,
    receipt_image text,
    submitted_at timestamptz,
    ai_generated_probability numeric,
    requires_manual_review boolean
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
        pay.created_at,
        screening.ai_generated_probability,
        screening.requires_manual_review
    from public.payments pay
    join public.reservations r on r.id = pay.reservation_id
    join public.packages p on p.id = r.package_id
    join public.customers c on c.id = r.customer_id
    left join public.gcash_receipt_ai_checks screening
      on screening.receipt_path = pay.receipt_image
    where r.caterer_id = (select caterer_id from public.get_my_profile())
      and pay.payment_method = 'gcash'
      and pay.payment_status = 'pending'
      and pay.receipt_image is not null
    order by pay.created_at asc;
$$;

revoke all on function public.get_caterer_gcash_submissions() from public;
grant execute on function public.get_caterer_gcash_submissions() to authenticated;
