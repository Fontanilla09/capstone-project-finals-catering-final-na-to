<?php
require_once __DIR__ . '/config.php';

$frontend_url = rtrim($app_env['FRONTEND_URL'] ?? 'http://localhost:5173', '/');
$reservation_id = (int) ($_GET['reservation_id'] ?? 0);
$payment_type = (string) ($_GET['payment_type'] ?? 'down_payment');
$signature = (string) ($_GET['signature'] ?? '');
$paypal_secret = trim((string) ($app_env['PAYPAL_CLIENT_SECRET'] ?? ''));
$expected_signature = hash_hmac('sha256', $reservation_id . '|' . $payment_type, $paypal_secret);

if ($reservation_id > 0 && hash_equals($expected_signature, $signature) && $payment_type === 'down_payment') {
    supabase_request('DELETE', 'reservations', [
        'id' => 'eq.' . $reservation_id,
        'payment_status' => 'eq.pending',
        'reservation_status' => 'eq.pending',
    ], null, 'return=minimal');
}

header('Location: ' . $frontend_url . '/dashboard/customer?payment=cancelled');
exit;
