<?php
require_once __DIR__ . '/config.php';

function load_env(string $path): array
{
    $values = [];
    if (!is_file($path)) {
        return $values;
    }

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if ($key !== '') {
            $values[$key] = trim($value, "\"'");
        }
    }
    return $values;
}

$paypal_env = load_env(__DIR__ . '/../.env');
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
    curl_close($ch);

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
    curl_close($ch);

    $data = json_decode($response ?: '', true);
    if ($error !== '' || $http_code !== 200 || empty($data['access_token'])) {
        return ['ok' => false, 'error' => $error ?: ($data['error_description'] ?? 'PayPal authentication failed.')];
    }
    return ['ok' => true, 'token' => $data['access_token']];
}

function create_paypal_order(int $reservation_id, float $amount, string $description, string $payment_type = 'down_payment'): array
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
    $response = paypal_request_with_token('POST', '/v2/checkout/orders', [
        'intent' => 'CAPTURE',
        'purchase_units' => [[
            'reference_id' => (string) $reservation_id,
            'description' => $description,
            'amount' => ['currency_code' => 'PHP', 'value' => number_format($amount, 2, '.', '')],
        ]],
        'application_context' => [
            'brand_name' => 'CaterAI',
            'user_action' => 'PAY_NOW',
            'return_url' => $app_url . '/backend/paypal_return.php?reservation_id=' . $reservation_id . '&payment_type=' . rawurlencode($payment_type) . '&signature=' . $callback_signature . '&ngrok-skip-browser-warning=1',
            'cancel_url' => $frontend_url . '/book?payment=cancelled',
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
    curl_close($ch);
    return [
        'ok' => $error === '' && $http_code >= 200 && $http_code < 300,
        'status' => $http_code,
        'error' => $error,
        'data' => json_decode($response ?: '', true),
    ];
}

function trigger_auto_payout_for_reservation(mysqli $conn, int $reservation_id): array
{
    $query = $conn->prepare("SELECT po.id, po.reservation_id, po.caterer_amount, po.payout_status, c.paypal_email FROM payouts po JOIN caterers c ON c.id = po.caterer_id WHERE po.reservation_id = ? LIMIT 1");
    if (!$query) {
        return ['ok' => false, 'error' => 'Unable to prepare payout lookup.'];
    }
    $query->bind_param('i', $reservation_id);
    $query->execute();
    $payout = $query->get_result()->fetch_assoc();
    $query->close();

    if (!$payout) {
        return ['ok' => true, 'skipped' => true, 'status' => 'not_found'];
    }

    if (!in_array($payout['payout_status'], ['pending', 'failed'], true)) {
        return ['ok' => true, 'skipped' => true, 'status' => $payout['payout_status']];
    }

    if (!filter_var(trim((string) ($payout['paypal_email'] ?? '')), FILTER_VALIDATE_EMAIL)) {
        $error = 'Caterer PayPal email is missing or invalid.';
        $update = $conn->prepare("UPDATE payouts SET payout_status = 'failed', payout_error = ? WHERE id = ? AND payout_status IN ('pending', 'failed')");
        $update->bind_param('si', $error, $payout['id']);
        $update->execute();
        $update->close();
        return ['ok' => false, 'error' => $error, 'skipped' => false];
    }

    $claim = $conn->prepare("UPDATE payouts SET payout_status = 'processing', payout_error = NULL WHERE id = ? AND payout_status IN ('pending', 'failed')");
    $claim->bind_param('i', $payout['id']);
    $claim->execute();
    $claim->close();

    $result = create_paypal_payout($payout['paypal_email'], (float) $payout['caterer_amount'], (int) $payout['reservation_id']);
    if (!$result['ok']) {
        $error = $result['error'] ?? 'PayPal payout failed.';
        $update = $conn->prepare("UPDATE payouts SET payout_status = 'failed', payout_error = ? WHERE id = ?");
        $update->bind_param('si', $error, $payout['id']);
        $update->execute();
        $update->close();
        return ['ok' => false, 'error' => $error, 'skipped' => false];
    }

    $status = strtoupper($result['item_status'] ?? '') === 'SUCCESS' ? 'paid' : 'processing';
    $reference = $result['item_id'] ?: $result['batch_id'];
    $update = $conn->prepare("UPDATE payouts SET payout_status = ?, payout_reference = ?, payout_batch_id = ?, payout_item_id = ?, paid_at = IF(? = 'paid', NOW(), NULL) WHERE id = ?");
    $update->bind_param('sssssi', $status, $reference, $result['batch_id'], $result['item_id'], $status, $payout['id']);
    $update->execute();
    $update->close();

    return ['ok' => true, 'status' => $status, 'skipped' => false];
}

function create_paypal_payout(string $recipient_email, float $amount, int $reservation_id): array
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

    $batch_id = 'CATERAI-' . $reservation_id . '-' . strtoupper(bin2hex(random_bytes(5)));
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
            'sender_item_id' => 'RES-' . $reservation_id,
        ]],
    ], $token['token']);

    if (!$response['ok']) {
        return ['ok' => false, 'error' => $response['data']['message'] ?? 'Unable to create PayPal payout.'];
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
?>
