<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/config.php';
if (!isset($_SESSION['user_id'], $_SESSION['role'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized.']); exit; }
$role = $_SESSION['role'];
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

if ($action === 'unread_messages' && in_array($role, ['customer', 'caterer'], true)) {
    $user_id = (int) $_SESSION['user_id'];
    $stmt = $conn->prepare('SELECT COUNT(*) AS unread_count FROM messages WHERE receiver_id = ? AND is_read = 0');
    $stmt->bind_param('i', $user_id); $stmt->execute();
    echo json_encode(['unread_count' => (int) $stmt->get_result()->fetch_assoc()['unread_count']]); exit;
}

if ($action === 'customer_reservations' && $role === 'customer') {
    $id = (int) $_SESSION['customer_id'];
    $profile = $conn->prepare('SELECT c.full_name, u.email FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ? LIMIT 1');
    $profile->bind_param('i', $id); $profile->execute(); $customer = $profile->get_result()->fetch_assoc() ?: [];
    $stmt = $conn->prepare("SELECT r.id, p.package_name, c.business_name, r.event_date, r.guest_count, r.total_amount, r.balance_amount, r.payment_status, r.reservation_status, COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.reservation_id = r.id AND pay.payment_status = 'completed'), 0) AS paid_amount, rv.rating AS review_rating, rv.review_text FROM reservations r JOIN packages p ON r.package_id = p.id JOIN caterers c ON r.caterer_id = c.id LEFT JOIN reviews rv ON rv.reservation_id = r.id AND rv.customer_id = r.customer_id WHERE r.customer_id = ? ORDER BY r.event_date DESC");
    $stmt->bind_param('i', $id); $stmt->execute(); echo json_encode(['customer' => $customer, 'reservations' => $stmt->get_result()->fetch_all(MYSQLI_ASSOC)]); exit;
}

if ($action === 'submit_review' && $role === 'customer') {
    $customer_id = (int) $_SESSION['customer_id']; $reservation_id = (int) ($input['reservation_id'] ?? 0); $rating = (int) ($input['rating'] ?? 0); $review_text = trim($input['review_text'] ?? '');
    if ($rating < 1 || $rating > 5) { http_response_code(422); echo json_encode(['error' => 'Choose a rating from 1 to 5 stars.']); exit; }
    $check = $conn->prepare("SELECT r.id, r.caterer_id FROM reservations r LEFT JOIN reviews rv ON rv.reservation_id = r.id AND rv.customer_id = ? WHERE r.id = ? AND r.customer_id = ? AND r.payment_status = 'completed' AND (r.reservation_status = 'completed' OR r.event_date < CURDATE()) AND rv.id IS NULL LIMIT 1");
    $check->bind_param('iii', $customer_id, $reservation_id, $customer_id); $check->execute(); $reservation = $check->get_result()->fetch_assoc();
    if (!$reservation) { http_response_code(422); echo json_encode(['error' => 'This booking is not ready for a review or has already been reviewed.']); exit; }
    $review_image = null;
    if (isset($_FILES['review_image']) && $_FILES['review_image']['error'] === UPLOAD_ERR_OK) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE); $mime = finfo_file($finfo, $_FILES['review_image']['tmp_name']); $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
        if (!isset($allowed[$mime])) { http_response_code(422); echo json_encode(['error' => 'Review photo must be JPG, PNG, or WEBP.']); exit; }
        $upload_dir = __DIR__ . '/../uploads/reviews/'; if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true); $filename = 'review_' . $reservation_id . '_' . bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
        if (!move_uploaded_file($_FILES['review_image']['tmp_name'], $upload_dir . $filename)) { http_response_code(500); echo json_encode(['error' => 'Unable to save review photo.']); exit; }
        $review_image = '/uploads/reviews/' . $filename; finfo_close($finfo);
    }
    $insert = $conn->prepare('INSERT INTO reviews (reservation_id, customer_id, caterer_id, rating, review_text, review_image) VALUES (?, ?, ?, ?, ?, ?)'); $insert->bind_param('iiiiss', $reservation_id, $customer_id, $reservation['caterer_id'], $rating, $review_text, $review_image); $insert->execute(); echo json_encode(['success' => true]); exit;
}

