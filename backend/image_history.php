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
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST', 'DELETE'], true)) {
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
if (($user['role'] ?? '') !== 'caterer') {
    http_response_code(403);
    echo json_encode(['error' => 'Caterer access required.']);
    exit;
}

$owner = (string) $user['auth_user']['id'];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $request = json_decode(file_get_contents('php://input') ?: '', true);
    $path = is_array($request) ? (string) ($request['path'] ?? '') : '';
    if ($path === '' || strlen($path) > 1024 || preg_match('/[\x00-\x1f\x7f]/', $path)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid image path.']);
        exit;
    }
    if (image_storage_signed_url($path) === null) {
        http_response_code(404);
        echo json_encode(['error' => 'The generated image could not be found in Supabase Storage.']);
        exit;
    }

    $saved_image = supabase_request('POST', 'ai_generated_images', ['on_conflict' => 'storage_path'], [
        'user_id' => $owner,
        'storage_path' => $path,
        'prompt' => substr((string) ($request['prompt'] ?? ''), 0, 2000),
    ], 'resolution=ignore-duplicates,return=minimal');
    if (!$saved_image['ok']) {
        error_log('Legacy AI image could not be added to history: ' . ($saved_image['error'] ?: 'Supabase request failed.'));
        http_response_code(500);
        echo json_encode(['error' => 'Could not save the existing image to your history.']);
        exit;
    }

    echo json_encode(['success' => true]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $images = supabase_request('GET', 'ai_generated_images', [
        'select' => 'id,storage_path,prompt,created_at',
        'user_id' => 'eq.' . $owner,
        'order' => 'created_at.desc',
        'limit' => '12',
    ]);
    if (!$images['ok'] || !is_array($images['data'])) {
        error_log('AI image history could not be loaded: ' . ($images['error'] ?: 'Supabase request failed.'));
        http_response_code(500);
        echo json_encode(['error' => 'Could not load saved images. Check that the AI image history migration has been applied.']);
        exit;
    }

    $result = [];
    foreach ($images['data'] as $image) {
        $url = image_storage_signed_url((string) $image['storage_path']);
        if ($url === null) {
            http_response_code(502);
            echo json_encode(['error' => 'A saved image is missing from Supabase Storage.']);
            exit;
        }
        $result[] = [
            'id' => (int) $image['id'],
            'url' => $url,
            'path' => $image['storage_path'],
            'prompt' => $image['prompt'],
            'createdAt' => $image['created_at'],
        ];
    }

    echo json_encode(['images' => $result]);
    exit;
}

$request = json_decode(file_get_contents('php://input') ?: '', true);
$path = is_array($request) ? (string) ($request['path'] ?? '') : '';
$path_pattern = '/^' . preg_quote($owner, '/') . '\/generated_[a-f0-9]{32}\.(png|jpg|webp)$/i';
if (!preg_match($path_pattern, $path)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid image path.']);
    exit;
}

$deleted = supabase_request('DELETE', 'ai_generated_images', [
    'user_id' => 'eq.' . $owner,
    'storage_path' => 'eq.' . $path,
], null, 'return=minimal');
if (!$deleted['ok']) {
    error_log('AI image history entry could not be deleted: ' . ($deleted['error'] ?: 'Supabase request failed.'));
    http_response_code(500);
    echo json_encode(['error' => 'Could not remove the saved image from history.']);
    exit;
}

// Old history entries may point to files owned by a previous account. Only
// delete a Storage object when its path is safely inside this user's folder.
$owned_path_pattern = '/^' . preg_quote($owner, '/') . '\/[A-Za-z0-9][A-Za-z0-9._-]{0,254}\.(png|jpg|webp)$/i';
if (preg_match($owned_path_pattern, $path)) {
    $storage_delete = image_storage_delete($path);
    if (!$storage_delete['ok'] && $storage_delete['status'] !== 404) {
        error_log('AI generated image object could not be deleted from storage: ' . ($storage_delete['error'] ?: 'Supabase request failed.'));
        http_response_code(502);
        echo json_encode(['error' => 'The image was removed from history, but its stored file could not be deleted.']);
        exit;
    }
}

echo json_encode(['success' => true]);
?>
