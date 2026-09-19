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
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') { http_response_code(422); echo json_encode(['error' => 'Enter a valid email and password.']); exit; }
$query = $conn->prepare('SELECT id, email, password, role FROM users WHERE email = ? AND role = ? LIMIT 1');
$query->bind_param('ss', $email, $account_type); $query->execute(); $user = $query->get_result()->fetch_assoc();
if (!$user || !password_verify($password, $user['password'])) { http_response_code(401); echo json_encode(['error' => 'Invalid email or password.']); exit; }

if ($user['role'] === 'caterer') {
	$verification = $conn->prepare('SELECT is_verified FROM caterers WHERE user_id = ? LIMIT 1');
	$verification->bind_param('i', $user['id']);
	$verification->execute();
	$caterer = $verification->get_result()->fetch_assoc();
	if (!$caterer || (int) $caterer['is_verified'] !== 1) {
		http_response_code(403);
		echo json_encode(['error' => 'Your caterer account is waiting for admin verification. You cannot log in until your account is approved.']);
		exit;
	}
}
if ($user['role'] === 'customer') {

	$verification = $conn->prepare('SELECT is_verified FROM customers WHERE user_id = ? LIMIT 1');
	$verification->bind_param('i', $user['id']);
	$verification->execute();
	$customer = $verification->get_result()->fetch_assoc();
	if (!$customer || (int) $customer['is_verified'] !== 1) {
		http_response_code(403);
		echo json_encode(['error' => 'Your customer account is waiting for admin verification. You cannot log in until your account is approved.']);
		exit;
	}
}

$_SESSION['user_id'] = $user['id']; $_SESSION['email'] = $user['email']; $_SESSION['role'] = $user['role'];
$redirect = '/dashboard/customer';
if ($user['role'] === 'customer') { $profile = $conn->prepare('SELECT id, full_name FROM customers WHERE user_id = ?'); $profile->bind_param('i', $user['id']); $profile->execute(); $row = $profile->get_result()->fetch_assoc(); $_SESSION['customer_id'] = $row['id']; $_SESSION['full_name'] = $row['full_name']; }
if ($user['role'] === 'caterer') { $profile = $conn->prepare('SELECT id, business_name, is_verified FROM caterers WHERE user_id = ?'); $profile->bind_param('i', $user['id']); $profile->execute(); $row = $profile->get_result()->fetch_assoc(); $_SESSION['caterer_id'] = $row['id']; $_SESSION['business_name'] = $row['business_name']; $_SESSION['is_verified'] = $row['is_verified']; $redirect = '/dashboard/caterer'; }
if ($user['role'] === 'admin') $redirect = '/dashboard/admin';
echo json_encode(['success' => true, 'role' => $user['role'], 'redirect' => $redirect]);