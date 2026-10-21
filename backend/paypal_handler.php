<?php
require_once __DIR__ . '/config.php';

$paypal_env = $app_env;
$paypal_mode = $paypal_env['PAYPAL_MODE'] ?? getenv('PAYPAL_MODE') ?: 'sandbox';
$paypal_client_id = $paypal_env['PAYPAL_CLIENT_ID'] ?? getenv('PAYPAL_CLIENT_ID') ?: '';
$paypal_client_secret = $paypal_env['PAYPAL_CLIENT_SECRET'] ?? getenv('PAYPAL_CLIENT_SECRET') ?: '';
$paypal_base_url = $paypal_mode === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

function paypal_request(string $method, string $endpoint, ?array $body = null): array
{
    global $paypal_client_id, $paypal_client_secret, $paypal_base_url;

    $ch = curl_init($paypal_base_url . $endpoint);
    $headers = ['Accept: application/json', 'Content-Type: application/json'];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_USERPWD => $paypal_client_id . ':' . $paypal_client_secret,
        CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    return [
        'ok' => $error === '' && $http_code >= 200 && $http_code < 300,
        'status' => $http_code,
        'error' => $error,
        'data' => json_decode($response ?: '', true),
    ];
}

function paypal_access_token(): array
{
    global $paypal_client_id, $paypal_client_secret, $paypal_base_url;

    $ch = curl_init($paypal_base_url . '/v1/oauth2/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_USERPWD => $paypal_client_id . ':' . $paypal_client_secret,
        CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Accept-Language: en_US'],
        CURLOPT_POSTFIELDS => 'grant_type=client_credentials',
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    $data = json_decode($response ?: '', true);
    if ($error !== '' || $http_code !== 200 || empty($data['access_token'])) {
        return ['ok' => false, 'error' => $error ?: ($data['error_description'] ?? 'PayPal authentication failed.')];
    }
    return ['ok' => true, 'token' => $data['access_token']];
}

function get_admin_paypal_email(): string
{
    global $paypal_env;
    return trim((string) ($paypal_env['PAYPAL_ADMIN_EMAIL'] ?? getenv('PAYPAL_ADMIN_EMAIL') ?: ''));
}

function paypal_error_message(array $response, string $fallback): string
{
    $data = is_array($response['data'] ?? null) ? $response['data'] : [];
    $detail = is_array($data['details'][0] ?? null) ? $data['details'][0] : [];
    $issue = trim((string) ($detail['issue'] ?? ''));
    $description = trim((string) ($detail['description'] ?? ''));
    if ($issue !== '') {
        return $issue . ($description !== '' ? ': ' . $description : '');
    }

    foreach (['message', 'error_description'] as $key) {
        $message = trim((string) ($data[$key] ?? ''));
        if ($message !== '') {
            return $message;
        }
    }

    $transport_error = trim((string) ($response['error'] ?? ''));
    if ($transport_error !== '') {
        return $transport_error;
    }

    $status = (int) ($response['status'] ?? 0);
    return $status > 0 ? 'PayPal request failed with HTTP ' . $status . '.' : $fallback;
}

function create_paypal_order(int $reservation_id, float $amount, string $description, string $payment_type = 'down_payment', string $payee_email = ''): array
{
    global $paypal_base_url, $paypal_client_secret;
    $token = paypal_access_token();
    if (!$token['ok']) {
        return $token;
    }

    global $paypal_env;
    $app_url = rtrim($paypal_env['APP_URL'] ?? getenv('APP_URL') ?: 'http://localhost/capstone-project-finals-catering', '/');
    $frontend_url = rtrim($paypal_env['FRONTEND_URL'] ?? getenv('FRONTEND_URL') ?: 'http://localhost:5175', '/');
    $callback_signature = hash_hmac('sha256', $reservation_id . '|' . $payment_type, $paypal_client_secret);
    $purchase_unit = [
        'reference_id' => (string) $reservation_id,
        'description' => $description,
        'amount' => ['currency_code' => 'PHP', 'value' => number_format($amount, 2, '.', '')],
    ];
    if ($payee_email !== '') {
        $purchase_unit['payee'] = ['email_address' => $payee_email];
    }
    $response = paypal_request_with_token('POST', '/v2/checkout/orders', [
        'intent' => 'CAPTURE',
        'purchase_units' => [$purchase_unit],
        'application_context' => [
            'brand_name' => 'CaterAI',
            'user_action' => 'PAY_NOW',
            'return_url' => $app_url . '/backend/paypal_return.php?reservation_id=' . $reservation_id . '&payment_type=' . rawurlencode($payment_type) . '&signature=' . $callback_signature . '&ngrok-skip-browser-warning=1',
            'cancel_url' => $app_url . '/backend/paypal_cancel.php?reservation_id=' . $reservation_id . '&payment_type=' . rawurlencode($payment_type) . '&signature=' . $callback_signature . '&ngrok-skip-browser-warning=1',
        ],
    ], $token['token']);

    if (!$response['ok']) {
        return ['ok' => false, 'error' => $response['data']['message'] ?? 'Unable to create PayPal order.'];
    }
    foreach ($response['data']['links'] ?? [] as $link) {
        if (($link['rel'] ?? '') === 'approve') {
            return ['ok' => true, 'order_id' => $response['data']['id'], 'approval_url' => $link['href']];
        }
    }
    return ['ok' => false, 'error' => 'PayPal approval URL was not returned.'];
}

function capture_paypal_order(string $order_id): array
{
    $token = paypal_access_token();
    if (!$token['ok']) {
        return $token;
    }
    $response = paypal_request_with_token('POST', '/v2/checkout/orders/' . rawurlencode($order_id) . '/capture', null, $token['token']);
    if (!$response['ok']) {
        // A retried callback can arrive after PayPal already captured the order.
        $order = paypal_request_with_token('GET', '/v2/checkout/orders/' . rawurlencode($order_id), [], $token['token']);
        if ($order['ok'] && ($order['data']['status'] ?? '') === 'COMPLETED') {
            return ['ok' => true, 'data' => $order['data']];
        }
        return ['ok' => false, 'error' => $response['data']['message'] ?? 'Unable to capture PayPal payment.'];
    }
    return ['ok' => ($response['data']['status'] ?? '') === 'COMPLETED', 'data' => $response['data']];
}

function paypal_request_with_token(string $method, string $endpoint, ?array $body, string $token): array
{
    global $paypal_base_url;
    $ch = curl_init($paypal_base_url . $endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    return [
        'ok' => $error === '' && $http_code >= 200 && $http_code < 300,
        'status' => $http_code,
        'error' => $error,
        'data' => json_decode($response ?: '', true),
    ];
}

function create_paypal_payout(string $recipient_email, float $amount, int $reservation_id, int $payout_id, bool $retry_after_funds_added = false): array
{
    global $paypal_env;
    $payouts_enabled = $paypal_env['PAYPAL_PAYOUTS_ENABLED'] ?? getenv('PAYPAL_PAYOUTS_ENABLED') ?: 'false';
    if (strtolower($payouts_enabled) !== 'true') {
        return ['ok' => false, 'error' => 'PayPal Payouts are disabled. Set PAYPAL_PAYOUTS_ENABLED=true to enable sending.'];
    }
    $token = paypal_access_token();
    if (!$token['ok']) {
        return $token;
    }

    $batch_source = $retry_after_funds_added
        ? $payout_id . '|' . bin2hex(random_bytes(8))
        : (string) $payout_id;
    $batch_id = 'CATERAI-' . substr(hash('sha256', $batch_source), 0, 22);
    $response = paypal_request_with_token('POST', '/v1/payments/payouts', [
        'sender_batch_header' => [
            'sender_batch_id' => $batch_id,
            'email_subject' => 'You have a CaterAI payout',
            'email_message' => 'Your CaterAI booking payout is being processed.',
        ],
        'items' => [[
            'recipient_type' => 'EMAIL',
            'amount' => ['value' => number_format($amount, 2, '.', ''), 'currency' => 'PHP'],
            'receiver' => $recipient_email,
            'note' => 'CaterAI payout for reservation #' . $reservation_id,
            'sender_item_id' => 'PAYOUT-' . $payout_id,
        ]],
    ], $token['token']);

    if (!$response['ok']) {
        return ['ok' => false, 'error' => paypal_error_message($response, 'Unable to create PayPal payout.')];
    }

    $batch = $response['data']['batch_header'] ?? [];
    $payout_batch_id = $batch['payout_batch_id'] ?? $batch_id;
    $details = paypal_request_with_token('GET', '/v1/payments/payouts/' . rawurlencode($payout_batch_id), null, $token['token']);
    $item = $details['data']['items'][0] ?? [];
    return [
        'ok' => true,
        'batch_id' => $payout_batch_id,
        'batch_status' => $batch['batch_status'] ?? 'PENDING',
        'item_status' => $item['transaction_status'] ?? 'UNCLAIMED',
        'item_id' => $item['payout_item_id'] ?? null,
    ];
}

function get_paypal_payout_status(string $batch_id): array
{
    $token = paypal_access_token();
    if (!$token['ok']) return $token;

    $response = paypal_request_with_token(
        'GET',
        '/v1/payments/payouts/' . rawurlencode($batch_id),
        null,
        $token['token']
    );
    if (!$response['ok']) {
        return ['ok' => false, 'error' => paypal_error_message($response, 'Unable to check payout status.')];
    }

    $batch = $response['data']['batch_header'] ?? [];
    $item = $response['data']['items'][0] ?? [];
    return [
        'ok' => true,
        'batch_id' => $batch['payout_batch_id'] ?? $batch_id,
        'batch_status' => $batch['batch_status'] ?? 'PENDING',
        'item_status' => $item['transaction_status'] ?? 'UNCLAIMED',
        'item_id' => $item['payout_item_id'] ?? null,
    ];
}
?>
