-- Remove admin approval for customer accounts.
-- Run after supabase_account_rejection_migration.sql.

alter table public.customers
    alter column is_verified set default true;

update public.customers
set is_verified = true,
    updated_at = now()
where is_verified is distinct from true
  and rejection_reason is null;
