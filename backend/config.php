<?php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^https?:\/\/localhost:\d+$/', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization');

function load_env(string $path): array
{
    $values = [];
    if (!is_file($path)) return $values;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) continue;
        [$key, $value] = explode('=', $line, 2);
        $values[trim($key)] = trim(trim($value), "\"'");
    }
    return $values;
}

$app_env = load_env(__DIR__ . '/../.env');
$supabase_url = rtrim($app_env['VITE_SUPABASE_URL'] ?? getenv('SUPABASE_URL') ?: '', '/');
$supabase_service_role_key = $app_env['SUPABASE_SERVICE_ROLE_KEY'] ?? getenv('SUPABASE_SERVICE_ROLE_KEY') ?: '';

if ($supabase_url === '' || $supabase_service_role_key === '') {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Supabase server configuration is incomplete. Add SUPABASE_SERVICE_ROLE_KEY to .env.']);
    exit;
}

function supabase_request(string $method, string $table, array $query = [], ?array $body = null, string $prefer = 'return=representation'): array
{
    global $supabase_url, $supabase_service_role_key;
    $url = $supabase_url . '/rest/v1/' . ltrim($table, '/');
    if ($query) $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    $headers = [
        'apikey: ' . $supabase_service_role_key,
        'Authorization: Bearer ' . $supabase_service_role_key,
        'Content-Type: application/json',
        'Prefer: ' . $prefer,
    ];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    $data = json_decode($response ?: '', true);
    return ['ok' => $error === '' && $status >= 200 && $status < 300, 'status' => $status, 'error' => $error, 'data' => $data];
}

function supabase_current_user(): array
{
    global $supabase_url, $app_env;
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) return ['ok' => false, 'error' => 'Please sign in first.'];
    $token = $matches[1];
    $ch = curl_init($supabase_url . '/auth/v1/user');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['apikey: ' . ($app_env['VITE_SUPABASE_ANON_KEY'] ?? getenv('VITE_SUPABASE_ANON_KEY') ?: ''), 'Authorization: Bearer ' . $token],
        CURLOPT_TIMEOUT => 20,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $user = json_decode($response ?: '', true);
    if ($status !== 200 || empty($user['id'])) return ['ok' => false, 'error' => 'Your Supabase session has expired. Please sign in again.'];

    $profile = supabase_request('GET', 'users', ['select' => 'id,role', 'auth_user_id' => 'eq.' . $user['id'], 'limit' => '1']);
    $row = $profile['data'][0] ?? null;
    if (!$profile['ok'] || !$row) return ['ok' => false, 'error' => 'Your profile could not be loaded.'];
    $result = ['ok' => true, 'auth_user' => $user, 'user_id' => (int) $row['id'], 'role' => $row['role']];
    foreach (['customer' => 'customers', 'caterer' => 'caterers'] as $role => $table) {
        if ($row['role'] !== $role) continue;
        $profile = supabase_request('GET', $table, ['select' => 'id', 'user_id' => 'eq.' . $row['id'], 'limit' => '1']);
        $result[$role . '_id'] = (int) ($profile['data'][0]['id'] ?? 0);
    }
    return $result;
}

function supabase_row(array $response): ?array
{
    return is_array($response['data'] ?? null) && isset($response['data'][0]) ? $response['data'][0] : null;
}
?>
