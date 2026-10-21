-- Restore paid subscription-only access and set the monthly plan to PHP 1.
-- Run after supabase_paymongo_subscriptions_migration.sql.

begin;

create or replace function public.caterer_has_active_subscription(p_caterer_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.caterer_subscriptions s
        join public.caterers c on c.id = s.caterer_id
        where s.caterer_id = p_caterer_id
          and c.is_suspended = false
          and s.status = 'active'
          and s.expires_at > now()
    );
$$;

revoke all on function public.caterer_has_active_subscription(bigint) from public, anon, authenticated;
grant execute on function public.caterer_has_active_subscription(bigint) to service_role;

create or replace function public.caterer_has_active_subscription_for_auth_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.caterer_subscriptions s
        join public.caterers c on c.id = s.caterer_id
        join public.users u on u.id = c.user_id
        where u.auth_user_id = auth.uid()
          and c.is_suspended = false
          and s.status = 'active'
          and s.expires_at > now()
    );
$$;

revoke all on function public.caterer_has_active_subscription_for_auth_user() from public, anon;
grant execute on function public.caterer_has_active_subscription_for_auth_user() to authenticated;

drop table if exists public.caterer_subscription_access_grants;

alter table public.caterer_subscriptions
    drop constraint if exists caterer_subscriptions_amount_check;

alter table public.caterer_subscriptions
    add constraint caterer_subscriptions_amount_check
    check (amount in (100, 49900, 479000));

commit;
