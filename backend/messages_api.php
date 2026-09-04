<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_id']) || !in_array($_SESSION['role'], ['customer', 'caterer'], true)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

require_once __DIR__ . '/config.php';

$current_user_id = (int) $_SESSION['user_id'];
$customer_id = (int) ($_GET['customer_id'] ?? 0);
$caterer_id = (int) ($_GET['caterer_id'] ?? 0);
$package_id = (int) ($_GET['package_id'] ?? 0);

if ($_SESSION['role'] === 'customer') {
    $customer_id = (int) ($_SESSION['customer_id'] ?? 0);
} else {
    $caterer_id = (int) ($_SESSION['caterer_id'] ?? 0);
}

if ($customer_id <= 0 || $caterer_id <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing conversation details']);
    exit;
}

$people = $conn->prepare('SELECT c.user_id AS customer_user_id, ca.user_id AS caterer_user_id FROM customers c JOIN caterers ca ON ca.id = ? WHERE c.id = ? LIMIT 1');
$people->bind_param('ii', $caterer_id, $customer_id);
$people->execute();
$people_row = $people->get_result()->fetch_assoc();
$people->close();

if (!$people_row || !in_array($current_user_id, [(int) $people_row['customer_user_id'], (int) $people_row['caterer_user_id']], true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Conversation access denied']);
    exit;
}

$customer_user_id = (int) $people_row['customer_user_id'];
$caterer_user_id = (int) $people_row['caterer_user_id'];
if ($package_id > 0) {
    $messages = $conn->prepare('SELECT id, message, created_at, sender_id FROM messages WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND package_id = ? ORDER BY id ASC');
    $messages->bind_param('iiiii', $customer_user_id, $caterer_user_id, $caterer_user_id, $customer_user_id, $package_id);
} else {
    $messages = $conn->prepare('SELECT id, message, created_at, sender_id FROM messages WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND package_id IS NULL ORDER BY id ASC');
    $messages->bind_param('iiii', $customer_user_id, $caterer_user_id, $caterer_user_id, $customer_user_id);
}
$messages->execute();
$rows = $messages->get_result()->fetch_all(MYSQLI_ASSOC);
$messages->close();

echo json_encode(['messages' => $rows]);
?>
