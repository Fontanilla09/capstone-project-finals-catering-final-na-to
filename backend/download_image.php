<?php
header('Access-Control-Allow-Origin: http://localhost:5173');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$file = basename($_GET['file'] ?? '');
if ($file === '' || !preg_match('/^gen_[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/i', $file)) {
    http_response_code(400);
    echo 'Invalid image file.';
    exit;
}

$path = __DIR__ . '/../uploads/permits/' . $file;
if (!is_file($path)) {
    http_response_code(404);
    echo 'Image not found.';
    exit;
}

$mime = mime_content_type($path) ?: 'application/octet-stream';
header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($path));
header('Content-Disposition: attachment; filename="' . $file . '"');
readfile($path);
