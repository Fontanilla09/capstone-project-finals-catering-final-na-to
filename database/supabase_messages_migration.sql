-- Supabase messaging functions
-- Run after supabase_auth_migration.sql and supabase_schema.sql.

drop function if exists public.get_my_conversations();

create or replace function public.get_my_conversations()
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
    unread_count bigint
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
        count(*) filter (where m.receiver_id = me.id and m.is_read is distinct from true)
    from public.messages m
    join public.users me on me.auth_user_id = auth.uid()
    join public.customers cu on cu.user_id in (m.sender_id, m.receiver_id)
    join public.caterers ca on ca.user_id in (m.sender_id, m.receiver_id)
    join public.users customer_user on customer_user.id = cu.user_id
    join public.users caterer_user on caterer_user.id = ca.user_id
        where (m.sender_id = me.id or m.receiver_id = me.id)
            and m.sender_id in (cu.user_id, ca.user_id)
            and m.receiver_id in (cu.user_id, ca.user_id)
    group by cu.id, ca.id, m.package_id, me.id, customer_user.email, caterer_user.email, cu.full_name, ca.business_name;
$$;

create or replace function public.get_my_messages(
    message_customer_id bigint,
    message_caterer_id bigint,
    message_package_id bigint default 0
)
returns table (
    id bigint,
    sender_id bigint,
    receiver_id bigint,
    message text,
    attachment varchar,
    is_read boolean,
    created_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
    select m.id, m.sender_id, m.receiver_id, m.message, m.attachment, m.is_read, m.created_at
    from public.messages m
    join public.users me on me.auth_user_id = auth.uid()
    join public.customers cu on cu.id = message_customer_id
    join public.caterers ca on ca.id = message_caterer_id
    where ((m.sender_id = cu.user_id and m.receiver_id = ca.user_id)
        or (m.sender_id = ca.user_id and m.receiver_id = cu.user_id))
      and coalesce(m.package_id, 0) = message_package_id
      and (me.id = cu.user_id or me.id = ca.user_id)
    order by m.created_at asc;
$$;

create or replace function public.send_my_message(
    message_customer_id bigint,
    message_caterer_id bigint,
    message_package_id bigint,
    message_text text,
    message_attachment varchar default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    current_user_id bigint;
    customer_user_id bigint;
    caterer_user_id bigint;
    recipient_id bigint;
begin
    select id into current_user_id from public.users where auth_user_id = auth.uid();
    select user_id into customer_user_id from public.customers where id = message_customer_id;
    select user_id into caterer_user_id from public.caterers where id = message_caterer_id;

    if current_user_id is null or current_user_id not in (customer_user_id, caterer_user_id) then
        raise exception 'You are not a participant in this conversation.';
    end if;
    if nullif(trim(message_text), '') is null and message_attachment is null then
        raise exception 'Message cannot be empty.';
    end if;

    recipient_id := case when current_user_id = customer_user_id then caterer_user_id else customer_user_id end;
    insert into public.messages (package_id, sender_id, receiver_id, message, attachment)
    values (nullif(message_package_id, 0), current_user_id, recipient_id, coalesce(message_text, ''), message_attachment);
end;
$$;

revoke all on function public.get_my_conversations() from public;
grant execute on function public.get_my_conversations() to authenticated;
revoke all on function public.get_my_messages(bigint, bigint, bigint) from public;
grant execute on function public.get_my_messages(bigint, bigint, bigint) to authenticated;
revoke all on function public.send_my_message(bigint, bigint, bigint, text, varchar) from public;
grant execute on function public.send_my_message(bigint, bigint, bigint, text, varchar) to authenticated;

create or replace function public.get_my_unread_messages()
returns bigint
language sql
stable
security definer set search_path = public
as $$
        select count(*)
        from public.messages m
        join public.users me on me.id = m.receiver_id
        where me.auth_user_id = auth.uid()
            and m.is_read is distinct from true;
$$;

create or replace function public.mark_my_messages_read(
        message_customer_id bigint,
        message_caterer_id bigint,
        message_package_id bigint default 0
)
returns void
language sql
security definer set search_path = public
as $$
        update public.messages m
        set is_read = true
        from public.users me, public.customers cu, public.caterers ca
        where me.auth_user_id = auth.uid()
            and cu.id = message_customer_id
            and ca.id = message_caterer_id
            and m.receiver_id = me.id
            and ((m.sender_id = cu.user_id and m.receiver_id = ca.user_id)
                or (m.sender_id = ca.user_id and m.receiver_id = cu.user_id))
            and coalesce(m.package_id, 0) = message_package_id;
$$;

revoke all on function public.get_my_unread_messages() from public;
grant execute on function public.get_my_unread_messages() to authenticated;
revoke all on function public.mark_my_messages_read(bigint, bigint, bigint) from public;
grant execute on function public.mark_my_messages_read(bigint, bigint, bigint) to authenticated;

insert into storage.buckets (id, name, public)
values ('messages', 'messages', true)
on conflict (id) do nothing;

drop policy if exists messages_storage_insert on storage.objects;
create policy messages_storage_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'messages' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists messages_storage_select on storage.objects;
create policy messages_storage_select on storage.objects
for select to authenticated
using (bucket_id = 'messages');

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'messages'
    ) then
        alter publication supabase_realtime add table public.messages;
    end if;
end
$$;
