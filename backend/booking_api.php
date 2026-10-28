<?php
ini_set('display_errors', '0');
ini_set('log_errors', '1');
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
    echo json_encode(['error' => $user['error'] ?? 'Please sign in as a customer first.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$package_id = (int) ($input['package_id'] ?? 0);
$caterer_id = (int) ($input['caterer_id'] ?? 0);
$event_date = trim((string) ($input['event_date'] ?? ''));
$event_time = trim((string) ($input['event_time'] ?? ''));
$event_end_time = trim((string) ($input['event_end_time'] ?? ''));
$venue_name = trim((string) ($input['venue_name'] ?? ''));
$venue_address = trim((string) ($input['venue_address'] ?? ''));
$venue_city = trim((string) ($input['venue_city'] ?? ''));
$venue_barangay = trim((string) ($input['venue_barangay'] ?? ''));
$venue_postal = trim((string) ($input['venue_postal'] ?? ''));
$venue_street = trim((string) ($input['venue_street'] ?? ''));
$payment_method = (string) ($input['payment_method'] ?? 'paypal');

if (!$package_id || !$caterer_id || !$event_date || !$event_time || !$event_end_time || !$venue_name || !$venue_address || !in_array($payment_method, ['paypal', 'gcash'], true)) {
    http_response_code(422);
    echo json_encode(['error' => 'Complete all event details.']);
    exit;
}
if (
    !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $event_time)
    || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $event_end_time)
    || $event_end_time <= $event_time
) {
    http_response_code(422);
    echo json_encode(['error' => 'End time must be later than start time.']);
    exit;
}

$package_response = supabase_request('GET', 'packages', [
    'select' => 'id,package_name,event_type,price,caterer_id',
    'id' => 'eq.' . $package_id,
    'caterer_id' => 'eq.' . $caterer_id,
    'limit' => '1',
]);
$package = supabase_row($package_response);
$caterer_response = supabase_request('GET', 'caterers', [
    'select' => 'business_name,paypal_email,gcash_qr_code,is_verified',
    'id' => 'eq.' . $caterer_id,
    'is_verified' => 'eq.true',
    'limit' => '1',
]);
$caterer = supabase_row($caterer_response);
if (!$package || !$caterer) {
    http_response_code(404);
    echo json_encode(['error' => 'Package not found or unavailable.']);
    exit;
}

$duplicate = supabase_request('GET', 'reservations', [
    'select' => 'id',
    'customer_id' => 'eq.' . $user['customer_id'],
    'package_id' => 'eq.' . $package_id,
    'event_date' => 'eq.' . $event_date,
    'event_time' => 'eq.' . $event_time,
    'reservation_status' => 'not.eq.cancelled',
    'limit' => '1',
]);
if (supabase_row($duplicate)) {
    http_response_code(409);
    echo json_encode(['error' => 'You already have a booking request for this package, date, and time.']);
    exit;
}

$total = (float) $package['price'];
$advance = round($total * 0.30, 2);
$balance = round($total - $advance, 2);
$reservation_response = supabase_request('POST', 'reservations', [], [
    'customer_id' => $user['customer_id'],
    'caterer_id' => $caterer_id,
    'package_id' => $package_id,
    'event_date' => $event_date,
    'event_time' => $event_time,
    'event_end_time' => $event_end_time,
    'event_type' => $package['event_type'] ?? null,
    'venue_name' => $venue_name,
    'venue_address' => $venue_address,
    'venue_city' => $venue_city !== '' ? $venue_city : null,
    'venue_barangay' => $venue_barangay !== '' ? $venue_barangay : null,
    'venue_postal' => $venue_postal !== '' ? $venue_postal : null,
    'venue_street' => $venue_street !== '' ? $venue_street : null,
    'booking_payment_method' => $payment_method,
    'location' => $venue_name . ' - ' . $venue_address,
    'guest_count' => null,
    'total_amount' => $total,
    'advance_payment' => $advance,
    'balance_amount' => $balance,
    'payment_status' => 'pending',
    'reservation_status' => 'pending',
    'special_requests' => '',
]);
$reservation = supabase_row($reservation_response);
if (!$reservation) {
    $reservation_error = is_array($reservation_response['data'] ?? null)
        ? (string) ($reservation_response['data']['message'] ?? '')
        : '';
    $reservation_error_code = is_array($reservation_response['data'] ?? null)
        ? (string) ($reservation_response['data']['code'] ?? '')
        : '';
    $is_date_unavailable = $reservation_error === 'Caterer already has a booking on this date.'
        || ($reservation_error_code === '23505'
            && strpos($reservation_error, 'reservations_one_active_caterer_booking_per_date') !== false);
    http_response_code($is_date_unavailable ? 409 : 500);
    echo json_encode([
        'error' => $is_date_unavailable
            ? 'This caterer already has a booking on the selected date. Please choose another date.'
            : 'Unable to create the booking in Supabase.',
    ]);
    exit;
}

if ($payment_method === 'gcash') {
    if (empty($caterer['gcash_qr_code'])) {
        supabase_request('DELETE', 'reservations', ['id' => 'eq.' . $reservation['id']]);
        http_response_code(422);
        echo json_encode(['error' => 'This caterer has not added a GCash QR code yet. Choose PayPal or contact the caterer.']);
        exit;
    }
    echo json_encode([
        'success' => true,
        'manual_gcash' => true,
        'reservation_id' => (int) $reservation['id'],
        'qr_code' => $caterer['gcash_qr_code'],
        'amount' => $advance,
    ]);
    exit;
}

$admin_paypal_email = get_admin_paypal_email();
if (!filter_var($admin_paypal_email, FILTER_VALIDATE_EMAIL)) {
    supabase_request('DELETE', 'reservations', ['id' => 'eq.' . $reservation['id']]);
    http_response_code(422);
    echo json_encode(['error' => 'The platform PayPal email is not configured yet.']);
    exit;
}

$order = create_paypal_order((int) $reservation['id'], $advance, 'Down payment for ' . $package['package_name'], 'down_payment', $admin_paypal_email);
if (!$order['ok']) {
    supabase_request('DELETE', 'reservations', ['id' => 'eq.' . $reservation['id']]);
    http_response_code(502);
    echo json_encode(['error' => $order['error'] ?? 'Unable to start online payment.']);
    exit;
}

echo json_encode(['success' => true, 'reservation_id' => (int) $reservation['id'], 'approval_url' => $order['approval_url'], 'amount' => $advance]);
