<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/config.php'; require_once __DIR__ . '/paypal_handler.php';
if (!isset($_SESSION['customer_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized.']); exit; }
$input = json_decode(file_get_contents('php://input'), true) ?: $_POST; $reservation_id = (int) ($input['reservation_id'] ?? 0); $customer_id = (int) $_SESSION['customer_id'];
$stmt = $conn->prepare("SELECT r.balance_amount, p.package_name, c.paypal_email FROM reservations r JOIN packages p ON p.id = r.package_id JOIN caterers c ON c.id = r.caterer_id WHERE r.id = ? AND r.customer_id = ? AND r.reservation_status = 'confirmed' AND r.payment_status = 'partial' LIMIT 1"); $stmt->bind_param('ii', $reservation_id, $customer_id); $stmt->execute(); $reservation = $stmt->get_result()->fetch_assoc();
if (!$reservation || (float) $reservation['balance_amount'] <= 0) { http_response_code(422); echo json_encode(['error' => 'Balance payment is not available.']); exit; }
if (!filter_var(trim((string) ($reservation['paypal_email'] ?? '')), FILTER_VALIDATE_EMAIL)) { http_response_code(422); echo json_encode(['error' => 'The caterer has not configured a valid PayPal email.']); exit; }
$order = create_paypal_order($reservation_id, (float) $reservation['balance_amount'], 'Balance payment for ' . $reservation['package_name'], 'balance', $reservation['paypal_email']);
if (!$order['ok']) { http_response_code(502); echo json_encode(['error' => $order['error'] ?? 'Unable to start payment.']); exit; }
echo json_encode(['approval_url' => $order['approval_url']]);
