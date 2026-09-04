<?php
// generate.php
// Accepts: multipart/form-data with 'prompt' and optional 'image'
// Saves uploaded image, invokes node gen_image.js, and returns JSON { success, url }

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid method']);
    exit;
}

$prompt = isset($_POST['prompt']) ? trim($_POST['prompt']) : '';
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
} else {
    // No image uploaded: return error for now (we expect an input image for image-to-image)
    echo json_encode(['success' => false, 'error' => 'No input image provided']);
    exit;
}

// Prepare output path
$outName = 'gen_' . time() . '_' . bin2hex(random_bytes(6)) . '.png';
$outputPath = $uploadDir . $outName;

// Build command (ensure node in PATH and gen_image.js exists)
$nodeCmd = 'node';
// Prefer the dedicated Nano Banana Pro settings, with the legacy key as fallback.
$envApiKey = getenv('NANOBANANA_PRO_API_KEY') ?: getenv('GENAI_API_KEY');
$imageModel = getenv('NANOBANANA_PRO_MODEL') ?: 'gemini-3-pro-image-preview';
if (!$envApiKey) {
    // load .env file if present (simple parser)
    $envFile = __DIR__ . '/../.env';
    if (file_exists($envFile)) {
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || strpos($line, '#') === 0) continue;
            if (strpos($line, '=') === false) continue;
            list($k, $v) = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v);
            // strip quotes
            if ((substr($v,0,1) === '"' && substr($v,-1) === '"') || (substr($v,0,1) === "'" && substr($v,-1) === "'")) {
                $v = substr($v,1,-1);
            }
            putenv("$k=$v");
            $_ENV[$k] = $v;
        }
        $envApiKey = getenv('NANOBANANA_PRO_API_KEY') ?: getenv('GENAI_API_KEY');
        $imageModel = getenv('NANOBANANA_PRO_MODEL') ?: 'gemini-3-pro-image-preview';
    }
}

if (!$envApiKey) {
    echo json_encode(['success' => false, 'error' => 'NANOBANANA_PRO_API_KEY not set in server environment. Set it in Apache/XAMPP or add it to ../.env']);
    exit;
}
$script = escapeshellarg(__DIR__ . '/gen_image.js');
$escapedPrompt = escapeshellarg($prompt);
$escapedInput = escapeshellarg($inputPath);
$escapedOutput = escapeshellarg($outputPath);
$appUrl = rtrim(getenv('APP_URL') ?: '', '/');
if ($appUrl === '') {
    echo json_encode(['success' => false, 'error' => 'APP_URL is required so Nano Banana can access the uploaded image']);
    exit;
}
$inputUrl = $appUrl . '/uploads/permits/' . rawurlencode(basename($inputPath));
$escapedInputUrl = escapeshellarg($inputUrl);
$prefix = '';
// On Windows use set "VAR=val" && command, on *nix prefix environment var
if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
    // escape any double quotes in the key
    $safeKey = str_replace('"', '\\"', $envApiKey);
    $safeModel = str_replace('"', '\\"', $imageModel);
    $safeBaseUrl = str_replace('"', '\\"', getenv('NANOBANANA_PRO_BASE_URL') ?: 'https://nanobnana.com');
    $prefix = 'set "NANOBANANA_PRO_API_KEY=' . $safeKey . '" && set "NANOBANANA_PRO_MODEL=' . $safeModel . '" && set "NANOBANANA_PRO_BASE_URL=' . $safeBaseUrl . '" && ';
} else {
    $baseUrl = getenv('NANOBANANA_PRO_BASE_URL') ?: 'https://nanobnana.com';
    $prefix = 'NANOBANANA_PRO_API_KEY=' . escapeshellarg($envApiKey) . ' NANOBANANA_PRO_MODEL=' . escapeshellarg($imageModel) . ' NANOBANANA_PRO_BASE_URL=' . escapeshellarg($baseUrl) . ' ';
}

$cmd = $prefix . "$nodeCmd $script $escapedPrompt $escapedInput $escapedOutput $escapedInputUrl 2>&1";

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
        echo json_encode($errorJson);
    } else {
        echo json_encode(['success' => false, 'error' => 'Generation failed', 'debug' => $outText]);
    }
    exit;
}
