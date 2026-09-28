<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^https?:\/\/localhost:\d+$/', $origin)) header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if (($_SERVER['REQUEST_METHOD'] ?? 'POST') === 'OPTIONS') exit;
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Invalid method.']);
    exit;
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/paypal_handler.php';

$user = supabase_current_user();
if (!$user['ok'] || ($user['role'] ?? '') !== 'caterer' || empty($user['caterer_id'])) {
    http_response_code(401);
    echo json_encode(['error' => $user['error'] ?? 'Caterer sign-in required.']);
    exit;
}

$input = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
$payout_id = (int) ($input['payout_id'] ?? 0);
$action = (string) ($input['action'] ?? 'request');
if ($payout_id <= 0 || !in_array($action, ['request', 'status'], true)) {
    http_response_code(422);
    echo json_encode(['error' => 'Invalid payout request.']);
    exit;
}

$payout_response = supabase_request('GET', 'payouts', [
    'select' => 'id,reservation_id,payment_id,caterer_id,caterer_amount,payout_status,payout_batch_id,payout_item_id',
    'id' => 'eq.' . $payout_id,
    'caterer_id' => 'eq.' . $user['caterer_id'],
    'limit' => '1',
]);
$payout = supabase_row($payout_response);
if (!$payout) {
    http_response_code(404);
    echo json_encode(['error' => 'Payout not found for this caterer.']);
    exit;
}

$caterer_response = supabase_request('GET', 'caterers', [
    'select' => 'paypal_email',
    'id' => 'eq.' . $user['caterer_id'],
    'limit' => '1',
]);
$caterer = supabase_row($caterer_response);
$recipient = trim((string) ($caterer['paypal_email'] ?? ''));
if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['error' => 'Add a valid PayPal email to your caterer profile before requesting a payout.']);
    exit;
}

if ($action === 'request') {
    if (($payout['payout_status'] ?? '') !== 'pending') {
        http_response_code(409);
        echo json_encode(['error' => 'This payout is no longer available to request.', 'payout_status' => $payout['payout_status']]);
        exit;
    }
    if ((float) $payout['caterer_amount'] <= 0 || empty($payout['payment_id'])) {
        http_response_code(422);
        echo json_encode(['error' => 'This payout has no payable amount.']);
        exit;
    }

    $payment_response = supabase_request('GET', 'payments', [
        'select' => 'id,payment_status',
        'id' => 'eq.' . $payout['payment_id'],
        'reservation_id' => 'eq.' . $payout['reservation_id'],
        'payment_status' => 'eq.completed',
        'limit' => '1',
    ]);
    if (!supabase_row($payment_response)) {
        http_response_code(409);
        echo json_encode(['error' => 'Payout is available only after its payment is completed.']);
        exit;
    }

    $claim = supabase_request('PATCH', 'payouts', [
        'id' => 'eq.' . $payout_id,
        'caterer_id' => 'eq.' . $user['caterer_id'],
        'payout_status' => 'eq.pending',
    ], ['payout_status' => 'processing', 'payout_error' => null]);
    $claimed = supabase_row($claim);
    if (!$claim['ok'] || !$claimed) {
        http_response_code(409);
        echo json_encode(['error' => 'This payout was already claimed or changed. Refresh and check its status.']);
        exit;
    }

    $result = create_paypal_payout($recipient, (float) $payout['caterer_amount'], (int) $payout['reservation_id'], $payout_id);
    if (!$result['ok']) {
        supabase_request('PATCH', 'payouts', [
            'id' => 'eq.' . $payout_id,
            'caterer_id' => 'eq.' . $user['caterer_id'],
            'payout_status' => 'eq.processing',
        ], ['payout_status' => 'failed', 'payout_error' => substr((string) ($result['error'] ?? 'PayPal payout failed.'), 0, 1000)]);
        http_response_code(502);
        echo json_encode(['error' => $result['error'] ?? 'PayPal payout failed.']);
        exit;
    }

    $item_status = strtoupper((string) ($result['item_status'] ?? ''));
    $batch_status = strtoupper((string) ($result['batch_status'] ?? ''));
    $final_status = $item_status === 'SUCCESS' || $batch_status === 'SUCCESS' ? 'paid' : 'processing';
    $updated = supabase_request('PATCH', 'payouts', [
        'id' => 'eq.' . $payout_id,
        'caterer_id' => 'eq.' . $user['caterer_id'],
    ], [
        'payout_status' => $final_status,
        'payout_batch_id' => $result['batch_id'] ?? null,
        'payout_item_id' => $result['item_id'] ?? null,
        'payout_error' => null,
        'paid_at' => $final_status === 'paid' ? gmdate('c') : null,
    ]);
    if (!$updated['ok']) {
        error_log('PayPal payout sent but payout record update failed for payout ' . $payout_id . '.');
        http_response_code(502);
        echo json_encode(['error' => 'PayPal accepted the payout, but its status could not be saved. Contact support before retrying.']);
        exit;
    }

    echo json_encode([
        'payout_status' => $final_status,
        'message' => $final_status === 'paid' ? 'PayPal reports this payout as paid.' : 'PayPal accepted the payout request. It is still processing and may not arrive immediately.',
    ]);
    exit;
}

if (empty($payout['payout_batch_id'])) {
    echo json_encode(['payout_status' => $payout['payout_status'], 'message' => 'No PayPal batch is available to check yet.']);
    exit;
}

$result = get_paypal_payout_status((string) $payout['payout_batch_id']);
if (!$result['ok']) {
    http_response_code(502);
    echo json_encode(['error' => $result['error'] ?? 'Could not refresh PayPal payout status.']);
    exit;
}
$item_status = strtoupper((string) ($result['item_status'] ?? ''));
$batch_status = strtoupper((string) ($result['batch_status'] ?? ''));
if (in_array($item_status, ['SUCCESS', 'FAILED', 'RETURNED', 'BLOCKED', 'REFUNDED'], true)) {
    $next_status = $item_status === 'SUCCESS' ? 'paid' : 'failed';
} elseif (in_array($batch_status, ['SUCCESS', 'DENIED'], true)) {
    $next_status = $batch_status === 'SUCCESS' ? 'paid' : 'failed';
} else {
    $next_status = 'processing';
}

$update_fields = [
    'payout_status' => $next_status,
    'payout_item_id' => $result['item_id'] ?? $payout['payout_item_id'],
];
if ($next_status === 'paid') $update_fields['paid_at'] = gmdate('c');
if ($next_status === 'failed') $update_fields['payout_error'] = 'PayPal status: ' . ($item_status ?: $batch_status);
supabase_request('PATCH', 'payouts', [
    'id' => 'eq.' . $payout_id,
    'caterer_id' => 'eq.' . $user['caterer_id'],
], $update_fields);

echo json_encode([
    'payout_status' => $next_status,
    'message' => $next_status === 'paid' ? 'PayPal reports this payout as paid.' : ($next_status === 'failed' ? 'PayPal reports that this payout failed.' : 'PayPal is still processing this payout.'),
]);
?>
