<?php
ini_set('display_errors', '0');
ini_set('log_errors', '1');
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^https?:\/\/localhost:\d+$/', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

function gcash_receipt_respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

function gcash_receipt_storage_request(string $method, string $path, ?string $contents = null, string $contentType = 'application/json'): array
{
    global $supabase_url, $supabase_service_role_key;

    $segments = array_map('rawurlencode', explode('/', trim($path, '/')));
    $url = $supabase_url . '/storage/v1/object/gcash-payment-receipts/' . implode('/', $segments);
    $headers = [
        'apikey: ' . $supabase_service_role_key,
        'Authorization: Bearer ' . $supabase_service_role_key,
        'Content-Type: ' . $contentType,
    ];
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    if ($contents !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, $contents);

    $response = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    return [
        'ok' => $error === '' && $status >= 200 && $status < 300,
        'status' => $status,
        'error' => $error,
        'body' => $response,
    ];
}

function gcash_receipt_submit_as_customer(string $token, array $payload): array
{
    global $supabase_url;

    $anonKey = app_env_value('VITE_SUPABASE_ANON_KEY');
    if ($anonKey === '') {
        return ['ok' => false, 'status' => 0, 'error' => 'Supabase anonymous key is not configured.', 'ambiguous' => false];
    }

    $curl = curl_init($supabase_url . '/rest/v1/rpc/submit_gcash_payment');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $anonKey,
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $response = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    $data = json_decode($response ?: '', true);
    return [
        'ok' => $error === '' && $status >= 200 && $status < 300,
        'status' => $status,
        'error' => $error ?: (is_array($data) ? (string) ($data['message'] ?? $data['details'] ?? '') : ''),
        'data' => $data,
        'ambiguous' => $error !== '',
    ];
}

function gcash_receipt_cleanup(string $path): void
{
    $storage = gcash_receipt_storage_request('DELETE', $path);
    $screening = supabase_request('DELETE', 'gcash_receipt_ai_checks', [
        'receipt_path' => 'eq.' . $path,
    ], null, 'return=minimal');
    if (!$storage['ok']) error_log('Could not remove an unsubmitted GCash receipt from storage.');
    if (!$screening['ok']) error_log('Could not remove an unsubmitted GCash receipt screening record.');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    gcash_receipt_respond(405, ['success' => false, 'error' => 'Invalid method.']);
}

require_once __DIR__ . '/config.php';

$user = supabase_current_user();
if (!$user['ok'] || $user['role'] !== 'customer' || empty($user['customer_id'])) {
    gcash_receipt_respond(401, ['success' => false, 'error' => $user['error'] ?? 'Please sign in as a customer first.']);
}

