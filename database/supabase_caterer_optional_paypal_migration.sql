-- Allow caterer accounts to be created before they have a PayPal email.
-- Payout requests still require a valid PayPal email in payout_api.php.
-- Run after supabase_auth_migration.sql.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    new_role varchar(20);
    profile_id bigint;
begin
    new_role := case
        when new.raw_user_meta_data->>'account_type' = 'caterer' then 'caterer'
        else 'customer'
    end;

    insert into public.users (auth_user_id, email, password, role)
    values (new.id, new.email, null, new_role)
    returning id into profile_id;

    if new_role = 'caterer' then
        insert into public.caterers (
            user_id, business_name, phone, address, city, description, paypal_email
        ) values (
            profile_id,
            coalesce(new.raw_user_meta_data->>'business_name', ''),
            coalesce(new.raw_user_meta_data->>'phone', ''),
            nullif(new.raw_user_meta_data->>'address', ''),
            nullif(new.raw_user_meta_data->>'city', ''),
            nullif(new.raw_user_meta_data->>'description', ''),
            nullif(new.raw_user_meta_data->>'paypal_email', '')
        );
    else
        insert into public.customers (user_id, full_name, phone)
        values (
            profile_id,
            coalesce(new.raw_user_meta_data->>'full_name', ''),
            coalesce(new.raw_user_meta_data->>'phone', '')
        );
    end if;

    return new;
end;
$$;
