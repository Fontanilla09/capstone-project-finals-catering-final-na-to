<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/config.php';

if (!isset($_SESSION['user_id'], $_SESSION['role'])) {
    echo json_encode(['authenticated' => false]);
    exit;
}

$redirect = match ($_SESSION['role']) {
    'customer' => '/dashboard/customer',
    'caterer' => '/dashboard/caterer',
    'admin' => '/dashboard/admin',
    default => '/login',
};

$display_name = '';
if ($_SESSION['role'] === 'customer' && isset($_SESSION['customer_id'])) {
    $profile = $conn->prepare('SELECT full_name FROM customers WHERE id = ? LIMIT 1');
    $profile->bind_param('i', $_SESSION['customer_id']); $profile->execute();
    $display_name = $profile->get_result()->fetch_assoc()['full_name'] ?? '';
} elseif ($_SESSION['role'] === 'caterer') {
    $display_name = $_SESSION['business_name'] ?? '';
}

echo json_encode([
    'authenticated' => true,
    'user_id' => $_SESSION['user_id'],
    'role' => $_SESSION['role'],
    'email' => $_SESSION['email'] ?? '',
    'name' => $display_name,
    'customer_id' => $_SESSION['customer_id'] ?? null,
    'caterer_id' => $_SESSION['caterer_id'] ?? null,
    'redirect' => $redirect,
]);
