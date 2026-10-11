-- Run after supabase_reservation_completion_reviews_migration.sql.

alter table public.reviews
    add column if not exists caterer_read_at timestamptz;

create or replace function public.get_caterer_reviews()
returns table (
    review_id bigint,
    rating integer,
    review_text text,
    review_image varchar,
    created_at timestamptz,
    customer_name varchar,
    package_name varchar,
    event_date date,
    is_read boolean
)
language sql
stable
security definer set search_path = public
as $$
    select
        rev.id,
        rev.rating,
        rev.review_text,
        rev.review_image,
        rev.created_at,
        customer.full_name,
        package.package_name,
        reservation.event_date,
        rev.caterer_read_at is not null
    from public.reviews rev
    join public.reservations reservation on reservation.id = rev.reservation_id
    join public.packages package on package.id = reservation.package_id
    join public.customers customer on customer.id = rev.customer_id
    where rev.caterer_id = (
        select profile.caterer_id
        from public.get_my_profile() profile
        where profile.role = 'caterer'
    )
    order by rev.created_at desc;
$$;

create or replace function public.get_unread_caterer_reviews_count()
returns bigint
language sql
stable
security definer set search_path = public
as $$
    select count(*)
    from public.reviews rev
    where rev.caterer_id = (
        select profile.caterer_id
        from public.get_my_profile() profile
        where profile.role = 'caterer'
    )
      and rev.caterer_read_at is null;
$$;

create or replace function public.mark_caterer_reviews_read()
returns void
language sql
security definer set search_path = public
as $$
    update public.reviews rev
    set caterer_read_at = now()
    where rev.caterer_id = (
        select profile.caterer_id
        from public.get_my_profile() profile
        where profile.role = 'caterer'
    )
      and rev.caterer_read_at is null;
$$;

revoke all on function public.get_caterer_reviews() from public;
grant execute on function public.get_caterer_reviews() to authenticated;
revoke all on function public.get_unread_caterer_reviews_count() from public;
grant execute on function public.get_unread_caterer_reviews_count() to authenticated;
revoke all on function public.mark_caterer_reviews_read() from public;
grant execute on function public.mark_caterer_reviews_read() to authenticated;
