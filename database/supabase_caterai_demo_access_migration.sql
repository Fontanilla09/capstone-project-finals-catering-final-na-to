-- Permanent CaterAI Pro demo access for the caterer account shown in the demo.
-- Run after supabase_paymongo_subscriptions_migration.sql.

create table if not exists public.caterer_subscription_access_grants (
    auth_user_id uuid primary key references auth.users(id) on delete cascade,
    granted_at timestamptz not null default now()
);

alter table public.caterer_subscription_access_grants enable row level security;
revoke all on public.caterer_subscription_access_grants from public, anon, authenticated;
grant all on public.caterer_subscription_access_grants to service_role;

insert into public.caterer_subscription_access_grants (auth_user_id)
select u.id
from auth.users u
join public.users p on p.auth_user_id = u.id and p.role = 'caterer'
join public.caterers c on c.user_id = p.id
where lower(u.email) = 'fontanilla040304@gmail.com'
  and c.is_suspended = false
on conflict (auth_user_id) do nothing;

do $$
begin
    if not exists (
        select 1
        from public.caterer_subscription_access_grants g
        join auth.users u on u.id = g.auth_user_id
        join public.users p on p.auth_user_id = u.id and p.role = 'caterer'
        join public.caterers c on c.user_id = p.id
        where lower(u.email) = 'fontanilla040304@gmail.com'
          and c.is_suspended = false
    ) then
        raise exception 'Demo access was not granted; the matching active caterer account was not found.';
    end if;
end;
$$;

create or replace function public.caterer_has_active_subscription(p_caterer_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.caterers c
        where c.id = p_caterer_id
          and c.is_suspended = false
          and (
              exists (
                  select 1
                  from public.caterer_subscriptions s
                  where s.caterer_id = c.id
                    and s.status = 'active'
                    and s.expires_at > now()
              )
              or exists (
                  select 1
                  from public.users p
                  join public.caterer_subscription_access_grants g on g.auth_user_id = p.auth_user_id
                  where p.id = c.user_id
              )
          )
    );
$$;

create or replace function public.caterer_has_active_subscription_for_auth_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.users p
        join public.caterers c on c.user_id = p.id
        where p.auth_user_id = auth.uid()
          and c.is_suspended = false
          and (
              exists (
                  select 1
                  from public.caterer_subscriptions s
                  where s.caterer_id = c.id
                    and s.status = 'active'
                    and s.expires_at > now()
              )
              or exists (
                  select 1
                  from public.caterer_subscription_access_grants g
                  where g.auth_user_id = p.auth_user_id
              )
          )
    );
$$;
