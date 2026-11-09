# GCash receipt submission

This Edge Function handles GCash receipt uploads without routing the image through Vercel. It verifies the customer session and booking, screens the image with Sightengine, stores it in the private receipt bucket, records the screening result, and submits the payment through the authenticated database RPC.

Set the screening credentials in Supabase without committing them:

```powershell
supabase login
supabase secrets set SIGHTENGINE_API_USER=your_user SIGHTENGINE_API_SECRET=your_secret --project-ref nylgknhcpyahsijjxwqx
supabase functions deploy gcash-receipt --project-ref nylgknhcpyahsijjxwqx
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase to deployed Edge Functions. Do not put the service-role key in the frontend.
