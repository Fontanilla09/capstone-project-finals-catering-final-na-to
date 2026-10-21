<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Invalid method.']);
    exit;
}

$mode = app_env_value('PAYMONGO_MODE');
$webhookSecret = app_env_value('PAYMONGO_WEBHOOK_SECRET');
$isHttpsRequest = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
if (!in_array($mode, ['test', 'live'], true) || $webhookSecret === '' || ($mode === 'live' && !$isHttpsRequest)) {
    error_log('PayMongo webhook is not configured for the selected mode.');
    http_response_code(503);
    echo json_encode(['error' => 'Webhook is not configured.']);
    exit;
}

$rawBody = file_get_contents('php://input');
if (!is_string($rawBody) || strlen($rawBody) > 1048576) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid webhook payload.']);
    exit;
}
$signature = $_SERVER['HTTP_X_PAYMONGO_SIGNATURE'] ?? '';
$expectedSignature = hash_hmac('sha256', $rawBody, $webhookSecret);
if (!preg_match('/^[a-f0-9]{64}$/i', $signature) || !hash_equals($expectedSignature, strtolower($signature))) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid webhook signature.']);
    exit;
}

$event = json_decode($rawBody, true);
if (!is_array($event)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid webhook payload.']);
    exit;
}

$eventAttributes = $event['data']['attributes'] ?? [];
$eventType = $eventAttributes['type'] ?? $event['data']['type'] ?? $event['type'] ?? $event['event_type'] ?? '';
if ($eventType !== 'checkout_session.payment.paid') {
    echo json_encode(['success' => true, 'ignored' => true]);
    exit;
}

$checkoutSession = $eventAttributes['data'] ?? $event['data']['data'] ?? null;
$checkoutSession = is_array($checkoutSession) ? $checkoutSession : [];
$checkoutId = $checkoutSession['id'] ?? '';
$sessionAttributes = $checkoutSession['attributes'] ?? [];
$liveMode = $sessionAttributes['livemode'] ?? $checkoutSession['livemode'] ?? null;
if (!is_string($checkoutId) || $checkoutId === '' || ($liveMode !== null && (bool) $liveMode !== ($mode === 'live'))) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid checkout session for this environment.']);
    exit;
}

$subscription = supabase_request('GET', 'caterer_subscriptions', [
    'select' => 'id',
    'paymongo_checkout_session_id' => 'eq.' . $checkoutId,
    'limit' => '1',
]);
if (!$subscription['ok']) {
    error_log('PayMongo webhook could not find its subscription: ' . ($subscription['error'] ?: 'Supabase request failed.'));
    http_response_code(500);
    echo json_encode(['error' => 'Subscription could not be verified.']);
    exit;
}
if (!supabase_row($subscription)) {
    http_response_code(404);
    echo json_encode(['error' => 'Subscription checkout was not found.']);
    exit;
}

$paymentId = null;
$payments = $sessionAttributes['payments'] ?? [];
if (is_array($payments)) {
    foreach ($payments as $payment) {
        if (!is_array($payment)) continue;
        $paymentAttributes = $payment['attributes'] ?? [];
        if (isset($paymentAttributes['status']) && $paymentAttributes['status'] !== 'paid') continue;
        $candidateId = $payment['id'] ?? '';
        if (is_string($candidateId) && $candidateId !== '') {
            $paymentId = $candidateId;
            break;
        }
    }
}

$activated = supabase_request('POST', 'rpc/activate_caterer_subscription', [], [
    'p_checkout_session_id' => $checkoutId,
    'p_payment_id' => $paymentId,
]);
if (!$activated['ok']) {
    error_log('PayMongo subscription activation failed: ' . ($activated['error'] ?: 'Supabase request failed.'));
    http_response_code(500);
    echo json_encode(['error' => 'Subscription activation failed.']);
    exit;
}

echo json_encode(['success' => true]);
?>
