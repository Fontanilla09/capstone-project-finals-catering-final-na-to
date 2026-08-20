<?php
/**
 * PayMongo API Test Script
 * Test if API credentials are working correctly
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/paymongo_handler.php';

$env = loadEnvFile(__DIR__ . '/../.env');

echo "=== PayMongo API Test ===\n\n";

// Check API Keys
echo "1. Checking API Keys...\n";
$public_key = getenv('PAYMONGO_PUBLIC_KEY');
$secret_key = getenv('PAYMONGO_SECRET_KEY');

if (strpos($public_key, 'pk_test_') === 0 || strpos($public_key, 'pk_live_') === 0) {
    echo "✓ Public Key: " . substr($public_key, 0, 15) . "... (Valid)\n";
} else {
    echo "✗ Public Key: Invalid format\n";
    exit(1);
}

if (strpos($secret_key, 'sk_test_') === 0 || strpos($secret_key, 'sk_live_') === 0) {
    echo "✓ Secret Key: " . substr($secret_key, 0, 15) . "... (Valid)\n";
} else {
    echo "✗ Secret Key: Invalid format\n";
    exit(1);
}

$is_test_mode = getenv('PAYMONGO_TEST_MODE') === 'true';
echo "✓ Mode: " . ($is_test_mode ? 'TEST (Development)' : 'LIVE (Production)') . "\n";

// Test API Connection and payment intent creation
echo "\n2. Testing Payment Intent Creation...\n";

$ch = curl_init();
$testIntent = [
    'data' => [
        'attributes' => [
            'amount' => 1000,
            'currency' => 'PHP',
            'description' => 'Test Payment Intent',
            'payment_method_allowed' => ['gcash', 'card'],
            'redirect' => [
                'success' => 'http://localhost/capstone-project-finals-catering/frontend/dashboard/customer.php?payment=success',
                'failed' => 'http://localhost/capstone-project-finals-catering/frontend/dashboard/customer.php?payment=failed'
            ]
        ]
    ]
];

curl_setopt_array($ch, [
    CURLOPT_URL => 'https://api.paymongo.com/v1/payment_intents',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => 'POST',
    CURLOPT_POSTFIELDS => json_encode($testIntent),
    CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
    CURLOPT_USERPWD => $secret_key . ':',
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_TIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response = curl_exec($ch);
$httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    echo "✗ Connection Error: $error\n";
    exit(1);
} elseif ($httpcode === 201) {
    echo "✓ Payment Intent Created (HTTP 201)\n";
} else {
    echo "✗ Failed to create payment intent (HTTP $httpcode)\n";
    echo "Response: $response\n";
    exit(1);
}

$decoded = json_decode($response, true);
if (isset($decoded['data']['attributes']['next_action']['redirect']['url'])) {
    echo "✓ Redirect URL available: " . $decoded['data']['attributes']['next_action']['redirect']['url'] . "\n";
} elseif (isset($decoded['data']['attributes']['checkout_url'])) {
    echo "✓ Checkout URL available: " . $decoded['data']['attributes']['checkout_url'] . "\n";
} else {
    echo "✗ No redirect or checkout URL returned.\n";
    echo "Full response: $response\n";
    exit(1);
}

echo "\n=== All Tests Passed! ✓ ===\n";
echo "\n3. Testing Payment Link Creation...\n";

$test_data = [
    'data' => [
        'attributes' => [
            'amount' => 1000, // ₱10.00
            'description' => 'Test Catering Service',
            'line_items' => [
                [
                    'name' => 'Test Package',
                    'quantity' => 1,
                    'amount' => 1000
                ]
            ],
            'payment_method_types' => ['gcash', 'card'],
            'currency' => 'PHP',
            'redirect' => [
                'failed' => 'http://localhost/capstone-project-finals-catering/frontend/dashboard/manage_services.php?payment=failed',
                'success' => 'http://localhost/capstone-project-finals-catering/frontend/dashboard/manage_services.php?payment=success'
            ]
        ]
    ]
];

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => 'https://api.paymongo.com/v1/checkout_sessions',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => 'POST',
    CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
    CURLOPT_USERPWD => $secret_key . ':',
    CURLOPT_POSTFIELDS => json_encode($test_data),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_TIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response = curl_exec($ch);
$httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    echo "✗ Payment Link Error: $error\n";
    exit(1);
}

$decoded = json_decode($response, true);

if ($httpcode === 201 && isset($decoded['data']['attributes']['checkout_url'])) {
    echo "✓ Payment Link Created Successfully\n";
    echo "   Checkout URL: " . substr($decoded['data']['attributes']['checkout_url'], 0, 50) . "...\n";
} else {
    echo "✗ Failed to create payment link (HTTP $httpcode)\n";
    if (isset($decoded['errors'])) {
        echo "   Error: " . json_encode($decoded['errors']) . "\n";
    }
    exit(1);
}

echo "\n=== All Tests Passed! ✓ ===\n";
echo "\nPayMongo API is ready to use!\n";
echo "You can now:\n";
echo "1. Create catering services\n";
echo "2. Collect payments via GCash\n";
echo "3. Test with test credentials\n";
echo "\n✓ Ready for testing!\n";

?>
