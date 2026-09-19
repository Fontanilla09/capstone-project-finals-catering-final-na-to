<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/config.php';
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'customer') { http_response_code(401); echo json_encode(['error' => 'Please sign in as a customer first.']); exit; }
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$package_id = (int) ($input['package_id'] ?? 0); $caterer_id = (int) ($input['caterer_id'] ?? 0); $guest_count = (int) ($input['guest_count'] ?? 0);
$event_date = trim($input['event_date'] ?? ''); $event_time = trim($input['event_time'] ?? ''); $venue_name = trim($input['venue_name'] ?? ''); $venue_address = trim($input['venue_address'] ?? '');
if (!$package_id || !$caterer_id || !$guest_count || !$event_date || !$event_time || !$venue_name || !$venue_address) { http_response_code(422); echo json_encode(['error' => 'Complete all event details.']); exit; }
$query = $conn->prepare("SELECT p.package_name, p.event_type, p.price, p.max_bookings, (SELECT COUNT(*) FROM reservations rb WHERE rb.package_id = p.id AND rb.reservation_status <> 'cancelled') AS booking_count, c.business_name, c.gcash_qr_code FROM packages p JOIN caterers c ON c.id = p.caterer_id WHERE p.id = ? AND c.id = ? AND c.is_verified = 1 LIMIT 1");
$query->bind_param('ii', $package_id, $caterer_id); $query->execute(); $package = $query->get_result()->fetch_assoc();
if (!$package) { http_response_code(404); echo json_encode(['error' => 'Package not found.']); exit; }
if (!$package['gcash_qr_code']) { http_response_code(422); echo json_encode(['error' => 'This caterer has not configured a GCash QR code yet.']); exit; }
if ((int) $package['max_bookings'] > 0 && (int) $package['booking_count'] >= (int) $package['max_bookings']) { http_response_code(422); echo json_encode(['error' => 'This package is full and is no longer accepting bookings.']); exit; }
$customer_id = (int) $_SESSION['customer_id'];
$duplicate = $conn->prepare("SELECT id FROM reservations WHERE customer_id = ? AND package_id = ? AND event_date = ? AND event_time = ? AND reservation_status <> 'cancelled' LIMIT 1");
$duplicate->bind_param('iiss', $customer_id, $package_id, $event_date, $event_time); $duplicate->execute();
if ($duplicate->get_result()->fetch_assoc()) { http_response_code(409); echo json_encode(['error' => 'You already have a booking request for this package, date, and time.']); exit; }
$total = (float) $package['price']; $advance = round($total * .30, 2); $balance = round($total - $advance, 2); $location = $venue_name . ' - ' . $venue_address;
$insert = $conn->prepare("INSERT INTO reservations (customer_id, caterer_id, package_id, event_date, event_time, event_type, location, guest_count, total_amount, advance_payment, balance_amount, payment_status, reservation_status, special_requests) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', '')");
$insert->bind_param('iiissssiddd', $customer_id, $caterer_id, $package_id, $event_date, $event_time, $package['event_type'], $location, $guest_count, $total, $advance, $balance);
if (!$insert->execute()) { http_response_code(500); echo json_encode(['error' => 'Unable to create booking.']); exit; }
$reservation_id = $conn->insert_id;
$payment = $conn->prepare("INSERT INTO payments (reservation_id, amount, payment_method, payment_date, payment_status, provider, payment_type) VALUES (?, ?, 'gcash', CURDATE(), 'pending', 'gcash', 'down_payment')");
$payment->bind_param('id', $reservation_id, $advance);
if (!$payment->execute()) { $conn->query('DELETE FROM reservations WHERE id = ' . $reservation_id); http_response_code(500); echo json_encode(['error' => 'Unable to prepare GCash payment.']); exit; }
echo json_encode(['success' => true, 'reservation_id' => $reservation_id, 'gcash_qr_code' => '/uploads/gcash/' . $package['gcash_qr_code'], 'amount' => $advance]);