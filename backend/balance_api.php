<?php
header('Content-Type: application/json');
if (preg_match('/^https?:\/\/localhost:\d+$/', $_SERVER['HTTP_ORIGIN'] ?? '')) header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if (($_SERVER['REQUEST_METHOD'] ?? 'POST') === 'OPTIONS') exit;

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/paypal_handler.php';

$user = supabase_current_user();
if (!$user['ok'] || $user['role'] !== 'customer' || empty($user['customer_id'])) {
    http_response_code(401);
    echo json_encode(['error' => $user['error'] ?? 'Unauthorized.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$reservation_id = (int) ($input['reservation_id'] ?? 0);
$reservation_response = supabase_request('GET', 'reservations', [
    'select' => 'id,balance_amount,package_id,reservation_status,payment_status',
    'id' => 'eq.' . $reservation_id,
    'customer_id' => 'eq.' . $user['customer_id'],
    'reservation_status' => 'eq.confirmed',
    'payment_status' => 'eq.partial',
    'limit' => '1',
]);
$reservation = supabase_row($reservation_response);
$package_response = $reservation
    ? supabase_request('GET', 'packages', ['select' => 'package_name', 'id' => 'eq.' . $reservation['package_id'], 'limit' => '1'])
    : ['data' => []];
$package = supabase_row($package_response);

if (!$reservation || !$package || (float) $reservation['balance_amount'] <= 0) {
    http_response_code(422);
    echo json_encode(['error' => 'Balance payment is not available.']);
    exit;
}

$admin_paypal_email = get_admin_paypal_email();
if (!filter_var(trim($admin_paypal_email), FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['error' => 'The platform PayPal email is not configured yet.']);
    exit;
}
$order = create_paypal_order((int) $reservation['id'], (float) $reservation['balance_amount'], 'Balance payment for ' . $package['package_name'], 'balance', $admin_paypal_email);
if (!$order['ok']) {
    http_response_code(502);
    echo json_encode(['error' => $order['error'] ?? 'Unable to start payment.']);
    exit;
}
echo json_encode(['approval_url' => $order['approval_url']]);
