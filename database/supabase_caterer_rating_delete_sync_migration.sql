-- Keep the denormalized caterer rating in sync when reviews are removed,
-- including reviews removed by customer-account cascades.

create or replace function public.refresh_caterer_rating_after_review_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    update public.caterers
    set rating = coalesce((
        select round(avg(review.rating)::numeric, 2)
        from public.reviews review
        where review.caterer_id = old.caterer_id
    ), 0)
    where id = old.caterer_id;

    return old;
end;
$$;

drop trigger if exists reviews_refresh_caterer_rating_after_delete on public.reviews;
create trigger reviews_refresh_caterer_rating_after_delete
after delete on public.reviews
for each row
execute function public.refresh_caterer_rating_after_review_delete();

revoke all on function public.refresh_caterer_rating_after_review_delete() from public, anon, authenticated;

update public.caterers caterer
set rating = coalesce((
    select round(avg(review.rating)::numeric, 2)
    from public.reviews review
    where review.caterer_id = caterer.id
), 0);
