# Getting PayMongo Test API Keys

## Step 1: Create Free PayMongo Account

1. Go to: https://www.paymongo.com/register
2. Sign up with:
   - Email
   - Password
   - Business info (can be test info)
3. Verify your email

## Step 2: Get Test API Keys

1. Log in to: https://dashboard.paymongo.com
2. Go to **Settings** → **Developers** → **API Keys**
3. You'll see two keys in TEST mode:
   - **Public Key** (starts with `pk_test_`)
   - **Secret Key** (starts with `sk_test_`)

## Step 3: Add Keys to .env

Open `.env` file and replace:

```env
PAYMONGO_PUBLIC_KEY=pk_test_YOUR_TEST_PUBLIC_KEY_HERE
PAYMONGO_SECRET_KEY=sk_test_YOUR_TEST_SECRET_KEY_HERE
```

With your actual test keys, e.g.:

```env
PAYMONGO_PUBLIC_KEY=pk_test_aBcDeFgHiJkLmNoP
PAYMONGO_SECRET_KEY=sk_test_aBcDeFgHiJkLmNoP
```

## Step 4: Test the Connection

Run the test script:

```powershell
php backend/test_paymongo_api.php
```

You should see: ✅ **All Tests Passed!**

## Test Payment Details

Once connected, use these credentials for testing:

### GCash
- Phone: `09171234567`
- OTP: `123456`
- Amount: Any amount

### Credit Card (Visa)
- Number: `4343 4343 4343 4343`
- Expiry: `12/25`
- CVC: `123`

### Debit Card (Mastercard)
- Number: `5555 5555 5555 4444`
- Expiry: `12/25`
- CVC: `123`

## Features Available in Test Mode

✅ Create payment links
✅ Test GCash payments
✅ Test card payments
✅ View transaction history
✅ Download reports

## Common Issues

### "Invalid API Keys"
- Keys are case-sensitive
- Make sure you copied the full key from dashboard
- Check no extra spaces

### "Connection refused"
- Ensure internet connection is active
- PayMongo API should be reachable
- Check firewall settings

### "404 Not Found"
- API endpoints are correct
- Check your PayMongo plan supports the feature
- May need to activate features in dashboard

## Next: Going Live

When ready for production:

1. On PayMongo Dashboard, switch from **TEST** to **LIVE** mode (toggle at top)
2. Get your LIVE API keys (start with `pk_live_` and `sk_live_`)
3. Update `.env`:
   ```env
   PAYMONGO_PUBLIC_KEY=pk_live_YOUR_LIVE_KEY
   PAYMONGO_SECRET_KEY=sk_live_YOUR_LIVE_KEY
   PAYMONGO_TEST_MODE=false
   ```
4. Test a real transaction
5. Deploy to production

## Links

- **Sign Up**: https://www.paymongo.com/register
- **Dashboard**: https://dashboard.paymongo.com
- **Documentation**: https://docs.paymongo.com
- **Support**: support@paymongo.com

---

**Once you add your test API keys to `.env`, the system is ready to use!**