if ($action === 'caterer_overview' && $role === 'caterer') {
    $id = (int) $_SESSION['caterer_id'];
    $stats = [];
    foreach (['packages' => 'SELECT COUNT(*) count FROM packages WHERE caterer_id = ?', 'reservations' => "SELECT COUNT(*) count FROM reservations WHERE caterer_id = ? AND reservation_status IN ('pending','confirmed')", 'upcoming' => "SELECT COUNT(*) count FROM reservations WHERE caterer_id = ? AND event_date >= CURDATE() AND reservation_status = 'confirmed'"] as $key => $sql) { $stmt = $conn->prepare($sql); $stmt->bind_param('i', $id); $stmt->execute(); $stats[$key] = $stmt->get_result()->fetch_assoc()['count']; }
    $rating = $conn->prepare('SELECT IFNULL(ROUND(AVG(rating), 1), 0) value FROM reviews WHERE caterer_id = ?'); $rating->bind_param('i', $id); $rating->execute(); $stats['rating'] = $rating->get_result()->fetch_assoc()['value']; echo json_encode(['stats' => $stats]); exit;
}

if ($action === 'admin_overview' && $role === 'admin') {
    $stats = [];
    foreach (['caterers' => 'SELECT COUNT(*) count FROM caterers', 'verified' => 'SELECT COUNT(*) count FROM caterers WHERE is_verified = 1', 'customers' => 'SELECT COUNT(*) count FROM customers', 'pending' => 'SELECT COUNT(*) count FROM caterers WHERE is_verified = 0', 'customer_pending' => 'SELECT COUNT(*) count FROM customers WHERE is_verified = 0'] as $key => $sql) {
        $result = $conn->query($sql);
        $stats[$key] = $result ? (int) $result->fetch_assoc()['count'] : 0;
    }
    $payouts = $conn->query("SELECT po.id, po.reservation_id, po.caterer_amount, po.payout_status, c.business_name, c.paypal_email, p.package_name FROM payouts po JOIN caterers c ON c.id = po.caterer_id JOIN reservations r ON r.id = po.reservation_id JOIN packages p ON p.id = r.package_id ORDER BY po.created_at DESC");
    echo json_encode(['stats' => $stats, 'payouts' => $payouts ? $payouts->fetch_all(MYSQLI_ASSOC) : []]); exit;
}

if ($action === 'caterer_profile' && $role === 'caterer') {
    $id = (int) $_SESSION['caterer_id'];
    $stmt = $conn->prepare('SELECT c.id, c.business_name, c.phone, c.address, c.city, c.description, c.business_permit, c.paypal_email, c.is_verified, c.verification_submitted, u.email FROM caterers c JOIN users u ON c.user_id = u.id WHERE c.id = ?');
    $stmt->bind_param('i', $id); $stmt->execute(); echo json_encode(['caterer' => $stmt->get_result()->fetch_assoc()]); exit;
}

if ($action === 'update_profile' && $role === 'caterer') {
    $id = (int) $_SESSION['caterer_id']; $business = trim($input['business_name'] ?? ''); $phone = trim($input['phone'] ?? ''); $address = trim($input['address'] ?? ''); $city = trim($input['city'] ?? ''); $description = trim($input['description'] ?? ''); $paypal = trim($input['paypal_email'] ?? '');
    if ($business === '' || $phone === '' || $address === '' || $city === '' || ($paypal !== '' && !filter_var($paypal, FILTER_VALIDATE_EMAIL))) { http_response_code(422); echo json_encode(['error' => 'Complete the required fields and enter a valid PayPal email.']); exit; }
    $stmt = $conn->prepare('UPDATE caterers SET business_name = ?, phone = ?, address = ?, city = ?, description = ?, paypal_email = ? WHERE id = ?'); $stmt->bind_param('ssssssi', $business, $phone, $address, $city, $description, $paypal, $id); $stmt->execute(); echo json_encode(['success' => true]); exit;
}

