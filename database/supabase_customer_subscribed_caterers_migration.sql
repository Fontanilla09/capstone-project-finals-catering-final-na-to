-- Let customers find verified caterers with active subscriptions in chat.
-- Run after supabase_auth_migration.sql, supabase_caterer_suspension_migration.sql,
-- and supabase_paymongo_subscriptions_migration.sql.

begin;

create or replace function public.get_customer_subscribed_caterers()
returns table (
    caterer_id bigint,
    business_name varchar,
    profile_image varchar
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1
        from public.users u
        join public.customers cu on cu.user_id = u.id
        where u.auth_user_id = auth.uid()
    ) then
        raise exception 'Customer access required';
    end if;

    return query
    select c.id, c.business_name, c.profile_image
    from public.caterers c
    where c.is_verified = true
      and c.is_suspended = false
      and exists (
          select 1
          from public.caterer_subscriptions s
          where s.caterer_id = c.id
            and s.status = 'active'
            and s.expires_at > now()
      )
    order by c.business_name;
end;
$$;

revoke all on function public.get_customer_subscribed_caterers() from public, anon;
grant execute on function public.get_customer_subscribed_caterers() to authenticated;

commit;

notify pgrst, 'reload schema';
