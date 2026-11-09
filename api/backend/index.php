<?php
$endpoints = [
    'balance_api.php' => 'balance_api.php',
    'booking_api.php' => 'booking_api.php',
    'download_image.php' => 'download_image.php',
    'gcash_receipt_api.php' => 'gcash_receipt_api.php',
    'generate.php' => 'generate.php',
    'generate_status.php' => 'generate_status.php',
    'health_api.php' => 'health_api.php',
    'image_history.php' => 'image_history.php',
    'paymongo_webhook.php' => 'paymongo_webhook.php',
    'payout_api.php' => 'payout_api.php',
    'paypal_return.php' => 'paypal_return.php',
    'subscription_api.php' => 'subscription_api.php',
];

$endpoint = (string) ($_GET['endpoint'] ?? '');
if (!isset($endpoints[$endpoint])) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'API endpoint not found.']);
    exit;
}

require __DIR__ . '/../../backend/' . $endpoints[$endpoint];
