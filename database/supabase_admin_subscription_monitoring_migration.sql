-- Allow admins to monitor caterer subscription history.
-- Run after supabase_admin_migration.sql and supabase_paymongo_subscriptions_migration.sql.

create or replace function public.get_admin_caterer_subscriptions()
returns table (
    subscription_id bigint,
    caterer_id bigint,
    business_name varchar,
    email varchar,
    plan text,
    amount integer,
    status text,
    created_at timestamptz,
    started_at timestamptz,
    expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    return query
    select s.id, s.caterer_id, c.business_name, u.email, s.plan, s.amount,
        s.status, s.created_at, s.started_at, s.expires_at
    from public.caterer_subscriptions s
    join public.caterers c on c.id = s.caterer_id
    join public.users u on u.id = c.user_id
    order by s.created_at desc;
end;
$$;

revoke all on function public.get_admin_caterer_subscriptions() from public, anon;
grant execute on function public.get_admin_caterer_subscriptions() to authenticated;
