<?php
// generate.php
// Accepts: multipart/form-data with 'prompt' and optional 'image'
// Saves the reference image, invokes the configured image client, and returns JSON { success, url }

header('Content-Type: application/json');
set_time_limit(600);
ini_set('max_execution_time', '600');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^http:\/\/localhost:\d+$/', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid method']);
    exit;
}

$prompt = isset($_POST['prompt']) ? trim($_POST['prompt']) : '';
$aspectRatio = $_POST['aspect_ratio'] ?? '1:1';
$singleDimension = 1024;
$dimensions = [
    '1:1' => [$singleDimension, $singleDimension],
    '4:5' => [$singleDimension, $singleDimension],
    '16:9' => [$singleDimension, $singleDimension],
];
if (!isset($dimensions[$aspectRatio])) $aspectRatio = '1:1';
if ($prompt === '') {
    echo json_encode(['success' => false, 'error' => 'Prompt is required']);
    exit;
}

$uploadDir = __DIR__ . '/../uploads/permits/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

$inputPath = '';
if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
    $ext = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
    $safe = time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
    $inputPath = $uploadDir . $safe;
    if (!move_uploaded_file($_FILES['image']['tmp_name'], $inputPath)) {
        echo json_encode(['success' => false, 'error' => 'Failed to save uploaded image']);
        exit;
    }
}

// Prepare output path
$outName = 'gen_' . time() . '_' . bin2hex(random_bytes(6)) . '.png';
$outputPath = $uploadDir . $outName;

// PHP-FPM/Apache does not automatically load the Vite project's .env file.
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) continue;
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if ((substr($value, 0, 1) === '"' && substr($value, -1) === '"') || (substr($value, 0, 1) === "'" && substr($value, -1) === "'")) {
            $value = substr($value, 1, -1);
        }
        putenv("$key=$value");
        $_ENV[$key] = $value;
    }
}

$nodeCmd = 'node';
$script = escapeshellarg(__DIR__ . '/gen_image.js');
$escapedPrompt = escapeshellarg($prompt);
$escapedOutput = escapeshellarg($outputPath);
$escapedInput = escapeshellarg($inputPath);
$escapedWidth = escapeshellarg((string) $dimensions[$aspectRatio][0]);
$escapedHeight = escapeshellarg((string) $dimensions[$aspectRatio][1]);

$safeNanoBananaKey = str_replace('"', '\\"', (string) getenv('NANOBANANA_API_KEY'));
$safeProvider = 'nanobanana';

$prefix = '';
if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
    $prefix = 'set "AI_IMAGE_PROVIDER=' . $safeProvider . '" && set "NANOBANANA_API_KEY=' . $safeNanoBananaKey . '" && ';
} else {
    $prefix = 'AI_IMAGE_PROVIDER=' . escapeshellarg($safeProvider) . ' NANOBANANA_API_KEY=' . escapeshellarg((string) getenv('NANOBANANA_API_KEY')) . ' ';
}

$cmd = $prefix . "$nodeCmd $script $escapedPrompt $escapedOutput $escapedWidth $escapedHeight $escapedInput 2>&1";

// Execute and capture output
exec($cmd, $outputLines, $ret);
$outText = implode("\n", $outputLines);

if ($ret === 0) {
    // Success: return URL
    $urlPath = '/capstone-project-finals-catering/uploads/permits/' . $outName;
    echo json_encode(['success' => true, 'url' => $urlPath]);
    exit;
} else {
    // Try to parse JSON from stderr/text
    $errorJson = null;
    foreach ($outputLines as $line) {
        $dec = json_decode($line, true);
        if (is_array($dec) && isset($dec['success']) && $dec['success'] === false) {
            $errorJson = $dec;
            break;
        }
    }
    if ($errorJson) {
        $errorMessage = $errorJson['error'] ?? 'NanoBanana generation failed';
        echo json_encode(['success' => false, 'error' => $errorMessage]);
    } else {
        echo json_encode(['success' => false, 'error' => 'NanoBanana generation failed', 'debug' => $outText]);
    }
    exit;
}
