<?php
// generate.php
// Accepts: multipart/form-data with 'prompt' and optional 'image'
// Saves the reference image, invokes the NVIDIA NIM image client, and returns JSON { success, url }

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
}

// Prepare output path
$outName = 'gen_' . time() . '_' . bin2hex(random_bytes(6)) . '.png';
$outputPath = $uploadDir . $outName;

// Build command (ensure node in PATH and gen_image.js exists)
$nodeCmd = 'node';
// NVIDIA NIM can run locally without a key or through a hosted endpoint with one.
$envApiKey = getenv('NVIDIA_NIM_API_KEY') ?: getenv('NVIDIA_API_KEY');
$imageModel = getenv('NVIDIA_NIM_MODEL') ?: 'black-forest-labs/FLUX.1-dev';
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
        $envApiKey = getenv('NVIDIA_NIM_API_KEY') ?: getenv('NVIDIA_API_KEY');
        $imageModel = getenv('NVIDIA_NIM_MODEL') ?: 'black-forest-labs/FLUX.1-dev';
    }
}

// A local NIM container usually needs no key; hosted NIM uses NVIDIA_NIM_API_KEY.
$script = escapeshellarg(__DIR__ . '/gen_image.js');
$escapedPrompt = escapeshellarg($prompt);
$escapedOutput = escapeshellarg($outputPath);
$appUrl = rtrim(getenv('APP_URL') ?: 'http://localhost:8000', '/');
$prefix = '';
// On Windows use set "VAR=val" && command, on *nix prefix environment var
if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
    // escape any double quotes in the key
    $safeKey = str_replace('"', '\\"', $envApiKey ?: '');
    $safeModel = str_replace('"', '\\"', $imageModel);
    $safeEndpoint = str_replace('"', '\\"', getenv('NVIDIA_NIM_IMAGE_ENDPOINT') ?: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev');
    $prefix = 'set "NVIDIA_NIM_API_KEY=' . $safeKey . '" && set "NVIDIA_NIM_MODEL=' . $safeModel . '" && set "NVIDIA_NIM_IMAGE_ENDPOINT=' . $safeEndpoint . '" && ';
} else {
    $endpoint = getenv('NVIDIA_NIM_IMAGE_ENDPOINT') ?: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev';
    $prefix = 'NVIDIA_NIM_API_KEY=' . escapeshellarg($envApiKey ?: '') . ' NVIDIA_NIM_MODEL=' . escapeshellarg($imageModel) . ' NVIDIA_NIM_IMAGE_ENDPOINT=' . escapeshellarg($endpoint) . ' ';
}

$cmd = $prefix . "$nodeCmd $script $escapedPrompt $escapedOutput 2>&1";

// Execute and capture output
exec($cmd, $outputLines, $ret);
$outText = implode("\n", $outputLines);

if ($ret === 0) {
    // Success: return URL
    $urlPath = '/uploads/permits/' . $outName;
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
        echo json_encode(['success' => false, 'error' => 'NVIDIA NIM generation failed', 'debug' => $outText]);
    }
    exit;
}