$reservationId = filter_var($_POST['reservation_id'] ?? null, FILTER_VALIDATE_INT);
$paymentType = (string) ($_POST['payment_type'] ?? '');
if (
    (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 6 * 1024 * 1024
    && empty($_FILES)
    && empty($_POST)
) {
    gcash_receipt_respond(413, ['success' => false, 'error' => 'The upload exceeds the server limit. PHP must allow at least 6MB for this request.']);
}
if (!$reservationId || !in_array($paymentType, ['down_payment', 'balance'], true)) {
    gcash_receipt_respond(422, ['success' => false, 'error' => 'Select a valid booking payment.']);
}

$reservationResponse = supabase_request('GET', 'reservations', [
    'select' => 'id,customer_id,caterer_id,reservation_status,payment_status,booking_payment_method',
    'id' => 'eq.' . $reservationId,
    'customer_id' => 'eq.' . $user['customer_id'],
    'limit' => '1',
]);
$reservation = supabase_row($reservationResponse);
if (!$reservationResponse['ok']) {
    error_log('Could not validate a GCash receipt reservation. HTTP ' . $reservationResponse['status']);
    gcash_receipt_respond(502, ['success' => false, 'error' => 'Could not validate this booking. Please try again.']);
}
if (!$reservation) {
    gcash_receipt_respond(404, ['success' => false, 'error' => 'Booking not found.']);
}
if (($reservation['booking_payment_method'] ?? '') !== 'gcash') {
    gcash_receipt_respond(422, ['success' => false, 'error' => 'This booking is not set up for GCash payment.']);
}
$paymentAvailable = $paymentType === 'down_payment'
    ? $reservation['reservation_status'] === 'pending' && $reservation['payment_status'] === 'pending'
    : $reservation['reservation_status'] === 'confirmed' && $reservation['payment_status'] === 'partial';
if (!$paymentAvailable) {
    gcash_receipt_respond(409, ['success' => false, 'error' => 'This payment is not available for the selected booking.']);
}

$catererResponse = supabase_request('GET', 'caterers', [
    'select' => 'gcash_qr_code',
    'id' => 'eq.' . $reservation['caterer_id'],
    'limit' => '1',
]);
$caterer = supabase_row($catererResponse);
if (!$catererResponse['ok']) {
    error_log('Could not validate the GCash payment destination. HTTP ' . $catererResponse['status']);
    gcash_receipt_respond(502, ['success' => false, 'error' => 'Could not validate the GCash payment destination. Please try again.']);
}
if (empty($caterer['gcash_qr_code'])) {
    gcash_receipt_respond(422, ['success' => false, 'error' => 'This caterer has not added a GCash QR code.']);
}

$pendingPaymentResponse = supabase_request('GET', 'payments', [
    'select' => 'id',
    'reservation_id' => 'eq.' . $reservationId,
    'payment_type' => 'eq.' . $paymentType,
    'payment_method' => 'eq.gcash',
    'payment_status' => 'eq.pending',
    'limit' => '1',
]);
if (!$pendingPaymentResponse['ok']) {
    error_log('Could not check for a pending GCash receipt. HTTP ' . $pendingPaymentResponse['status']);
    gcash_receipt_respond(502, ['success' => false, 'error' => 'Could not check this payment. Please try again.']);
}
if (supabase_row($pendingPaymentResponse)) {
    gcash_receipt_respond(409, ['success' => false, 'error' => 'A GCash receipt is already waiting for caterer review.']);
}

$receipt = $_FILES['receipt'] ?? null;
if (!is_array($receipt)) {
    gcash_receipt_respond(400, ['success' => false, 'error' => 'Choose a valid receipt image smaller than 5MB.']);
}
$uploadError = (int) ($receipt['error'] ?? UPLOAD_ERR_NO_FILE);
if ($uploadError !== UPLOAD_ERR_OK || !is_uploaded_file($receipt['tmp_name'] ?? '')) {
    if (in_array($uploadError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
        gcash_receipt_respond(413, ['success' => false, 'error' => 'The receipt exceeds the server upload limit. PHP upload_max_filesize and post_max_size must allow at least 6MB.']);
    }
    gcash_receipt_respond(400, ['success' => false, 'error' => 'Choose a valid receipt image smaller than 5MB.']);
}
if ((int) $receipt['size'] < 1 || (int) $receipt['size'] > 5 * 1024 * 1024) {
    gcash_receipt_respond(413, ['success' => false, 'error' => 'Receipt image must not exceed 5MB.']);
}

$mime = (new finfo(FILEINFO_MIME_TYPE))->file($receipt['tmp_name']);
$extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
if (!is_string($mime) || !isset($extensions[$mime])) {
    gcash_receipt_respond(422, ['success' => false, 'error' => 'Receipt must be a JPG, PNG, or WEBP image.']);
}

$sightengineUser = app_env_value('SIGHTENGINE_API_USER');
$sightengineSecret = app_env_value('SIGHTENGINE_API_SECRET');
if ($sightengineUser === '' || $sightengineSecret === '') {
    error_log('Sightengine credentials are not configured for GCash receipt screening.');
    gcash_receipt_respond(503, ['success' => false, 'error' => 'AI receipt screening is not configured. Please contact support.']);
}

$sightengineCurl = curl_init('https://api.sightengine.com/1.0/check.json');
curl_setopt_array($sightengineCurl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => [
        'media' => new CURLFile($receipt['tmp_name'], $mime, basename((string) $receipt['name'])),
        'models' => 'genai',
        'api_user' => $sightengineUser,
        'api_secret' => $sightengineSecret,
    ],
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 35,
    CURLOPT_SSL_VERIFYPEER => true,
]);
$sightengineBody = curl_exec($sightengineCurl);
$sightengineStatus = curl_getinfo($sightengineCurl, CURLINFO_HTTP_CODE);
$sightengineError = curl_error($sightengineCurl);
curl_close($sightengineCurl);
$sightengineResult = json_decode($sightengineBody ?: '', true);
$aiProbability = $sightengineResult['type']['ai_generated'] ?? null;
if (
    $sightengineError !== ''
    || $sightengineStatus < 200
    || $sightengineStatus >= 300
    || ($sightengineResult['status'] ?? '') !== 'success'
    || !is_numeric($aiProbability)
    || (float) $aiProbability < 0
    || (float) $aiProbability > 1
) {
    error_log('Sightengine GCash receipt screening failed. HTTP ' . $sightengineStatus . ($sightengineError !== '' ? ': ' . $sightengineError : ''));
    gcash_receipt_respond(502, ['success' => false, 'error' => 'Could not screen this receipt right now. Your receipt was not submitted; please try again.']);
}

$contents = file_get_contents($receipt['tmp_name']);
if (!is_string($contents)) {
    gcash_receipt_respond(400, ['success' => false, 'error' => 'Could not read the receipt image.']);
}
$owner = (string) $user['auth_user']['id'];
$receiptPath = $owner . '/' . $reservationId . '/' . bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
$storageUpload = gcash_receipt_storage_request('POST', $receiptPath, $contents, $mime);
if (!$storageUpload['ok']) {
    $cleanup = gcash_receipt_storage_request('DELETE', $receiptPath);
    if (!$cleanup['ok']) error_log('Could not clean up an incomplete GCash receipt upload.');
    error_log('GCash receipt storage upload failed. HTTP ' . $storageUpload['status']);
    gcash_receipt_respond(502, ['success' => false, 'error' => 'Could not save your receipt. Please try again.']);
}

$probability = round((float) $aiProbability, 5);
$screeningRecord = supabase_request('POST', 'gcash_receipt_ai_checks', [], [
    'receipt_path' => $receiptPath,
    'customer_auth_user_id' => $owner,
    'reservation_id' => (int) $reservationId,
    'payment_type' => $paymentType,
    'ai_generated_probability' => $probability,
    'requires_manual_review' => $probability >= 0.3,
    'sightengine_request_id' => (string) ($sightengineResult['request']['id'] ?? ''),
], 'return=representation');
if (!$screeningRecord['ok']) {
    gcash_receipt_cleanup($receiptPath);
    error_log('GCash receipt screening result could not be saved. HTTP ' . $screeningRecord['status']);
    gcash_receipt_respond(502, ['success' => false, 'error' => 'The receipt screening result could not be saved. Please try again.']);
}

$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
    gcash_receipt_cleanup($receiptPath);
    gcash_receipt_respond(401, ['success' => false, 'error' => 'Please sign in again before submitting your receipt.']);
}
$submission = gcash_receipt_submit_as_customer($matches[1], [
    'p_reservation_id' => (int) $reservationId,
    'p_payment_type' => $paymentType,
    'p_receipt_path' => $receiptPath,
]);
if (!$submission['ok']) {
    if (!$submission['ambiguous']) gcash_receipt_cleanup($receiptPath);
    else error_log('GCash payment submission result was ambiguous; receipt and screening record were retained.');
    error_log('GCash payment submission failed. HTTP ' . $submission['status']);
    $message = $submission['ambiguous']
        ? 'We could not confirm whether your receipt was submitted. Refresh your bookings before trying again.'
        : ($submission['error'] ?: 'Could not submit the GCash receipt.');
    gcash_receipt_respond($submission['ambiguous'] ? 502 : 422, ['success' => false, 'error' => $message]);
}

gcash_receipt_respond(200, [
    'success' => true,
    'payment_id' => $submission['data'],
    'ai_generated_probability' => $probability,
    'requires_manual_review' => $probability >= 0.3,
]);
?>
