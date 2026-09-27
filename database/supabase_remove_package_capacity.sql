-- Remove the deprecated package booking-limit field.
alter table public.packages
    drop column if exists max_bookings;