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

$prompt = trim((string) ($_POST['prompt'] ?? ''));
$aspect_ratio = (string) ($_POST['aspect_ratio'] ?? '1:1');
if ($prompt === '' || strlen($prompt) > 2000) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Enter a prompt under 2,000 characters.']);
    exit;
}
$blocked_prompt_terms = '\\b(?:people|persons?|guests?|humans?|man|men|woman|women|boys?|girls?|child|children|kids?|family|families|male|female|couples?|brides?|grooms?|models?|faces?|bodies?|silhouettes?|portraits?|customers?|audiences?|crowds?|waiters?|waitresses?|waitstaff|chefs?|staff|servers?|caterers?|hosts?|characters?|figures?)\\b';
if (preg_match('/' . $blocked_prompt_terms . '/i', $prompt)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'This generator creates catering decor and themes only. Remove requests for people, guests, staff, or human figures.']);
    exit;
}
if (!in_array($aspect_ratio, ['1:1', '4:5', '16:9'], true)) $aspect_ratio = '1:1';

$owner = (string) $user['auth_user']['id'];
$input_path = '';
$input_url = '';
if (isset($_FILES['image']) && $_FILES['image']['error'] !== UPLOAD_ERR_NO_FILE) {
    if ($_FILES['image']['error'] !== UPLOAD_ERR_OK || $_FILES['image']['size'] > 4194304) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Reference image must be smaller than 4 MB.']);
        exit;
    }

    $mime = mime_content_type($_FILES['image']['tmp_name']) ?: '';
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Reference image must be JPG, PNG, or WEBP.']);
        exit;
    }

    $input_path = $owner . '/' . bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    $contents = file_get_contents($_FILES['image']['tmp_name']);
    if (!is_string($contents)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Could not read the reference image.']);
        exit;
    }
    $upload = image_storage_upload($input_path, $contents, $mime);
    if (!$upload['ok']) {
        log_image_failure('image_storage', 'Reference image upload failed.', ['http_status' => $upload['status']]);
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => 'Could not save the reference image to Supabase Storage.']);
        exit;
    }

    $input_url = image_storage_signed_url($input_path, 3600) ?? '';
    if ($input_url === '') {
        image_storage_delete($input_path);
        log_image_failure('image_storage', 'A temporary reference-image link could not be created.');
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => 'Could not create a temporary link for the reference image.']);
        exit;
    }
}

$app_env = $app_env ?? [];
$prompt .= '. Theme-only catering design: show decor, tablescapes, linens, centerpieces, floral arrangements, balloons, lighting, venue styling, food presentation, trays, and event ambiance. Do not include people, human figures, faces, bodies, or silhouettes.';
$model = (string) ($app_env['NANOBANANA_MODEL'] ?? getenv('NANOBANANA_MODEL') ?: 'nano2');
$endpoint = $input_url !== '' ? '/api/edit' : '/api/generate';
$payload = $input_url !== ''
    ? ['prompt' => $prompt, 'images' => [$input_url], 'model' => $model, 'aspect_ratio' => $aspect_ratio, 'resolution' => '1K', 'output_format' => 'png']
    : ['prompt' => $prompt, 'model' => $model, 'aspect_ratio' => $aspect_ratio, 'size' => '1K', 'format' => 'png'];
$provider = image_provider_request('POST', $endpoint, $payload);
$task_id = $provider['data']['task_id'] ?? $provider['data']['data']['task_id'] ?? '';
if (!$provider['ok'] || !is_string($task_id) || $task_id === '') {
    if ($input_path !== '') image_storage_delete($input_path);
    log_image_failure('image_provider', 'NanoBanana did not start the image-generation task.', ['http_status' => $provider['status']]);
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $provider['error'] ?: 'NanoBanana did not return a task ID.']);
    exit;
}

$output_path = $owner . '/generated_' . bin2hex(random_bytes(16)) . '.png';
$token = image_task_token([
    'task_id' => $task_id,
    'owner' => $owner,
    'input_path' => $input_path,
    'output_path' => $output_path,
    'expires_at' => time() + 3600,
]);
echo json_encode(['success' => true, 'status' => 'processing', 'task_token' => $token]);
?>
exec($cmd, $outputLines, $ret);
