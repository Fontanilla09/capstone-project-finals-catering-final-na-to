# Account rejection email

This function sends the recipient a notice only after the admin rejection RPC succeeds. It verifies the caller through Supabase Auth, then calls the admin-only `get_admin_accounts` RPC to retrieve the saved rejection reason and recipient address.

Before deploying, configure a verified sender address/domain in Resend and link the Supabase CLI to the project. Set the function secrets without committing them:

```powershell
supabase secrets set RESEND_API_KEY=re_your_key ACCOUNT_REJECTION_FROM="CaterAI <no-reply@your-verified-domain.com>"
supabase functions deploy send-account-rejection-email
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided to deployed Supabase Edge Functions. The frontend reports a delivery error separately if the rejection was saved but the function or email provider is unavailable.
