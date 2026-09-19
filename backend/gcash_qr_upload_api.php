<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/config.php';
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'caterer') { http_response_code(401); echo json_encode(['error' => 'Unauthorized.']); exit; }
$file = $_FILES['gcash_qr_code'] ?? null;
$allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
$mime = $file && $file['error'] === UPLOAD_ERR_OK ? (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) : '';
if (!$file || $file['error'] !== UPLOAD_ERR_OK || !isset($allowed[$mime])) { http_response_code(422); echo json_encode(['error' => 'Upload a JPG, PNG, or WEBP GCash QR image.']); exit; }
if ($file['size'] > 5 * 1024 * 1024) { http_response_code(422); echo json_encode(['error' => 'The GCash QR image must not exceed 5MB.']); exit; }
$directory = __DIR__ . '/../uploads/gcash/'; if (!is_dir($directory)) mkdir($directory, 0755, true);
$id = (int) $_SESSION['caterer_id']; $filename = 'gcash_qr_' . $id . '_' . bin2hex(random_bytes(6)) . '.' . $allowed[$mime];
if (!move_uploaded_file($file['tmp_name'], $directory . $filename)) { http_response_code(500); echo json_encode(['error' => 'Unable to save the GCash QR image.']); exit; }
$stmt = $conn->prepare('UPDATE caterers SET gcash_qr_code = ? WHERE id = ?'); $stmt->bind_param('si', $filename, $id); $stmt->execute();
echo json_encode(['success' => true, 'filename' => $filename]);