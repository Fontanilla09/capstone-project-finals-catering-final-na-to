<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/config.php';

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$account_type = $input['account_type'] ?? 'customer';
$email = trim($input['email'] ?? '');
$password = $input['password'] ?? '';
$phone = trim($input['phone'] ?? '');
$name = trim($account_type === 'customer'
    ? ($input['full_name'] ?? '')
    : ($input['business_name'] ?? ''));
$permit_file = $_FILES['business_permit'] ?? null;

if (!in_array($account_type, ['customer', 'caterer'], true)) {
    http_response_code(400); echo json_encode(['error' => 'Invalid account type.']); exit;
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6 || $phone === '' || $name === '') {
    http_response_code(422); echo json_encode(['error' => 'Complete all fields with a valid email and password of at least 6 characters.']); exit;
}
if ($account_type === 'caterer' && (!$permit_file || $permit_file['error'] !== UPLOAD_ERR_OK)) {
    http_response_code(422); echo json_encode(['error' => 'Business permit is required for caterer verification.']); exit;
}
if ($account_type === 'caterer' && !in_array($permit_file['type'], ['application/pdf', 'image/jpeg', 'image/png'], true)) {
    http_response_code(422); echo json_encode(['error' => 'Business permit must be a PDF, JPG, or PNG file.']); exit;
}
if ($account_type === 'caterer' && $permit_file['size'] > 10 * 1024 * 1024) {
    http_response_code(422); echo json_encode(['error' => 'Business permit must not exceed 10MB.']); exit;
}

$check = $conn->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
$check->bind_param('s', $email); $check->execute();
if ($check->get_result()->num_rows > 0) {
    http_response_code(409); echo json_encode(['error' => 'Email already registered.']); exit;
}

$conn->begin_transaction();
try {
    $password_hash = password_hash($password, PASSWORD_DEFAULT);
    $user = $conn->prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)');
    $user->bind_param('sss', $email, $password_hash, $account_type); $user->execute();
    $user_id = $conn->insert_id;
    if ($account_type === 'customer') {
        $profile = $conn->prepare('INSERT INTO customers (user_id, full_name, phone) VALUES (?, ?, ?)');
        $profile->bind_param('iss', $user_id, $name, $phone);
    } else {
        $permit = '';
        $profile = $conn->prepare('INSERT INTO caterers (user_id, business_name, business_permit, phone) VALUES (?, ?, ?, ?)');
        $profile->bind_param('isss', $user_id, $name, $permit, $phone);
    }
    $profile->execute();
    if ($account_type === 'caterer') {
        $caterer_id = $conn->insert_id;
        $directory = __DIR__ . '/../uploads/permits/';
        if (!is_dir($directory)) mkdir($directory, 0755, true);
        $extension = strtolower(pathinfo($permit_file['name'], PATHINFO_EXTENSION));
        $filename = 'permit_' . $caterer_id . '_' . time() . '.' . $extension;
        if (!move_uploaded_file($permit_file['tmp_name'], $directory . $filename)) throw new RuntimeException('Unable to save business permit.');
        $permit_update = $conn->prepare('UPDATE caterers SET business_permit = ?, verification_submitted = 1 WHERE id = ?');
        $permit_update->bind_param('si', $filename, $caterer_id);
        $permit_update->execute();
    }
    $conn->commit();
    $message = 'Account created. Please wait for admin verification before logging in.';
    echo json_encode(['success' => true, 'message' => $message]);
} catch (Throwable $exception) {
    $conn->rollback(); http_response_code(500);
    echo json_encode(['error' => 'Unable to create account. Please try again.']);
}