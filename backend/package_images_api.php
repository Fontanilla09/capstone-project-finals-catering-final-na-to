<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/config.php';
if (!isset($_SESSION['caterer_id']) || empty($_FILES['images'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized or no images uploaded.']); exit; }
$package_id = (int) ($_POST['package_id'] ?? 0);
$owner = $conn->prepare('SELECT id FROM packages WHERE id = ? AND caterer_id = ? LIMIT 1');
$owner->bind_param('ii', $package_id, $_SESSION['caterer_id']); $owner->execute();
if (!$owner->get_result()->fetch_assoc()) { http_response_code(403); echo json_encode(['error' => 'Package not found.']); exit; }
$upload_dir = __DIR__ . '/../uploads/packages/'; if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true);
$allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp']; $finfo = finfo_open(FILEINFO_MIME_TYPE); $saved = [];
foreach ($_FILES['images']['tmp_name'] as $index => $tmp) {
    if ($_FILES['images']['error'][$index] !== UPLOAD_ERR_OK || !is_uploaded_file($tmp)) continue;
    $mime = finfo_file($finfo, $tmp); if (!isset($allowed[$mime])) continue;
    $filename = 'package_' . $package_id . '_' . bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
    if (move_uploaded_file($tmp, $upload_dir . $filename)) { $path = '/uploads/packages/' . $filename; $insert = $conn->prepare('INSERT INTO package_images (package_id, image_path) VALUES (?, ?)'); $insert->bind_param('is', $package_id, $path); $insert->execute(); $saved[] = $path; }
}
finfo_close($finfo); echo json_encode(['success' => true, 'images' => $saved]);