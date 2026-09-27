<?php
ini_set('display_errors', '0');
ini_set('log_errors', '1');
require_once __DIR__ . '/image_storage.php';

header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^https?:\/\/localhost:\d+$/', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Invalid method.']);
    exit;
}

$user = supabase_current_user();
if (!$user['ok']) {
    http_response_code(401);
    echo json_encode(['error' => $user['error']]);
    exit;
}
if (($user['role'] ?? '') !== 'admin') {
    http_response_code(403);
    echo json_encode(['error' => 'Admin access required.']);
    exit;
}

$database = supabase_request('GET', 'users', ['select' => 'id', 'limit' => '1']);
$storage = image_storage_request('GET', 'bucket/ai-visualizations');
$events = supabase_request('GET', 'system_health_events', [
    'select' => 'id,component,severity,message,details,created_at',
    'severity' => 'eq.error',
    'order' => 'created_at.desc',
    'limit' => '8',
]);
$provider_configured = app_env_value('NANOBANANA_API_KEY') !== '';

echo json_encode([
    'checked_at' => gmdate('c'),
    'services' => [
        'backend' => ['status' => 'healthy'],
        'database' => [
            'status' => $database['ok'] ? 'healthy' : 'error',
            'error' => $database['ok'] ? null : substr((string) ($database['error'] ?: 'Supabase database request failed.'), 0, 180),
        ],
        'storage' => [
            'status' => $storage['ok'] ? 'healthy' : 'error',
            'error' => $storage['ok'] ? null : substr((string) ($storage['error'] ?: 'Supabase image storage is unavailable.'), 0, 180),
        ],
        'image_provider' => ['status' => $provider_configured ? 'configured' : 'not_configured'],
        'error_log' => ['status' => $events['ok'] ? 'healthy' : 'unavailable'],
    ],
    'recent_image_errors' => $events['ok'] && is_array($events['data']) ? $events['data'] : [],
]);
?>