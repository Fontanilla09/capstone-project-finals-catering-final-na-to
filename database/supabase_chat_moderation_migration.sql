-- Block common profanity, sexual content, and direct romantic advances in chat.
-- Run after supabase_messages_migration.sql.

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
    normalized_message text;
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
    if char_length(coalesce(message_text, '')) > 2000 then
        raise exception 'Message must be 2000 characters or fewer.';
    end if;

    normalized_message := trim(regexp_replace(
        lower(coalesce(message_text, '')),
        '[^[:alnum:][:space:]]',
        '',
        'g'
    ));
    normalized_message := trim(regexp_replace(
        normalized_message,
        '[[:space:]]+',
        ' ',
        'g'
    ));

    if normalized_message ~ '(^| )(putang ina|putangina|tang ina|tangina|pakyu|punyeta|tarantado|gago|bobo|tanga|ulol|fuck|fucked|fucking|motherfucker|shit|bullshit|bitch|asshole|cunt|kantot|iyot|jakol|puke|tite|libog|porn|send nudes|mahal kita|i love you|love kita|crush kita|date tayo|ligawan kita|gusto kita|miss kita|miss na kita|kiss kita|halikan kita|landi|landian)( |$)' then
        raise exception 'Please keep messages professional. Profanity, sexual content, and personal or romantic advances are not allowed.';
    end if;

    recipient_id := case when current_user_id = customer_user_id then caterer_user_id else customer_user_id end;
    insert into public.messages (package_id, sender_id, receiver_id, message, attachment)
    values (nullif(message_package_id, 0), current_user_id, recipient_id, coalesce(message_text, ''), message_attachment);
end;
$$;

revoke all on function public.send_my_message(bigint, bigint, bigint, text, varchar) from public;
grant execute on function public.send_my_message(bigint, bigint, bigint, text, varchar) to authenticated;