if ($action === 'submit_verification' && $role === 'caterer') {
    $id = (int) $_SESSION['caterer_id']; $check = $conn->prepare('SELECT business_permit FROM caterers WHERE id = ?'); $check->bind_param('i', $id); $check->execute(); $row = $check->get_result()->fetch_assoc();
    if (!$row || !$row['business_permit']) { http_response_code(422); echo json_encode(['error' => 'Upload a business permit first.']); exit; }
    $stmt = $conn->prepare('UPDATE caterers SET verification_submitted = 1, is_verified = 0 WHERE id = ?'); $stmt->bind_param('i', $id); $stmt->execute(); echo json_encode(['success' => true]); exit;
}

if ($action === 'services' && $role === 'caterer') {
    $id = (int) $_SESSION['caterer_id']; $stmt = $conn->prepare("SELECT p.id, p.package_name, p.event_type, p.price, p.guest_count_min, p.guest_count_max, p.max_bookings, p.description, p.includes, COUNT(CASE WHEN r.reservation_status <> 'cancelled' THEN r.id END) AS booking_count FROM packages p LEFT JOIN reservations r ON r.package_id = p.id WHERE p.caterer_id = ? GROUP BY p.id ORDER BY p.created_at DESC"); $stmt->bind_param('i', $id); $stmt->execute(); echo json_encode(['services' => $stmt->get_result()->fetch_all(MYSQLI_ASSOC)]); exit;
}

if ($action === 'create_service' && $role === 'caterer') {
    $name = trim($input['package_name'] ?? ''); $event = trim($input['event_type'] ?? ''); $range = preg_replace('/\s+/', '', trim($input['guest_range'] ?? '')); $price = (float) ($input['price'] ?? 0); $max_bookings = (int) ($input['max_bookings'] ?? 0); $description = trim($input['description'] ?? ''); $includes = trim($input['features'] ?? ''); $parts = explode('-', $range); $min = (int) ($parts[0] ?? 0); $max = (int) ($parts[1] ?? $min);
    if ($name === '' || $event === '' || $min <= 0 || $max <= 0 || $price <= 0 || $max_bookings < 0) { http_response_code(422); echo json_encode(['error' => 'Complete the service fields with a valid guest range, price, and booking limit.']); exit; }
    $id = (int) $_SESSION['caterer_id']; $stmt = $conn->prepare('INSERT INTO packages (caterer_id, package_name, event_type, price, guest_count_min, guest_count_max, max_bookings, description, includes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'); $stmt->bind_param('issdiiiss', $id, $name, $event, $price, $min, $max, $max_bookings, $description, $includes); $stmt->execute(); echo json_encode(['success' => true, 'package_id' => $stmt->insert_id]); exit;
}

if ($action === 'delete_service' && $role === 'caterer') {
    $id = (int) $_SESSION['caterer_id']; $package = (int) ($input['package_id'] ?? 0); $stmt = $conn->prepare('DELETE FROM packages WHERE id = ? AND caterer_id = ?'); $stmt->bind_param('ii', $package, $id); $stmt->execute(); echo json_encode(['success' => true]); exit;
}

