-- Package ratings are derived from reviews on completed reservations for each
-- package, rather than from the caterer's aggregate rating.
-- Run after supabase_reservation_completion_reviews_migration.sql and
-- supabase_subscription_package_visibility_migration.sql.

create or replace function public.get_public_package_review_summaries()
returns table (
    package_id bigint,
    average_rating numeric,
    review_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
    select
        reservation.package_id,
        round(avg(review.rating)::numeric, 1),
        count(*)::bigint
    from public.reviews review
    join public.reservations reservation on reservation.id = review.reservation_id
    join public.packages package on package.id = reservation.package_id
    where review.rating is not null
      and public.caterer_is_publicly_listable(package.caterer_id)
    group by reservation.package_id;
$$;

revoke all on function public.get_public_package_review_summaries() from public;
grant execute on function public.get_public_package_review_summaries() to anon, authenticated;

notify pgrst, 'reload schema';
