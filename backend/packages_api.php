<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

require_once __DIR__ . '/config.php';
$search = trim($_GET['search'] ?? '');
$event_type = trim($_GET['event_type'] ?? '');
$sort = $_GET['sort'] ?? 'newest';
$order = match ($sort) {
    'price_low' => 'p.price ASC', 'price_high' => 'p.price DESC', 'rating' => 'rating DESC', default => 'p.created_at DESC'
};

$sql = 'SELECT p.id, p.package_name, p.event_type, p.price, p.guest_count_min, p.guest_count_max, p.max_bookings, (SELECT COUNT(*) FROM reservations rb WHERE rb.package_id = p.id AND rb.reservation_status <> "cancelled") AS booking_count, (p.max_bookings > 0 AND (SELECT COUNT(*) FROM reservations rf WHERE rf.package_id = p.id AND rf.reservation_status <> "cancelled") >= p.max_bookings) AS is_full, p.description, (SELECT image_path FROM package_images pi WHERE pi.package_id = p.id ORDER BY pi.created_at ASC LIMIT 1) AS image_path, c.id AS caterer_id, c.business_name, COALESCE(ROUND(AVG(rv.rating), 1), 0) AS rating, c.city FROM packages p JOIN caterers c ON p.caterer_id = c.id LEFT JOIN reviews rv ON rv.caterer_id = c.id WHERE c.is_verified = 1';
$params = []; $types = '';
if ($search !== '') { $sql .= ' AND (p.package_name LIKE ? OR c.business_name LIKE ?)'; $term = '%' . $search . '%'; $params = [$term, $term]; $types = 'ss'; }
if ($event_type !== '') { $sql .= ' AND p.event_type = ?'; $params[] = $event_type; $types .= 's'; }
$sql .= ' GROUP BY p.id, p.package_name, p.event_type, p.price, p.guest_count_min, p.guest_count_max, p.max_bookings, p.description, c.id, c.business_name, c.city ORDER BY ' . $order;
$statement = $conn->prepare($sql);
if ($params) $statement->bind_param($types, ...$params);
$statement->execute();
$packages = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
$types_result = $conn->query("SELECT DISTINCT event_type FROM packages WHERE event_type IS NOT NULL AND event_type != '' ORDER BY event_type");
echo json_encode(['packages' => $packages, 'event_types' => $types_result->fetch_all(MYSQLI_ASSOC)]);