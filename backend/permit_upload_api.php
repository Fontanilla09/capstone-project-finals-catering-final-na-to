<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
require_once __DIR__ . '/config.php';
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'caterer') { http_response_code(401); echo json_encode(['error' => 'Unauthorized.']); exit; }
$file = $_FILES['business_permit'] ?? null;
$allowed = ['application/pdf', 'image/jpeg', 'image/png'];
if (!$file || $file['error'] !== UPLOAD_ERR_OK || !in_array($file['type'], $allowed, true)) { http_response_code(422); echo json_encode(['error' => 'Upload a PDF, JPG, or PNG business permit.']); exit; }
if ($file['size'] > 10 * 1024 * 1024) { http_response_code(422); echo json_encode(['error' => 'Maximum file size is 10MB.']); exit; }
$directory = __DIR__ . '/../uploads/permits/'; if (!is_dir($directory)) mkdir($directory, 0755, true);
$id = (int) $_SESSION['caterer_id']; $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)); $filename = 'permit_' . $id . '_' . time() . '.' . $extension;
if (!move_uploaded_file($file['tmp_name'], $directory . $filename)) { http_response_code(500); echo json_encode(['error' => 'Unable to save permit.']); exit; }
$stmt = $conn->prepare('UPDATE caterers SET business_permit = ?, verification_submitted = 0 WHERE id = ?'); $stmt->bind_param('si', $filename, $id); $stmt->execute(); echo json_encode(['success' => true, 'filename' => $filename]);
