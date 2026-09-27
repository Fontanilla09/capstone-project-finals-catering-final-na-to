<?php
require_once __DIR__ . '/config.php';

function image_storage_path(string $bucket, string $path): string
{
    $segments = array_map('rawurlencode', explode('/', trim($path, '/')));
    return 'object/' . rawurlencode($bucket) . '/' . implode('/', $segments);
}

function image_storage_request(string $method, string $path, ?string $body = null, string $content_type = 'application/json'): array
{
    global $supabase_url, $supabase_service_role_key;

    $ch = curl_init($supabase_url . '/storage/v1/' . ltrim($path, '/'));
    $headers = [
        'apikey: ' . $supabase_service_role_key,
        'Authorization: Bearer ' . $supabase_service_role_key,
        'Content-Type: ' . $content_type,
    ];
    if ($method === 'POST' && strpos($path, 'object/') === 0 && strpos($path, 'object/sign/') !== 0) {
        $headers[] = 'x-upsert: true';
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);

    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    $data = json_decode($response ?: '', true);
    $message = is_array($data) ? ($data['message'] ?? $data['error'] ?? '') : '';
    return [
        'ok' => $error === '' && $status >= 200 && $status < 300,
        'status' => $status,
        'error' => $error ?: $message,
        'data' => $data,
        'body' => $response,
    ];
}

function image_storage_upload(string $path, string $contents, string $content_type): array
{
    return image_storage_request(
        'POST',
        image_storage_path('ai-visualizations', $path),
        $contents,
        $content_type
    );
}

function image_storage_signed_url(string $path, int $expires_in = 86400): ?string
{
    global $supabase_url;

    $response = image_storage_request(
        'POST',
        'object/sign/ai-visualizations/' . implode('/', array_map('rawurlencode', explode('/', trim($path, '/')))),
        json_encode(['expiresIn' => $expires_in])
    );
    $signed_url = $response['data']['signedURL'] ?? null;
    if (!$response['ok'] || !is_string($signed_url) || $signed_url === '') return null;
    return str_starts_with($signed_url, 'http') ? $signed_url : $supabase_url . '/storage/v1' . $signed_url;
}

function image_storage_delete(string $path): void
{
    image_storage_request('DELETE', image_storage_path('ai-visualizations', $path));
}

function log_image_failure(string $component, string $message, array $details = []): void
{
    $safe_details = [];
    foreach (['http_status', 'provider_status'] as $key) {
        if (isset($details[$key]) && is_numeric($details[$key])) {
            $safe_details[$key] = (int) $details[$key];
        }
    }

    $result = supabase_request('POST', 'system_health_events', [], [
        'component' => $component,
        'severity' => 'error',
        'message' => substr($message, 0, 255),
        'details' => $safe_details,
    ], 'return=minimal');
    if (!$result['ok']) error_log('System health event could not be recorded.');
}

function image_provider_request(string $method, string $endpoint, ?array $payload = null): array
{
    global $app_env;

    $api_key = trim((string) ($app_env['NANOBANANA_API_KEY'] ?? getenv('NANOBANANA_API_KEY') ?: ''));
    if ($api_key === '') return ['ok' => false, 'status' => 0, 'error' => 'NANOBANANA_API_KEY is not configured.', 'data' => null];

    $base_url = rtrim((string) ($app_env['NANOBANANA_API_BASE'] ?? getenv('NANOBANANA_API_BASE') ?: 'https://nanobnana.com'), '/');
    $headers = ['Accept: application/json', 'Authorization: Bearer ' . $api_key];
    if ($payload !== null) $headers[] = 'Content-Type: application/json';

    $ch = curl_init($base_url . $endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    $data = json_decode($response ?: '', true);
    $provider_error = is_array($data)
        ? ($data['error']['message'] ?? $data['message'] ?? $data['error'] ?? '')
        : '';
    return [
        'ok' => $error === '' && $status >= 200 && $status < 300,
        'status' => $status,
        'error' => $error ?: (is_string($provider_error) ? $provider_error : 'NanoBanana request failed.'),
        'data' => $data,
    ];
}

function image_task_token(array $claims): string
{
    global $supabase_service_role_key;

    $encoded = rtrim(strtr(base64_encode(json_encode($claims)), '+/', '-_'), '=');
    return $encoded . '.' . hash_hmac('sha256', $encoded, $supabase_service_role_key);
}

function image_task_claims(string $token): ?array
{
    global $supabase_service_role_key;

    $parts = explode('.', $token, 2);
    if (count($parts) !== 2) return null;
    [$encoded, $signature] = $parts;
    $expected = hash_hmac('sha256', $encoded, $supabase_service_role_key);
    if (!hash_equals($expected, $signature)) return null;

    $base64 = strtr($encoded, '-_', '+/');
    $base64 .= str_repeat('=', (4 - strlen($base64) % 4) % 4);
    $claims = json_decode(base64_decode($base64, true) ?: '', true);
    return is_array($claims) ? $claims : null;
}
?>