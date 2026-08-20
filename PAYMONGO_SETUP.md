# PayMongo GCash Integration Guide

This guide explains how to set up PayMongo payment integration for catering services in CaterAI.

## Overview

PayMongo allows caterers to collect payments from customers using various methods including:
- **GCash** (Primary method)
- **Credit/Debit Cards**
- **Bank Transfers**
- **Other e-wallets**

## Setup Steps

### 1. Create PayMongo Account
- Visit https://www.paymongo.com
- Sign up for a merchant account
- Complete your business verification
- Go to Dashboard > Developers > API Keys

### 2. Get Your API Keys
- Copy your **Public Key** (starts with `pk_test_` or `pk_live_`)
- Copy your **Secret Key** (starts with `sk_test_` or `sk_live_`)

### 3. Configure Environment Variables
```bash
# Copy the .env.example to .env
cp .env.example .env

# Open .env and add your PayMongo credentials
PAYMONGO_PUBLIC_KEY=pk_test_xxxxxxxxxxxxx
PAYMONGO_SECRET_KEY=sk_test_xxxxxxxxxxxxx
```

### 4. Database Updates
The database already has the required tables:
- `payments` - Stores payment records
- `packages` - Stores catering packages (services)

### 5. Integration Points

#### Creating a Service (Package)
When a caterer creates a new service in `manage_services.php`:
1. Package details are saved to the `packages` table
2. An optional payment can be collected from customers using PayMongo

#### Payment Flow
1. Customer selects a package
2. Checkout page initiates PayMongo payment link
3. Customer completes payment via GCash/Card
4. PayMongo sends webhook confirmation
5. Payment status is updated in `payments` table
6. Reservation is confirmed

### 6. PayMongo API Usage in Code

#### Example: Creating a Payment Link
```php
require_once '../../backend/paymongo_handler.php';

$handler = new PayMongoHandler(
    getenv('PAYMONGO_PUBLIC_KEY'),
    getenv('PAYMONGO_SECRET_KEY')
);

$result = $handler->createPaymentLink(
    $caterer_id,
    'Elegant Wedding Package',
    75000,
    [
        'package_id' => 123,
        'customer_id' => 456
    ]
);

if ($result['success']) {
    $checkout_url = $result['data']['data']['attributes']['checkout_url'];
    // Redirect customer to checkout
    header('Location: ' . $checkout_url);
}
```

#### Example: Checking Payment Status
```php
$payment_result = $handler->getPaymentStatus('pay_xxxxxxxxxxxxxx');

if ($payment_result['success']) {
    $status = $payment_result['data']['data']['attributes']['status'];
    // 'paid', 'pending', 'failed', 'canceled'
}
```

## File Locations

- **Payment Handler**: `backend/paymongo_handler.php`
- **Services Manager**: `frontend/dashboard/manage_services.php`
- **Configuration**: `.env` (create from `.env.example`)

## Testing

### Test Credentials
Use PayMongo's test mode (default):
- Public Key: `pk_test_xxxxx`
- Secret Key: `sk_test_xxxxx`

### Test GCash Payment
1. Go to manage_services.php
2. Create a new service
3. Proceed to checkout
4. Use test GCash number: **09171234567**
5. OTP: **123456**

### Test Credit Card
- Card Number: **4343 4343 4343 4343**
- Expiry: **12/25**
- CVC: **123**

## Webhook Setup

PayMongo sends payment notifications to your webhook endpoint:
- Endpoint: `https://yourdomain.com/backend/paymongo_handler.php`

Go to PayMongo Dashboard > Settings > Webhooks and add:
- URL: `https://yourdomain.com/backend/paymongo_handler.php`
- Events: `payment.paid`, `payment.failed`

## Important Notes

1. **Never commit `.env` file** to version control
2. **Keep Secret Key private** - never expose in frontend code
3. **Use Public Key for frontend** operations only
4. **Test thoroughly** before going live
5. **Verify HTTPS** is enabled on production
6. **Handle errors gracefully** - users should get clear feedback

## Troubleshooting

### Payment Link Not Created
- Check if API keys are correct in `.env`
- Verify CURL is enabled in PHP
- Check PayMongo account status and balance

### Webhook Not Received
- Verify webhook URL is publicly accessible (not localhost)
- Check PayMongo Dashboard > Logs for webhook attempts
- Ensure SSL certificate is valid for HTTPS

### Payment Shows as Failed
- Check customer's GCash account
- Verify amount is in correct format (centavos)
- Check PayMongo transaction logs

## Next Steps

1. After payment integration, create checkout page
2. Implement order/reservation confirmation system
3. Set up email notifications for successful payments
4. Add payment history/receipts for caterers
5. Implement refund handling

## Support

For PayMongo support:
- Documentation: https://docs.paymongo.com
- Help Center: https://support.paymongo.com
- Email: support@paymongo.com

For CaterAI support:
- Check database schema in `database/schema.sql`
- Review existing payment logic in code
- Test with PayMongo test credentials first
