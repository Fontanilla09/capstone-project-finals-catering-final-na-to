<?php
session_start();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/paypal_handler.php';
$app_url = rtrim($paypal_env['APP_URL'] ?? getenv('APP_URL') ?: 'http://localhost:5174', '/');
$frontend_url = rtrim($paypal_env['FRONTEND_URL'] ?? getenv('FRONTEND_URL') ?: 'http://localhost:5175', '/');

$reservation_id = intval($_GET['reservation_id'] ?? 0);
$order_id = trim($_GET['token'] ?? '');
$payment_type = $_GET['payment_type'] ?? 'down_payment';
$signature = $_GET['signature'] ?? '';

if ($reservation_id <= 0 || $order_id === '' || !in_array($payment_type, ['down_payment', 'balance'], true)) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}

$expected_signature = hash_hmac('sha256', $reservation_id . '|' . $payment_type, $paypal_client_secret);
if (!hash_equals($expected_signature, $signature)) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}

$stmt = $conn->prepare('SELECT id, customer_id, caterer_id, advance_payment, balance_amount, payment_status, reservation_status FROM reservations WHERE id = ? LIMIT 1');
$stmt->bind_param('i', $reservation_id);
$stmt->execute();
$reservation = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$reservation) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}
$customer_id = (int) $reservation['customer_id'];

$existing = $conn->prepare('SELECT id FROM payments WHERE reservation_id = ? AND reference_number = ? LIMIT 1');
$existing->bind_param('is', $reservation_id, $order_id);
$existing->execute();
$already_paid = $existing->get_result()->fetch_assoc();
$existing->close();

if (!$already_paid) {
    if ($payment_type === 'balance' && $reservation['reservation_status'] !== 'confirmed') {
        header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
        exit;
    }
    $capture = capture_paypal_order($order_id);
    if (!$capture['ok']) {
        error_log('PayPal capture failed for reservation ' . $reservation_id . ', order ' . $order_id . ': ' . ($capture['error'] ?? 'unknown error'));
        header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
        exit;
    }

    $conn->begin_transaction();
    try {
        if ($payment_type !== 'balance') {
            $update = $conn->prepare("UPDATE reservations SET payment_status = 'completed' WHERE id = ? AND customer_id = ? AND payment_status = 'pending'");
            $update->bind_param('ii', $reservation_id, $customer_id);
            if (!$update->execute() || $update->affected_rows !== 1) {
                throw new RuntimeException('Unable to update reservation payment status.');
            }
            $update->close();
        } elseif ($reservation['reservation_status'] !== 'confirmed') {
            throw new RuntimeException('Balance payment requires a confirmed reservation.');
        }

        $payment_amount = $payment_type === 'balance' ? $reservation['balance_amount'] : $reservation['advance_payment'];
        $capture_data = $capture['data'] ?? [];
        $payer_email = $capture_data['payer']['email_address'] ?? null;
        $payer_name = trim(($capture_data['payer']['name']['given_name'] ?? '') . ' ' . ($capture_data['payer']['name']['surname'] ?? '')) ?: null;
        $capture_id = $capture_data['purchase_units'][0]['payments']['captures'][0]['id'] ?? $order_id;
        $payment = $conn->prepare("INSERT INTO payments (reservation_id, amount, payment_method, payment_date, reference_number, payment_status, provider, external_id, webhook_payload, payment_type, payer_email, payer_name) VALUES (?, ?, 'paypal', CURDATE(), ?, 'completed', 'paypal', ?, ?, ?, ?, ?)");
        $capture_json = json_encode($capture_data);
        $payment->bind_param('idssssss', $reservation_id, $payment_amount, $order_id, $capture_id, $capture_json, $payment_type, $payer_email, $payer_name);
        if (!$payment->execute()) {
            throw new RuntimeException('Unable to record payment.');
        }
        $payment_id = $payment->insert_id;
        $payment->close();

        $gross_amount = (float) $payment_amount;
        $platform_fee = round($gross_amount * 0.10, 2);
        $caterer_amount = round($gross_amount - $platform_fee, 2);
        $payout = $conn->prepare("INSERT INTO payouts (reservation_id, caterer_id, payment_id, gross_amount, platform_fee, caterer_amount) SELECT r.id, r.caterer_id, ?, ?, ?, ? FROM reservations r WHERE r.id = ? ON DUPLICATE KEY UPDATE gross_amount = gross_amount + VALUES(gross_amount), platform_fee = platform_fee + VALUES(platform_fee), caterer_amount = caterer_amount + VALUES(caterer_amount), payment_id = VALUES(payment_id)");
        $payout->bind_param('idddi', $payment_id, $gross_amount, $platform_fee, $caterer_amount, $reservation_id);
        if (!$payout->execute()) {
            throw new RuntimeException('Unable to create payout record.');
        }
        $payout->close();
        $conn->commit();

        $auto_payout = trigger_auto_payout_for_reservation($conn, $reservation_id);
        if (!$auto_payout['ok'] && empty($auto_payout['skipped'])) {
            error_log('Auto payout failed for reservation ' . $reservation_id . ': ' . ($auto_payout['error'] ?? 'unknown error'));
        }
    } catch (Throwable $exception) {
        $conn->rollback();
        error_log('Payment recording failed for reservation ' . $reservation_id . ', order ' . $order_id . ': ' . $exception->getMessage());
        header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
        exit;
    }
}

header('Location: ' . $frontend_url . '/dashboard/customer?payment=success');
exit;
?>
