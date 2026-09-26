-- Promote an existing Supabase Auth user to admin.
-- Create the user first in Supabase Dashboard > Authentication > Users.
-- Replace the email below only if you use a different admin email.

do $$
declare
    target_auth_id uuid;
    target_user_id bigint;
begin
    select id into target_auth_id
    from auth.users
    where lower(email) = lower('capstoneCaterAI@gmail.com')
    limit 1;

    if target_auth_id is null then
        raise exception 'Admin Auth user was not found. Create it in Authentication > Users first.';
    end if;

    select id into target_user_id
    from public.users
    where auth_user_id = target_auth_id
    limit 1;

    if target_user_id is null then
        insert into public.users (auth_user_id, email, password, role)
        values (target_auth_id, (select email from auth.users where id = target_auth_id), null, 'admin')
        returning id into target_user_id;
    else
        update public.users
        set role = 'admin', email = (select email from auth.users where id = target_auth_id), updated_at = now()
        where id = target_user_id;
    end if;

    delete from public.customers where user_id = target_user_id;
    delete from public.caterers where user_id = target_user_id;
end
$$;