if ($action === 'update_service' && $role === 'caterer') {
    $id = (int) $_SESSION['caterer_id']; $package = (int) ($input['package_id'] ?? 0); $name = trim($input['package_name'] ?? ''); $event = trim($input['event_type'] ?? ''); $parts = explode('-', preg_replace('/\s+/', '', $input['guest_range'] ?? '')); $min = (int) ($parts[0] ?? 0); $max = (int) ($parts[1] ?? $min); $price = (float) ($input['price'] ?? 0); $max_bookings = (int) ($input['max_bookings'] ?? 0); $description = trim($input['description'] ?? ''); $includes = trim($input['features'] ?? '');
    if (!$package || !$name || !$event || $min <= 0 || $max <= 0 || $price <= 0 || $max_bookings < 0) { http_response_code(422); echo json_encode(['error' => 'Complete the service fields with a valid booking limit.']); exit; }
    $stmt = $conn->prepare('UPDATE packages SET package_name = ?, event_type = ?, price = ?, guest_count_min = ?, guest_count_max = ?, max_bookings = ?, description = ?, includes = ? WHERE id = ? AND caterer_id = ?'); $stmt->bind_param('ssdiiissii', $name, $event, $price, $min, $max, $max_bookings, $description, $includes, $package, $id); $stmt->execute(); echo json_encode(['success' => true]); exit;
}

if ($action === 'caterer_reservations' && $role === 'caterer') {
    $id = (int) $_SESSION['caterer_id']; $stmt = $conn->prepare("SELECT r.id, cu.full_name AS customer_name, p.package_name, r.event_date, r.event_time, r.guest_count, r.location, r.advance_payment, r.payment_status, r.reservation_status FROM reservations r JOIN customers cu ON r.customer_id = cu.id JOIN packages p ON r.package_id = p.id WHERE r.caterer_id = ? AND r.payment_status = 'completed' ORDER BY r.event_date DESC"); $stmt->bind_param('i', $id); $stmt->execute(); echo json_encode(['reservations' => $stmt->get_result()->fetch_all(MYSQLI_ASSOC)]); exit;
}

if ($action === 'conversations' && in_array($role, ['customer', 'caterer'], true)) {
    $user_id = (int) $_SESSION['user_id'];
    $stmt = $conn->prepare('SELECT MAX(m.package_id) package_id, MAX(m.created_at) last_message, u.id other_user_id, u.email other_email, c.id customer_id, c.full_name, ca.id caterer_id, ca.business_name FROM messages m JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END LEFT JOIN customers c ON c.user_id = u.id LEFT JOIN caterers ca ON ca.user_id = u.id WHERE m.sender_id = ? OR m.receiver_id = ? GROUP BY u.id, u.email, c.id, c.full_name, ca.id, ca.business_name ORDER BY last_message DESC');
    $stmt->bind_param('iii', $user_id, $user_id, $user_id); $stmt->execute(); echo json_encode(['conversations' => $stmt->get_result()->fetch_all(MYSQLI_ASSOC)]); exit;
}

if ($action === 'accept_reservation' && $role === 'caterer') {
    $id = (int) $_SESSION['caterer_id']; $reservation = (int) ($input['reservation_id'] ?? 0); $stmt = $conn->prepare("UPDATE reservations SET reservation_status = 'confirmed' WHERE id = ? AND caterer_id = ? AND payment_status = 'completed'"); $stmt->bind_param('ii', $reservation, $id); $stmt->execute(); if ($stmt->affected_rows !== 1) { http_response_code(422); echo json_encode(['error' => 'Reservation cannot be accepted yet.']); exit; } echo json_encode(['success' => true]); exit;
}

if ($action === 'admin_pending' && $role === 'admin') {
    $rows = $conn->query("SELECT c.id, c.business_name, c.phone, c.address, c.city, c.business_permit, c.description, c.is_verified, c.verification_submitted, u.email AS user_email FROM caterers c JOIN users u ON c.user_id = u.id WHERE c.is_verified = 0 ORDER BY c.created_at DESC"); echo json_encode(['caterers' => $rows ? $rows->fetch_all(MYSQLI_ASSOC) : []]); exit;
}

