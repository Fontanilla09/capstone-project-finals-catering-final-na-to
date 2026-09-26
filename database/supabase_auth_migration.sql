-- CaterAI Supabase Auth bridge
-- Run after supabase_schema.sql. No existing account data is imported.

alter table public.users
    alter column password drop not null;

alter table public.users
    add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.get_my_profile()
returns table (
    user_id bigint,
    role varchar,
    customer_id bigint,
    caterer_id bigint,
    display_name varchar,
    is_verified boolean
)
language sql
stable
security definer set search_path = public
as $$
    select
        u.id,
        u.role,
        c.id,
        ca.id,
        coalesce(c.full_name, ca.business_name),
        coalesce(c.is_verified, ca.is_verified, false)
    from public.users u
    left join public.customers c on c.user_id = u.id
    left join public.caterers ca on ca.user_id = u.id
    where u.auth_user_id = auth.uid()
    limit 1;
$$;

alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.caterers enable row level security;

 drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
for select to authenticated
using (auth_user_id = auth.uid());

drop policy if exists customers_select_own on public.customers;
create policy customers_select_own on public.customers
for select to authenticated
using (user_id = (select user_id from public.get_my_profile()));

drop policy if exists caterers_select_own on public.caterers;
create policy caterers_select_own on public.caterers
for select to authenticated
using (user_id = (select user_id from public.get_my_profile()));

create or replace function public.save_my_caterer_permit(permit_path varchar)
returns void
language sql
security definer set search_path = public
as $$
    update public.caterers
    set business_permit = permit_path,
        verification_submitted = true,
        updated_at = now()
    where user_id = (select user_id from public.get_my_profile());
$$;

revoke all on function public.save_my_caterer_permit(varchar) from public;
grant execute on function public.save_my_caterer_permit(varchar) to authenticated;

insert into storage.buckets (id, name, public)
values ('permits', 'permits', false)
on conflict (id) do nothing;

drop policy if exists permits_insert_own on storage.objects;
create policy permits_insert_own on storage.objects
for insert to authenticated
with check (bucket_id = 'permits' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists permits_select_own on storage.objects;
create policy permits_select_own on storage.objects
for select to authenticated
using (bucket_id = 'permits' and (storage.foldername(name))[1] = auth.uid()::text);

-- The application uses the security-definer RPC above for the current profile.
revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;
