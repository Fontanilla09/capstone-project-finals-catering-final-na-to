-- Business permit OCR expiry tracking and access control.
-- Run after supabase_account_rejection_migration.sql,
-- supabase_admin_subscription_monitoring_migration.sql, and
-- supabase_subscription_package_visibility_migration.sql.

alter table public.caterers
    add column if not exists business_permit_expiry date,
    add column if not exists business_permit_verified boolean not null default false,
    add column if not exists business_permit_reviewed_at timestamptz;

create or replace function public.save_my_caterer_permit(permit_path varchar)
returns void
language plpgsql
security definer set search_path = public, storage
as $$
begin
    if permit_path is null
       or coalesce((storage.foldername(permit_path))[1] <> auth.uid()::text, true) then
        raise exception 'Permit path must belong to the signed-in user';
    end if;

    update public.caterers
    set business_permit = permit_path,
        business_permit_expiry = null,
        business_permit_verified = false,
        business_permit_reviewed_at = null,
        verification_submitted = true,
        rejection_reason = null,
        updated_at = now()
    where user_id = (select user_id from public.get_my_profile());
end;
$$;

create or replace function public.save_my_caterer_permit_expiry(p_expiry_date date)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if p_expiry_date is null then
        raise exception 'Enter the expiry date shown on the business permit';
    end if;

    update public.caterers
    set business_permit_expiry = p_expiry_date,
        business_permit_verified = case
            when business_permit_expiry is not distinct from p_expiry_date
                then business_permit_verified
            else false
        end,
        business_permit_reviewed_at = case
            when business_permit_expiry is not distinct from p_expiry_date
                then business_permit_reviewed_at
            else null
        end,
        updated_at = now()
    where user_id = (select user_id from public.get_my_profile())
      and business_permit is not null;

    if not found then
        raise exception 'Upload a business permit before submitting its expiry date';
    end if;
end;
$$;

