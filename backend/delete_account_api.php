<?php
header('Content-Type: application/json');
if (preg_match('/^https?:\/\/localhost:\d+$/', $_SERVER['HTTP_ORIGIN'] ?? '')) header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') exit;
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed.']);
    exit;
}

require_once __DIR__ . '/config.php';

$user = supabase_current_user();
if (!$user['ok'] || $user['role'] !== 'customer') {
    http_response_code(401);
    echo json_encode(['error' => $user['error'] ?? 'Customer account required.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input) || ($input['confirmation'] ?? '') !== 'DELETE') {
    http_response_code(422);
    echo json_encode(['error' => 'Explicit account deletion confirmation is required.']);
    exit;
}

$auth_user_id = $user['auth_user']['id'] ?? '';
if (!is_string($auth_user_id) || !preg_match('/^[0-9a-f-]{36}$/i', $auth_user_id)) {
    http_response_code(401);
    echo json_encode(['error' => 'Your account could not be verified. Please sign in again.']);
    exit;
}

global $supabase_url, $supabase_service_role_key;
$ch = curl_init($supabase_url . '/auth/v1/admin/users/' . rawurlencode($auth_user_id));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => 'DELETE',
    CURLOPT_HTTPHEADER => [
        'apikey: ' . $supabase_service_role_key,
        'Authorization: Bearer ' . $supabase_service_role_key,
        'Content-Type: application/json',
    ],
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => true,
]);
$response = curl_exec($ch);
$http_status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_error = curl_error($ch);
curl_close($ch);

if ($curl_error !== '') {
    error_log('Supabase account deletion request failed: ' . $curl_error);
    http_response_code(502);
    echo json_encode(['error' => 'Unable to delete your account right now. Please try again.']);
    exit;
}

if ($http_status < 200 || $http_status >= 300) {
    error_log('Supabase account deletion returned HTTP ' . $http_status . ': ' . (string) $response);
    http_response_code(502);
    echo json_encode(['error' => 'Supabase could not delete your account. Please contact support.']);
    exit;
}

echo json_encode(['success' => true]);
?>
