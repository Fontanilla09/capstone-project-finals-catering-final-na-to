<?php
session_start();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/paypal_handler.php';
$app_url = rtrim($paypal_env['APP_URL'] ?? getenv('APP_URL') ?: 'http://localhost:5174', '/');
$frontend_url = rtrim($paypal_env['FRONTEND_URL'] ?? getenv('FRONTEND_URL') ?: 'http://localhost:5175', '/');

$customer_id = intval($_SESSION['customer_id'] ?? 0);
$reservation_id = intval($_POST['reservation_id'] ?? 0);

if ($customer_id <= 0 || $reservation_id <= 0) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}

$stmt = $conn->prepare("SELECT r.id, r.balance_amount, r.reservation_status, p.package_name, c.paypal_email FROM reservations r JOIN packages p ON p.id = r.package_id JOIN caterers c ON c.id = r.caterer_id WHERE r.id = ? AND r.customer_id = ? AND r.reservation_status = 'confirmed' AND r.payment_status = 'partial' LIMIT 1");
$stmt->bind_param('ii', $reservation_id, $customer_id);
$stmt->execute();
$reservation = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$reservation || (float) $reservation['balance_amount'] <= 0) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}

if (!filter_var(trim((string) ($reservation['paypal_email'] ?? '')), FILTER_VALIDATE_EMAIL)) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}
$order = create_paypal_order($reservation_id, (float) $reservation['balance_amount'], 'Balance payment for ' . $reservation['package_name'], 'balance', $reservation['paypal_email']);
if (!$order['ok']) {
    header('Location: ' . $frontend_url . '/dashboard/customer?payment=failed');
    exit;
}

header('Location: ' . $order['approval_url']);
exit;
?>