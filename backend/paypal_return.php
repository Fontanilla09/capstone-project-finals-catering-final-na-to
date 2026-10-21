<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/paypal_handler.php';

$frontend_url = rtrim(app_env_value('FRONTEND_URL', 'http://localhost:5173'), '/');
$reservation_id = (int) ($_GET['reservation_id'] ?? 0);
$order_id = trim((string) ($_GET['token'] ?? ''));
$payment_type = $_GET['payment_type'] ?? 'down_payment';
$signature = (string) ($_GET['signature'] ?? '');

if ($reservation_id <= 0 || $order_id === '' || !in_array($payment_type, ['down_payment', 'balance'], true)) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}
$expected_signature = hash_hmac('sha256', $reservation_id . '|' . $payment_type, $paypal_client_secret);
if (!hash_equals($expected_signature, $signature)) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}

$reservation_response = supabase_request('GET', 'reservations', [
    'select' => 'id,customer_id,caterer_id,advance_payment,balance_amount,payment_status,reservation_status',
    'id' => 'eq.' . $reservation_id,
    'limit' => '1',
]);
$reservation = supabase_row($reservation_response);
if (!$reservation) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}
$expected_payee_email = strtolower(trim(get_admin_paypal_email()));
if (!filter_var($expected_payee_email, FILTER_VALIDATE_EMAIL)) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}

$existing = supabase_request('GET', 'payments', [
    'select' => 'id,amount,payment_status,payment_type',
    'reservation_id' => 'eq.' . $reservation_id,
    'reference_number' => 'eq.' . $order_id,
    'limit' => '1',
]);
if (!$existing['ok']) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}
$payment_row = supabase_row($existing);
if ($payment_row && (($payment_row['payment_status'] ?? '') !== 'completed' || ($payment_row['payment_type'] ?? '') !== $payment_type)) {
    error_log('Existing payment does not match the completed PayPal return for reservation ' . $reservation_id . '.');
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}
if (!$payment_row) {
    if ($payment_type === 'down_payment' && ($reservation['reservation_status'] !== 'pending' || $reservation['payment_status'] !== 'pending')) {
        header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
        exit;
    }
    if ($payment_type === 'balance') {
        if ($reservation['reservation_status'] !== 'confirmed' || $reservation['payment_status'] !== 'partial') {
            header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
            exit;
        }
        $completed_balance = supabase_request('GET', 'payments', [
            'select' => 'id',
            'reservation_id' => 'eq.' . $reservation_id,
            'payment_type' => 'eq.balance',
            'payment_status' => 'eq.completed',
            'limit' => '1',
        ]);
        if (!$completed_balance['ok'] || supabase_row($completed_balance)) {
            header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
            exit;
        }
    }
    $token = paypal_access_token();
    if (!$token['ok']) {
        error_log('PayPal order verification failed for reservation ' . $reservation_id . ': ' . ($token['error'] ?? 'unknown error'));
        header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
        exit;
    }
    $order = paypal_request_with_token('GET', '/v2/checkout/orders/' . rawurlencode($order_id), null, $token['token']);
    $purchase_unit = $order['data']['purchase_units'][0] ?? [];
    $order_payee_email = strtolower(trim((string) ($purchase_unit['payee']['email_address'] ?? '')));
    $expected_amount = $payment_type === 'balance' ? (float) $reservation['balance_amount'] : (float) $reservation['advance_payment'];
    $order_amount = (float) ($purchase_unit['amount']['value'] ?? 0);
    if (
        !$order['ok']
        || (string) ($purchase_unit['reference_id'] ?? '') !== (string) $reservation_id
        || $order_payee_email !== $expected_payee_email
        || strtoupper((string) ($purchase_unit['amount']['currency_code'] ?? '')) !== 'PHP'
        || round($order_amount, 2) !== round($expected_amount, 2)
    ) {
        error_log('PayPal order does not match the booking or caterer for reservation ' . $reservation_id . '.');
        header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
        exit;
    }
    $capture = capture_paypal_order($order_id);
    if (!$capture['ok']) {
        error_log('PayPal capture failed for reservation ' . $reservation_id . ', order ' . $order_id . ': ' . ($capture['error'] ?? 'unknown error'));
        header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
        exit;
    }

    $payment_amount = $payment_type === 'balance' ? (float) $reservation['balance_amount'] : (float) $reservation['advance_payment'];
    $capture_data = $capture['data'] ?? [];
    $payer_email = $capture_data['payer']['email_address'] ?? null;
    $payer_name = trim(($capture_data['payer']['name']['given_name'] ?? '') . ' ' . ($capture_data['payer']['name']['surname'] ?? '')) ?: null;
    $captured_payee_email = strtolower(trim((string) ($capture_data['purchase_units'][0]['payee']['email_address'] ?? '')));
    if ($captured_payee_email !== '' && $captured_payee_email !== $expected_payee_email) {
        error_log('PayPal capture recipient differed from the verified order for reservation ' . $reservation_id . '.');
    }
    $payee_email = $captured_payee_email ?: $expected_payee_email;
    $capture_id = $capture_data['purchase_units'][0]['payments']['captures'][0]['id'] ?? $order_id;

    $payment = supabase_request('POST', 'payments', [], [
        'reservation_id' => $reservation_id,
        'amount' => $payment_amount,
        'payment_method' => 'paypal',
        'payment_date' => date('Y-m-d'),
        'reference_number' => $order_id,
        'payment_status' => 'completed',
        'provider' => 'paypal',
        'external_id' => $capture_id,
        'webhook_payload' => json_encode($capture_data),
        'payment_type' => $payment_type,
        'payer_email' => $payer_email,
        'payer_name' => $payer_name,
        'payee_email' => $payee_email,
    ]);
    $payment_row = supabase_row($payment);
    if (!$payment_row) {
        error_log('PayPal payment was captured but could not be saved for reservation ' . $reservation_id . ': ' . json_encode($payment['data'] ?? null));
        header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
        exit;
    }
}

