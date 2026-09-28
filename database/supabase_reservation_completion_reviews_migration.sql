-- Run after supabase_auth_migration.sql and the customer dashboard migrations.

create or replace function public.complete_caterer_reservation(p_reservation_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_caterer_id bigint;
begin
    select caterer_id
    into v_caterer_id
    from public.get_my_profile()
    where role = 'caterer';

    if v_caterer_id is null then
        raise exception 'Caterer access required.';
    end if;

    update public.reservations
    set reservation_status = 'completed',
        updated_at = now()
    where id = p_reservation_id
      and caterer_id = v_caterer_id
      and reservation_status = 'confirmed'
            and payment_status = 'completed'
            and event_date <= (now() at time zone 'Asia/Manila')::date;

    if not found then
                raise exception 'Only your fully paid confirmed events on or after the event date can be marked completed.';
    end if;
end;
$$;

revoke all on function public.complete_caterer_reservation(bigint) from public;
grant execute on function public.complete_caterer_reservation(bigint) to authenticated;

create or replace function public.submit_catering_review(
    p_reservation_id bigint,
    p_rating integer,
    p_review_text text default ''
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_customer_id bigint;
    v_caterer_id bigint;
begin
    if p_rating is null or p_rating < 1 or p_rating > 5 then
        raise exception 'Rating must be between 1 and 5 stars.';
    end if;

    if length(coalesce(p_review_text, '')) > 1000 then
        raise exception 'Review must be 1000 characters or fewer.';
    end if;

    select c.id
    into v_customer_id
    from public.customers c
    join public.users u on u.id = c.user_id
    where u.auth_user_id = auth.uid()
      and u.role = 'customer'
    limit 1;

    if v_customer_id is null then
        raise exception 'Customer access required.';
    end if;

    select r.caterer_id
    into v_caterer_id
    from public.reservations r
    where r.id = p_reservation_id
      and r.customer_id = v_customer_id
      and r.reservation_status = 'completed'
    and r.payment_status = 'completed'
    for update;

    if v_caterer_id is null then
        raise exception 'You can only review a completed reservation.';
    end if;

    if exists (
        select 1
        from public.reviews rev
        where rev.reservation_id = p_reservation_id
    ) then
        raise exception 'This reservation has already been reviewed.';
    end if;

    perform 1
    from public.caterers
    where id = v_caterer_id
    for update;

    insert into public.reviews (reservation_id, customer_id, caterer_id, rating, review_text)
    values (p_reservation_id, v_customer_id, v_caterer_id, p_rating, nullif(trim(coalesce(p_review_text, '')), ''));

    update public.caterers
    set rating = coalesce((
        select round(avg(rev.rating)::numeric, 2)
        from public.reviews rev
        where rev.caterer_id = v_caterer_id
    ), 0)
    where id = v_caterer_id;
end;
$$;

revoke all on function public.submit_catering_review(bigint, integer, text) from public;
grant execute on function public.submit_catering_review(bigint, integer, text) to authenticated;

revoke insert, update, delete on table public.reviews from public, anon, authenticated;