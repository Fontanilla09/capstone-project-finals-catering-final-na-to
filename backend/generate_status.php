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
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Invalid method.']);
    exit;
}

$user = supabase_current_user();
if (!$user['ok']) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => $user['error']]);
    exit;
}

$request = json_decode(file_get_contents('php://input') ?: '', true);
$owner = (string) $user['auth_user']['id'];
$stored_path = (string) ($request['path'] ?? '');
if ($stored_path !== '') {
    $path_pattern = '/^' . preg_quote($owner, '/') . '\/generated_[a-f0-9]{32}\.(png|jpg|webp)$/i';
    if (!preg_match($path_pattern, $stored_path)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'You cannot access this generated image.']);
        exit;
    }
    $signed_url = image_storage_signed_url($stored_path);
    if ($signed_url === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'The generated image could not be found.']);
        exit;
    }
    echo json_encode(['success' => true, 'status' => 'completed', 'url' => $signed_url, 'path' => $stored_path]);
    exit;
}

$claims = image_task_claims((string) ($request['task_token'] ?? ''));
if (!$claims || ($claims['owner'] ?? '') !== $owner || (int) ($claims['expires_at'] ?? 0) < time()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'This image-generation task is invalid or expired.']);
    exit;
}

$task_id = (string) ($claims['task_id'] ?? '');
$status = image_provider_request('GET', '/api/status?task_id=' . rawurlencode($task_id));
if (!$status['ok']) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $status['error'] ?: 'Could not check the NanoBanana task.']);
    exit;
}

$task = $status['data']['data'] ?? $status['data'];
$status_code = (int) ($task['status_code'] ?? 0);
if ($status_code === 2) {
    if (!empty($claims['input_path'])) image_storage_delete($claims['input_path']);
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $task['error_message'] ?? 'NanoBanana image generation failed.']);
    exit;
}
if ($status_code !== 1) {
    http_response_code(202);
    echo json_encode(['success' => true, 'status' => 'processing']);
    exit;
}

$image = $task['response'] ?? null;
if (is_string($image)) {
    $decoded = json_decode($image, true);
    if (is_array($decoded)) $image = $decoded;
}
if (is_array($image) && isset($image[0])) $image = $image[0];

$image_contents = '';
$content_type = '';
$base64_image = is_array($image) ? ($image['b64_json'] ?? $image['base64'] ?? null) : null;
if (is_string($base64_image) && $base64_image !== '') {
    $image_contents = base64_decode($base64_image, true) ?: '';
    $content_type = 'image/png';
} else {
    $image_url = is_string($image)
        ? $image
        : (is_array($image) ? ($image['image_url'] ?? $image['url'] ?? $image['imageUrls'][0] ?? $image['images'][0]['url'] ?? '') : '');
    if (!is_string($image_url) || !preg_match('/^https:\/\//i', $image_url)) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => 'NanoBanana completed without a valid image URL.']);
        exit;
    }

    $ch = curl_init($image_url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $image_contents = curl_exec($ch);
    $image_status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $content_type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $download_error = curl_error($ch);
    curl_close($ch);
    if ($download_error !== '' || $image_status < 200 || $image_status >= 300 || !is_string($image_contents)) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => 'Could not download the generated image from NanoBanana.']);
        exit;
    }
    $content_type = strtolower(trim(explode(';', $content_type)[0]));
}

if ($image_contents === '' || strlen($image_contents) > 10485760) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => 'The generated image is empty or too large.']);
    exit;
}

$content_type = mime_content_type_from_buffer($image_contents, $content_type);
$extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
if (!isset($extensions[$content_type])) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => 'NanoBanana returned an unsupported image format.']);
    exit;
}

$output_path = (string) $claims['output_path'] . '.' . $extensions[$content_type];
$upload = image_storage_upload($output_path, $image_contents, $content_type);
if (!$upload['ok']) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => 'Could not save the generated image to Supabase Storage.']);
    exit;
}
if (!empty($claims['input_path'])) image_storage_delete($claims['input_path']);

$signed_url = image_storage_signed_url($output_path);
if ($signed_url === null) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => 'The image was saved, but its preview link could not be created.']);
    exit;
}

echo json_encode(['success' => true, 'status' => 'completed', 'url' => $signed_url, 'path' => $output_path]);

function mime_content_type_from_buffer(string $contents, string $reported_type): string
{
    $detected_type = (new finfo(FILEINFO_MIME_TYPE))->buffer($contents) ?: '';
    if (in_array($detected_type, ['image/jpeg', 'image/png', 'image/webp'], true)) return $detected_type;
    return in_array($reported_type, ['image/jpeg', 'image/png', 'image/webp'], true) ? $reported_type : '';
}
?>