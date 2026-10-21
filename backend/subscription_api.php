<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$user = supabase_current_user();
if (!$user['ok']) {
    http_response_code(401);
    echo json_encode(['error' => $user['error']]);
    exit;
}
if (($user['role'] ?? '') !== 'caterer' || empty($user['caterer_id'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Caterer access required.']);
    exit;
}

$catererId = (int) $user['caterer_id'];
$subscriptionAccess = supabase_active_caterer_subscription($catererId);
if (!$subscriptionAccess['ok']) {
    http_response_code(500);
    echo json_encode(['error' => 'Subscription status could not be checked. Please try again.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $response = supabase_request('GET', 'caterer_subscriptions', [
        'select' => 'plan,status,expires_at,created_at',
        'caterer_id' => 'eq.' . $catererId,
        'order' => 'created_at.desc',
        'limit' => '1',
    ]);
    if (!$response['ok']) {
        error_log('Caterer subscription could not be loaded: ' . ($response['error'] ?: 'Supabase request failed.'));
        http_response_code(500);
        echo json_encode(['error' => 'Subscription details could not be loaded. Please try again.']);
        exit;
    }

    echo json_encode([
        'active' => $subscriptionAccess['active'],
        'subscription' => supabase_row($response),
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Invalid method.']);
    exit;
}
if ($subscriptionAccess['active']) {
    http_response_code(409);
    echo json_encode(['error' => 'Your CaterAI Pro subscription is already active.']);
    exit;
}

$request = json_decode(file_get_contents('php://input') ?: '', true);
$plan = is_array($request) ? ($request['plan'] ?? '') : '';
$plans = [
    'monthly' => ['amount' => 49900, 'name' => 'CaterAI Pro - Monthly'],
    'yearly' => ['amount' => 479000, 'name' => 'CaterAI Pro - Yearly'],
];
if (!is_string($plan) || !isset($plans[$plan])) {
    http_response_code(400);
    echo json_encode(['error' => 'Choose a valid subscription plan.']);
    exit;
}

$mode = app_env_value('PAYMONGO_MODE');
$secretKey = app_env_value('PAYMONGO_SECRET_KEY');
$frontendUrl = rtrim(app_env_value('FRONTEND_URL'), '/');
$appEnvironment = app_env_value('APP_ENV', 'development');
$isHttpsRequest = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
$expectedKeyPrefix = $mode === 'live' ? 'sk_live_' : ($mode === 'test' ? 'sk_test_' : '');
if (
    $expectedKeyPrefix === ''
    || !str_starts_with($secretKey, $expectedKeyPrefix)
    || $frontendUrl === ''
    || ($mode === 'live' && ($appEnvironment !== 'production' || !str_starts_with($frontendUrl, 'https://') || !$isHttpsRequest))
) {
    error_log('PayMongo checkout is not configured for the selected mode.');
    http_response_code(503);
    echo json_encode(['error' => 'PayMongo checkout is not configured for this environment.']);
    exit;
}

$referenceNumber = 'CATERAI-' . $catererId . '-' . bin2hex(random_bytes(12));
$checkoutPayload = [
    'data' => [
        'attributes' => [
            'payment_method_types' => ['qrph'],
            'line_items' => [[
                'currency' => 'PHP',
                'amount' => $plans[$plan]['amount'],
                'quantity' => 1,
                'name' => $plans[$plan]['name'],
            ]],
            'reference_number' => $referenceNumber,
            'success_url' => $frontendUrl . '/dashboard/caterer/services?subscription=success',
            'cancel_url' => $frontendUrl . '/dashboard/caterer/services?subscription=cancelled',
        ],
    ],
];

$curl = curl_init('https://api.paymongo.com/v2/checkout_sessions');
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($checkoutPayload),
    CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
    CURLOPT_USERPWD => $secretKey . ':',
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => true,
]);
$rawResponse = curl_exec($curl);
$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
$curlError = curl_error($curl);
curl_close($curl);
$checkoutResponse = json_decode(is_string($rawResponse) ? $rawResponse : '', true);
$checkoutData = $checkoutResponse['data'] ?? [];
$checkoutAttributes = $checkoutData['attributes'] ?? [];
$checkoutId = $checkoutData['id'] ?? '';
$checkoutUrl = $checkoutAttributes['checkout_url'] ?? '';
if ($curlError !== '' || $status < 200 || $status >= 300 || !is_string($checkoutId) || $checkoutId === '' || !is_string($checkoutUrl) || $checkoutUrl === '') {
    error_log('PayMongo checkout creation failed with HTTP ' . $status . ($curlError !== '' ? ': ' . $curlError : '.'));
    http_response_code(502);
    echo json_encode(['error' => 'PayMongo could not start checkout. Please try again.']);
    exit;
}

$saved = supabase_request('POST', 'caterer_subscriptions', [], [
    'caterer_id' => $catererId,
    'plan' => $plan,
    'amount' => $plans[$plan]['amount'],
    'currency' => 'PHP',
    'status' => 'pending',
    'paymongo_checkout_session_id' => $checkoutId,
    'reference_number' => $referenceNumber,
], 'return=minimal');
if (!$saved['ok']) {
    error_log('PayMongo checkout could not be linked to a subscription: ' . ($saved['error'] ?: 'Supabase request failed.'));
    http_response_code(500);
    echo json_encode(['error' => 'Checkout was created but could not be saved. Please contact support before retrying.']);
    exit;
}

echo json_encode(['checkout_url' => $checkoutUrl]);
?>