if ($action === 'admin_pending_customers' && $role === 'admin') {
    $rows = $conn->query("SELECT c.id, c.full_name, c.phone, c.city, c.created_at, u.email AS user_email FROM customers c JOIN users u ON u.id = c.user_id WHERE c.is_verified = 0 ORDER BY c.created_at DESC"); echo json_encode(['customers' => $rows ? $rows->fetch_all(MYSQLI_ASSOC) : []]); exit;
}

if (($action === 'approve_customer' || $action === 'reject_customer') && $role === 'admin') {
    $id = (int) ($input['customer_id'] ?? 0); $sql = $action === 'approve_customer' ? 'UPDATE customers SET is_verified = 1 WHERE id = ?' : 'DELETE FROM customers WHERE id = ?'; $stmt = $conn->prepare($sql); $stmt->bind_param('i', $id); $stmt->execute(); echo json_encode(['success' => true]); exit;
}

if (($action === 'approve_caterer' || $action === 'reject_caterer') && $role === 'admin') {
    $id = (int) ($input['caterer_id'] ?? 0); $sql = $action === 'approve_caterer' ? 'UPDATE caterers SET is_verified = 1, verification_submitted = 0 WHERE id = ?' : 'UPDATE caterers SET is_verified = 0, verification_submitted = 0, business_permit = NULL WHERE id = ?'; $stmt = $conn->prepare($sql); $stmt->bind_param('i', $id); $stmt->execute(); echo json_encode(['success' => true]); exit;
}

if ($action === 'send_payout' && $role === 'admin') {
    require_once __DIR__ . '/paypal_handler.php';
    $payout_id = (int) ($input['payout_id'] ?? 0);
    $query = $conn->prepare("SELECT po.reservation_id, po.caterer_amount, po.payout_status, c.paypal_email FROM payouts po JOIN caterers c ON c.id = po.caterer_id WHERE po.id = ? LIMIT 1");
    $query->bind_param('i', $payout_id); $query->execute(); $payout = $query->get_result()->fetch_assoc();
    if (!$payout || !in_array($payout['payout_status'], ['pending', 'failed'], true) || !filter_var(trim($payout['paypal_email'] ?? ''), FILTER_VALIDATE_EMAIL) || (float) $payout['caterer_amount'] <= 0) { http_response_code(422); echo json_encode(['error' => 'Payout is not ready or the caterer PayPal email is invalid.']); exit; }
    $claim = $conn->prepare("UPDATE payouts SET payout_status = 'processing', payout_error = NULL WHERE id = ? AND payout_status IN ('pending', 'failed')"); $claim->bind_param('i', $payout_id); $claim->execute();
    if ($claim->affected_rows !== 1) { http_response_code(409); echo json_encode(['error' => 'Payout is already being processed.']); exit; }
    $result = create_paypal_payout($payout['paypal_email'], (float) $payout['caterer_amount'], (int) $payout['reservation_id']);
    if (!$result['ok']) { $error = $result['error'] ?? 'PayPal payout failed.'; $update = $conn->prepare("UPDATE payouts SET payout_status = 'failed', payout_error = ? WHERE id = ?"); $update->bind_param('si', $error, $payout_id); $update->execute(); http_response_code(502); echo json_encode(['error' => $error]); exit; }
    $status = strtoupper($result['item_status'] ?? '') === 'SUCCESS' ? 'paid' : 'processing'; $reference = $result['item_id'] ?: $result['batch_id']; $update = $conn->prepare("UPDATE payouts SET payout_status = ?, payout_reference = ?, payout_batch_id = ?, payout_item_id = ?, paid_at = IF(? = 'paid', NOW(), NULL) WHERE id = ?"); $update->bind_param('sssssi', $status, $reference, $result['batch_id'], $result['item_id'], $status, $payout_id); $update->execute(); echo json_encode(['success' => true, 'status' => $status]); exit;
}

http_response_code(400); echo json_encode(['error' => 'Unknown dashboard action.']);
