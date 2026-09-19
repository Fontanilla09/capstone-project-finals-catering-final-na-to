<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/config.php';
$package_id = (int) ($_GET['id'] ?? 0);
$caterer_id = (int) ($_GET['caterer'] ?? 0);
$query = $conn->prepare('SELECT p.id, p.package_name, p.event_type, p.price, p.guest_count_min, p.guest_count_max, p.max_bookings, (SELECT COUNT(*) FROM reservations rb WHERE rb.package_id = p.id AND rb.reservation_status <> "cancelled") AS booking_count, (p.max_bookings > 0 AND (SELECT COUNT(*) FROM reservations rf WHERE rf.package_id = p.id AND rf.reservation_status <> "cancelled") >= p.max_bookings) AS is_full, p.description, p.includes, c.id AS caterer_id, c.business_name, c.gcash_qr_code, COALESCE(ROUND(AVG(rv.rating), 1), 0) AS rating, c.city FROM packages p JOIN caterers c ON p.caterer_id = c.id LEFT JOIN reviews rv ON rv.caterer_id = c.id WHERE p.id = ? AND c.id = ? AND c.is_verified = 1 GROUP BY p.id, p.package_name, p.event_type, p.price, p.guest_count_min, p.guest_count_max, p.max_bookings, p.description, p.includes, c.id, c.business_name, c.gcash_qr_code, c.city LIMIT 1');
$query->bind_param('ii', $package_id, $caterer_id);
$query->execute();
$package = $query->get_result()->fetch_assoc();
if (!$package) { http_response_code(404); echo json_encode(['error' => 'Package not found.']); exit; }
$images = $conn->prepare('SELECT image_path FROM package_images WHERE package_id = ? ORDER BY created_at ASC');
$images->bind_param('i', $package_id); $images->execute();
$package['images'] = array_column($images->get_result()->fetch_all(MYSQLI_ASSOC), 'image_path');
$reviews = $conn->prepare('SELECT rv.rating, rv.review_text, rv.review_image, rv.created_at, cu.full_name FROM reviews rv JOIN customers cu ON cu.id = rv.customer_id WHERE rv.caterer_id = ? ORDER BY rv.created_at DESC');
$reviews->bind_param('i', $caterer_id); $reviews->execute();
$package['reviews'] = $reviews->get_result()->fetch_all(MYSQLI_ASSOC);
echo json_encode(['package' => $package]);