if ($payment_type === 'down_payment' && $reservation['payment_status'] === 'pending') {
    $updated = supabase_request('PATCH', 'reservations', [
        'id' => 'eq.' . $reservation_id,
        'customer_id' => 'eq.' . $reservation['customer_id'],
        'payment_status' => 'eq.pending',
    ], ['payment_status' => 'partial']);
    if (!$updated['ok'] || !supabase_row($updated)) {
        $latest = supabase_request('GET', 'reservations', [
            'select' => 'payment_status',
            'id' => 'eq.' . $reservation_id,
            'customer_id' => 'eq.' . $reservation['customer_id'],
            'limit' => '1',
        ]);
        $latest_reservation = supabase_row($latest);
        if (!$latest['ok'] || !in_array($latest_reservation['payment_status'] ?? '', ['partial', 'completed'], true)) {
            error_log('PayPal payment was saved but reservation payment status could not be updated for reservation ' . $reservation_id . '.');
            header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
            exit;
        }
    }
}

if ($payment_type === 'balance' && $reservation['payment_status'] === 'partial') {
    $updated = supabase_request('PATCH', 'reservations', [
        'id' => 'eq.' . $reservation_id,
        'customer_id' => 'eq.' . $reservation['customer_id'],
        'reservation_status' => 'eq.confirmed',
        'payment_status' => 'eq.partial',
    ], ['payment_status' => 'completed']);
    if (!$updated['ok'] || !supabase_row($updated)) {
        error_log('Balance payment was captured but reservation status could not be updated for reservation ' . $reservation_id . '.');
    }
}

$payment_amount = (float) $payment_row['amount'];
$payout = supabase_request('POST', 'payouts', ['on_conflict' => 'payment_id'], [
    'reservation_id' => $reservation_id,
    'caterer_id' => $reservation['caterer_id'],
    'payment_id' => $payment_row['id'],
    'gross_amount' => $payment_amount,
    'platform_fee' => 0,
    'caterer_amount' => $payment_amount,
    'payout_status' => 'pending',
], 'resolution=merge-duplicates,return=representation');
if (!$payout['ok']) {
    error_log('Supabase payout record failed for reservation ' . $reservation_id . ': ' . json_encode($payout['data']));
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}

header('Location: ' . $frontend_url . '/dashboard/customer?payment=success');
exit;
