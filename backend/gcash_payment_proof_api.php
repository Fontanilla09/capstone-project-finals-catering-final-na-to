<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/config.php';
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'customer') { http_response_code(401); echo json_encode(['error' => 'Unauthorized.']); exit; }
$reservation_id = (int) ($_POST['reservation_id'] ?? 0); $reference = trim($_POST['reference_number'] ?? ''); $file = $_FILES['receipt_image'] ?? null;
if (!$reservation_id || $reference === '' || !$file || $file['error'] !== UPLOAD_ERR_OK) { http_response_code(422); echo json_encode(['error' => 'Enter the GCash reference number and upload your receipt.']); exit; }
$allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp']; $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
if (!isset($allowed[$mime]) || $file['size'] > 5 * 1024 * 1024) { http_response_code(422); echo json_encode(['error' => 'Receipt must be a JPG, PNG, or WEBP image under 5MB.']); exit; }
$customer_id = (int) $_SESSION['customer_id']; $check = $conn->prepare("SELECT pay.id FROM payments pay JOIN reservations r ON r.id = pay.reservation_id WHERE pay.reservation_id = ? AND r.customer_id = ? AND pay.payment_method = 'gcash' AND pay.payment_status = 'pending' LIMIT 1"); $check->bind_param('ii', $reservation_id, $customer_id); $check->execute(); $payment = $check->get_result()->fetch_assoc();
if (!$payment) { http_response_code(404); echo json_encode(['error' => 'Pending GCash payment not found.']); exit; }
$directory = __DIR__ . '/../uploads/receipts/'; if (!is_dir($directory)) mkdir($directory, 0755, true); $filename = 'gcash_receipt_' . $reservation_id . '_' . bin2hex(random_bytes(6)) . '.' . $allowed[$mime];
if (!move_uploaded_file($file['tmp_name'], $directory . $filename)) { http_response_code(500); echo json_encode(['error' => 'Unable to save the receipt.']); exit; }
$stmt = $conn->prepare('UPDATE payments SET reference_number = ?, receipt_image = ? WHERE id = ?'); $stmt->bind_param('ssi', $reference, $filename, $payment['id']); $stmt->execute(); echo json_encode(['success' => true, 'message' => 'Receipt submitted for caterer verification.']);