create or replace function public.review_caterer_permit_expiry(
    p_caterer_id bigint,
    p_approved boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;
    if p_approved is null then
        raise exception 'Choose whether to approve or reject the permit expiry date';
    end if;

    if p_approved and not exists (
        select 1
        from public.caterers c
        where c.id = p_caterer_id
          and c.business_permit is not null
          and c.business_permit_expiry >= (now() at time zone 'Asia/Manila')::date
    ) then
        raise exception 'A permit file with a current expiry date is required for approval';
    end if;

    update public.caterers
    set business_permit_verified = p_approved,
        business_permit_reviewed_at = now(),
        updated_at = now()
    where id = p_caterer_id;

    if not found then
        raise exception 'Caterer not found';
    end if;
end;
$$;

create or replace function public.caterer_has_current_business_permit(p_caterer_id bigint)
returns boolean
language sql
stable
security definer set search_path = public
as $$
    select exists (
        select 1
        from public.caterers c
        where c.id = p_caterer_id
          and c.business_permit is not null
          and c.business_permit_verified = true
          and c.business_permit_expiry >= (now() at time zone 'Asia/Manila')::date
    );
$$;

revoke all on function public.caterer_has_current_business_permit(bigint) from public;
grant execute on function public.caterer_has_current_business_permit(bigint) to anon, authenticated;
revoke all on function public.save_my_caterer_permit(varchar) from public;
grant execute on function public.save_my_caterer_permit(varchar) to authenticated;
revoke all on function public.save_my_caterer_permit_expiry(date) from public;
grant execute on function public.save_my_caterer_permit_expiry(date) to authenticated;
revoke all on function public.review_caterer_permit_expiry(bigint, boolean) from public;
grant execute on function public.review_caterer_permit_expiry(bigint, boolean) to authenticated;

create or replace function public.caterer_is_publicly_listable(p_caterer_id bigint)
returns boolean
language sql
stable
security definer set search_path = public
as $$
    select exists (
        select 1
        from public.caterers c
        join public.caterer_subscriptions s on s.caterer_id = c.id
        where c.id = p_caterer_id
          and c.is_verified = true
          and c.is_suspended = false
          and public.caterer_has_current_business_permit(c.id)
          and s.status = 'active'
          and s.expires_at > now()
    );
$$;

revoke all on function public.caterer_is_publicly_listable(bigint) from public;
grant execute on function public.caterer_is_publicly_listable(bigint) to anon, authenticated;

drop policy if exists caterers_public_verified on public.caterers;
create policy caterers_public_verified on public.caterers
for select to anon, authenticated
using (
    is_verified = true
    and is_suspended = false
    and public.caterer_has_current_business_permit(id)
);

drop policy if exists packages_public_verified_caterers on public.packages;
create policy packages_public_verified_caterers on public.packages
for select to anon, authenticated
using (public.caterer_is_publicly_listable(caterer_id));

drop policy if exists package_images_public on public.package_images;
create policy package_images_public on public.package_images
for select to anon, authenticated
using (exists (
    select 1
    from public.packages p
    where p.id = package_images.package_id
      and public.caterer_is_publicly_listable(p.caterer_id)
));

drop policy if exists packages_owner_insert on public.packages;
create policy packages_owner_insert on public.packages
for insert to authenticated
with check (
    caterer_id = (select caterer_id from public.get_my_profile())
    and public.caterer_has_active_subscription_for_auth_user()
    and not exists (
        select 1 from public.caterers c
        where c.id = packages.caterer_id and c.is_suspended
    )
);

drop policy if exists packages_owner_update on public.packages;
create policy packages_owner_update on public.packages
for update to authenticated
using (
    caterer_id = (select caterer_id from public.get_my_profile())
    and public.caterer_has_active_subscription_for_auth_user()
    and not exists (
        select 1 from public.caterers c
        where c.id = packages.caterer_id and c.is_suspended
    )
)
with check (
    caterer_id = (select caterer_id from public.get_my_profile())
    and public.caterer_has_active_subscription_for_auth_user()
    and not exists (
        select 1 from public.caterers c
        where c.id = packages.caterer_id and c.is_suspended
    )
);

drop policy if exists packages_owner_delete on public.packages;
create policy packages_owner_delete on public.packages
for delete to authenticated
using (
    caterer_id = (select caterer_id from public.get_my_profile())
    and public.caterer_has_active_subscription_for_auth_user()
    and not exists (
        select 1 from public.caterers c
        where c.id = packages.caterer_id and c.is_suspended
    )
);

drop policy if exists package_images_owner_insert on public.package_images;
create policy package_images_owner_insert on public.package_images
for insert to authenticated
with check (exists (
    select 1
    from public.packages p
    join public.caterers c on c.id = p.caterer_id
    where p.id = package_images.package_id
      and p.caterer_id = (select caterer_id from public.get_my_profile())
      and public.caterer_has_active_subscription_for_auth_user()
      and c.is_suspended = false
));

drop policy if exists package_images_owner_delete on public.package_images;
create policy package_images_owner_delete on public.package_images
for delete to authenticated
using (exists (
    select 1
    from public.packages p
    join public.caterers c on c.id = p.caterer_id
    where p.id = package_images.package_id
      and p.caterer_id = (select caterer_id from public.get_my_profile())
      and public.caterer_has_active_subscription_for_auth_user()
      and c.is_suspended = false
));

create or replace function public.is_caterer_available_on_date(
    p_caterer_id bigint,
    p_event_date date
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
    select p_caterer_id is not null
       and p_event_date is not null
       and p_event_date > (now() at time zone 'Asia/Manila')::date
       and public.caterer_is_publicly_listable(p_caterer_id)
       and not exists (
           select 1
           from public.reservations r
           where r.caterer_id = p_caterer_id
             and r.event_date = p_event_date
             and r.reservation_status in ('pending', 'confirmed')
             and r.payment_status <> 'pending'
       );
$$;

revoke all on function public.is_caterer_available_on_date(bigint, date) from public;
grant execute on function public.is_caterer_available_on_date(bigint, date) to anon, authenticated;

create or replace function public.enforce_permit_before_new_booking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    if new.reservation_status in ('pending', 'confirmed')
       and not public.caterer_is_publicly_listable(new.caterer_id) then
        raise exception using
            errcode = 'P0001',
            message = 'Caterer is unavailable because its business permit or listing is not current.';
    end if;
    return new;
end;
$$;

drop trigger if exists reservations_current_business_permit on public.reservations;
create trigger reservations_current_business_permit
before insert on public.reservations
for each row execute function public.enforce_permit_before_new_booking();

create or replace function public.require_current_permit_before_caterer_approval()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    if new.is_verified = true
       and coalesce(old.is_verified, false) = false
       and not public.caterer_has_current_business_permit(new.id) then
        raise exception 'Verify a current business permit before approving this caterer';
    end if;
    return new;
end;
$$;

drop trigger if exists caterer_approval_requires_current_permit on public.caterers;
create trigger caterer_approval_requires_current_permit
before update of is_verified on public.caterers
for each row execute function public.require_current_permit_before_caterer_approval();

drop function if exists public.get_admin_accounts();
create function public.get_admin_accounts()
returns table (
    id bigint,
    email varchar,
    role varchar,
    created_at timestamptz,
    full_name varchar,
    business_name varchar,
    phone varchar,
    address text,
    city varchar,
    paypal_email varchar,
    customer_verified boolean,
    caterer_verified boolean,
    business_permit varchar,
    business_permit_expiry date,
    business_permit_verified boolean,
    customer_id bigint,
    caterer_id bigint,
    caterer_verification_submitted boolean,
    rejection_reason text
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    return query
    select u.id, u.email, u.role, u.created_at,
        c.full_name, ca.business_name,
        coalesce(c.phone, ca.phone), coalesce(c.address, ca.address), coalesce(c.city, ca.city),
        ca.paypal_email,
        c.is_verified, ca.is_verified, ca.business_permit,
        ca.business_permit_expiry, ca.business_permit_verified,
        c.id, ca.id, ca.verification_submitted,
        coalesce(c.rejection_reason, ca.rejection_reason)
    from public.users u
    left join public.customers c on c.user_id = u.id
    left join public.caterers ca on ca.user_id = u.id
    order by u.created_at desc;
end;
$$;

revoke all on function public.get_admin_accounts() from public;
grant execute on function public.get_admin_accounts() to authenticated;

notify pgrst, 'reload schema';
