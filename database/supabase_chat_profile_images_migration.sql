-- Include the other participant's profile image in chat conversation results.
-- Run after supabase_messages_migration.sql.

begin;

drop function if exists public.get_my_conversations();

create function public.get_my_conversations()
returns table (
    customer_id bigint,
    caterer_id bigint,
    package_id bigint,
    other_user_id bigint,
    other_email varchar,
    full_name varchar,
    business_name varchar,
    other_name text,
    last_message timestamptz,
    last_message_text text,
    unread_count bigint,
    other_profile_image varchar
)
language sql
stable
security definer set search_path = public
as $$
    select
        cu.id,
        ca.id,
        m.package_id,
        case when me.id = cu.user_id then ca.user_id else cu.user_id end,
        case when me.id = cu.user_id then caterer_user.email else customer_user.email end,
        cu.full_name,
        ca.business_name,
        coalesce(ca.business_name, cu.full_name),
        max(m.created_at),
        (array_agg(m.message order by m.created_at desc))[1],
        count(*) filter (where m.receiver_id = me.id and m.is_read is distinct from true),
        case when me.id = cu.user_id then ca.profile_image else cu.profile_picture end
    from public.messages m
    join public.users me on me.auth_user_id = auth.uid()
    join public.customers cu on cu.user_id in (m.sender_id, m.receiver_id)
    join public.caterers ca on ca.user_id in (m.sender_id, m.receiver_id)
    join public.users customer_user on customer_user.id = cu.user_id
    join public.users caterer_user on caterer_user.id = ca.user_id
    where (m.sender_id = me.id or m.receiver_id = me.id)
        and m.sender_id in (cu.user_id, ca.user_id)
        and m.receiver_id in (cu.user_id, ca.user_id)
    group by
        cu.id,
        ca.id,
        m.package_id,
        me.id,
        customer_user.email,
        caterer_user.email,
        cu.full_name,
        ca.business_name,
        ca.profile_image,
        cu.profile_picture;
$$;

revoke all on function public.get_my_conversations() from public;
grant execute on function public.get_my_conversations() to authenticated;

commit;
