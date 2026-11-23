-- Business permits are optional and permit expiry no longer controls public listings or bookings.
-- Run after supabase_business_permit_expiry_migration.sql.

drop trigger if exists reservations_current_business_permit on public.reservations;
drop function if exists public.enforce_permit_before_new_booking();

drop trigger if exists caterer_approval_requires_current_permit on public.caterers;
drop function if exists public.require_current_permit_before_caterer_approval();

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
          and s.status = 'active'
          and s.expires_at > now()
    );
$$;

drop policy if exists caterers_public_verified on public.caterers;
create policy caterers_public_verified on public.caterers
for select to anon, authenticated
using (is_verified = true and is_suspended = false);

drop function if exists public.caterer_has_current_business_permit(bigint);
drop function if exists public.save_my_caterer_permit_expiry(date);
drop function if exists public.review_caterer_permit_expiry(bigint, boolean);

notify pgrst, 'reload schema';
