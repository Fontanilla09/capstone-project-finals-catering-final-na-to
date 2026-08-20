<?php
// Simple image upload endpoint
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid method']);
    exit;
}

if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['success' => false, 'error' => 'No file uploaded or upload error']);
    exit;
}

$allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $_FILES['image']['tmp_name']);
if (!in_array($mime, $allowed)) {
    echo json_encode(['success' => false, 'error' => 'Invalid file type']);
    exit;
}

$uploadDir = __DIR__ . '/../uploads/permits/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

$ext = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
$filename = time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
$target = $uploadDir . $filename;

if (move_uploaded_file($_FILES['image']['tmp_name'], $target)) {
    // Build URL relative to site root
    $url = dirname($_SERVER['REQUEST_URI']) . '/../uploads/permits/' . $filename;
    // normalize URL
    $url = str_replace('\\', '/', $url);
    echo json_encode(['success' => true, 'url' => $url]);
    exit;
} else {
    echo json_encode(['success' => false, 'error' => 'Move failed']);
    exit;
}
