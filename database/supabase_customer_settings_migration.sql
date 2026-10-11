-- Customer profile and account settings functions.
-- Run after supabase_auth_migration.sql.

create or replace function public.update_my_customer_settings(
    p_full_name text,
    p_phone text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_customer_id bigint;
begin
    if nullif(trim(coalesce(p_full_name, '')), '') is null then
        raise exception 'Full name is required.';
    end if;

    if length(trim(p_full_name)) > 100 then
        raise exception 'Full name must be 100 characters or fewer.';
    end if;

    if nullif(trim(coalesce(p_phone, '')), '') is null then
        raise exception 'Phone number is required.';
    end if;

    if length(trim(p_phone)) > 15 then
        raise exception 'Phone number must be 15 characters or fewer.';
    end if;

    select customer.id
    into v_customer_id
    from public.customers customer
    join public.users account on account.id = customer.user_id
    where account.auth_user_id = auth.uid()
      and account.role = 'customer'
    limit 1;

    if v_customer_id is null then
        raise exception 'Customer access required.';
    end if;

    update public.customers
    set full_name = trim(p_full_name),
        phone = trim(p_phone),
        updated_at = now()
    where id = v_customer_id;
end;
$$;

create or replace function public.sync_public_user_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    if new.email is distinct from old.email then
        update public.users
        set email = new.email,
            updated_at = now()
        where auth_user_id = new.id;
    end if;
    return new;
end;
$$;

drop trigger if exists sync_public_user_email_after_auth_email_change on auth.users;
create trigger sync_public_user_email_after_auth_email_change
after update of email on auth.users
for each row execute function public.sync_public_user_email();

revoke all on function public.update_my_customer_settings(text, text) from public;
grant execute on function public.update_my_customer_settings(text, text) to authenticated;
