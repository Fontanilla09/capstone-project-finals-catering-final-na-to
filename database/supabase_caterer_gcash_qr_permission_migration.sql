-- Allow caterers to save their own GCash QR URL.
-- Row-level security still limits updates to the authenticated caterer's row.

grant update (gcash_qr_code) on public.caterers to authenticated;
