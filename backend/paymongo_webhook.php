<?php
require_once __DIR__ . '/paymongo_handler.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

handlePaymentWebhook();
exit;
