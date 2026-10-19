-- Run after supabase_caterer_reviews_migration.sql.
-- The function's return shape changes, so it must be dropped before recreation.

drop function if exists public.get_caterer_reviews();

create function public.get_caterer_reviews()
returns table (
    review_id bigint,
    package_id bigint,
    rating integer,
    review_text text,
    review_image varchar,
    created_at timestamptz,
    customer_name varchar,
    package_name varchar,
    event_type varchar,
    guest_count integer,
    event_date date,
    is_read boolean
)
language sql
stable
security definer set search_path = public
as $$
    select
        rev.id,
        reservation.package_id,
        rev.rating,
        rev.review_text,
        rev.review_image,
        rev.created_at,
        customer.full_name,
        package.package_name,
        package.event_type,
        reservation.guest_count,
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

revoke all on function public.get_caterer_reviews() from public;
grant execute on function public.get_caterer_reviews() to authenticated;
