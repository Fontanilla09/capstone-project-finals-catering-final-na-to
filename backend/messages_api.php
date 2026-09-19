<?php
session_start();
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

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
$body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$customer_id = (int) ($body['customer_id'] ?? $customer_id);
$caterer_id = (int) ($body['caterer_id'] ?? $caterer_id);
$package_id = (int) ($body['package_id'] ?? $package_id);

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
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $message = trim($body['message'] ?? '');
    $attachment = null;
    if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE); $mime = finfo_file($finfo, $_FILES['attachment']['tmp_name']); $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
        if (!isset($allowed[$mime])) { http_response_code(422); echo json_encode(['error' => 'Chat photo must be JPG, PNG, or WEBP.']); exit; }
        if ($_FILES['attachment']['size'] > 8 * 1024 * 1024) { http_response_code(422); echo json_encode(['error' => 'Chat photo must not exceed 8MB.']); exit; }
        $upload_dir = __DIR__ . '/../uploads/messages/'; if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true); $filename = 'message_' . bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
        if (!move_uploaded_file($_FILES['attachment']['tmp_name'], $upload_dir . $filename)) { http_response_code(500); echo json_encode(['error' => 'Unable to save chat photo.']); exit; }
        $attachment = '/uploads/messages/' . $filename; finfo_close($finfo);
    }
    if ($message === '' && !$attachment) { http_response_code(422); echo json_encode(['error' => 'Write a message or attach a photo.']); exit; }
    $receiver_id = $current_user_id === $customer_user_id ? $caterer_user_id : $customer_user_id;
    if ($package_id > 0) { $insert = $conn->prepare('INSERT INTO messages (reservation_id, package_id, sender_id, receiver_id, message, attachment) VALUES (NULL, ?, ?, ?, ?, ?)'); $insert->bind_param('iiiss', $package_id, $current_user_id, $receiver_id, $message, $attachment); }
    else { $insert = $conn->prepare('INSERT INTO messages (reservation_id, package_id, sender_id, receiver_id, message, attachment) VALUES (NULL, NULL, ?, ?, ?, ?)'); $insert->bind_param('iiss', $current_user_id, $receiver_id, $message, $attachment); }
    if (!$insert->execute()) { http_response_code(500); echo json_encode(['error' => 'Unable to send message.']); exit; }
    echo json_encode(['success' => true]); exit;
}
$mark_read = $conn->prepare('UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND package_id ' . ($package_id > 0 ? '= ?' : 'IS NULL'));
$sender_id = $customer_user_id === $current_user_id ? $caterer_user_id : $customer_user_id;
if ($package_id > 0) { $mark_read->bind_param('iii', $current_user_id, $sender_id, $package_id); }
else { $mark_read->bind_param('ii', $current_user_id, $sender_id); }
$mark_read->execute();
if ($package_id > 0) {
    $messages = $conn->prepare('SELECT id, message, attachment, created_at, sender_id FROM messages WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND package_id = ? ORDER BY id ASC');
    $messages->bind_param('iiiii', $customer_user_id, $caterer_user_id, $caterer_user_id, $customer_user_id, $package_id);
} else {
    $messages = $conn->prepare('SELECT id, message, attachment, created_at, sender_id FROM messages WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND package_id IS NULL ORDER BY id ASC');
    $messages->bind_param('iiii', $customer_user_id, $caterer_user_id, $caterer_user_id, $customer_user_id);
}
$messages->execute();
$rows = $messages->get_result()->fetch_all(MYSQLI_ASSOC);
$messages->close();

echo json_encode(['messages' => $rows]);
?>
