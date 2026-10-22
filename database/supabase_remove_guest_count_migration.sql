begin;

alter table public.reservations
    alter column guest_count drop not null;

alter table public.packages
    drop column if exists guest_count_min,
    drop column if exists guest_count_max;

commit;
