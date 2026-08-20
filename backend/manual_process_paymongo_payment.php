<?php
require_once __DIR__ . '/paymongo_handler.php';
header_remove();

if ($argc < 3) {
    echo "Usage: php manual_process_paymongo_payment.php <paymongo_payment_id> <reservation_id>\n";
    exit(1);
}
$paymentId = $argv[1];
$reservationId = intval($argv[2]);

$handler = new PayMongoHandler(PAYMONGO_PUBLIC_KEY, PAYMONGO_SECRET_KEY);
$resp = $handler->getPaymentStatus($paymentId);
if (empty($resp) || empty($resp['success'])) {
    echo "Failed to fetch payment from PayMongo: ";
    var_export($resp);
    exit(1);
}
// normalize payload
$data = $resp['data'] ?? $resp;
// try multiple shapes
$attributes = null;
if (isset($data['data']['attributes'])) {
    $attributes = $data['data']['attributes'];
} elseif (isset($data['attributes'])) {
    $attributes = $data['attributes'];
}
if (!$attributes) {
    echo "Could not parse PayMongo response structure\n";
    var_export($resp);
    exit(1);
}
$status = $attributes['status'] ?? null;
$metadata = $attributes['metadata'] ?? [];

if (!in_array($status, ['paid','succeeded','completed'], true)) {
    echo "Payment status is not completed: {$status}\n";
    // still insert audit
}

// record audit in webhook_events
$payload_json = json_encode($resp['data'] ?? $resp);
$headers_json = json_encode(['manual_import' => true]);
$stmt = $conn->prepare('INSERT INTO webhook_events (event_type, payload, headers, reservation_id, processed) VALUES (?, ?, ?, ?, 1)');
$event_type = 'manual_import_payment';
$res_id = $reservationId;
if ($stmt) {
    $stmt->bind_param('sssi', $event_type, $payload_json, $headers_json, $res_id);
    $stmt->execute();
    $stmt->close();
}

// update reservations and payments like webhook handler
if (in_array($status, ['paid','succeeded','completed'], true)) {
    $payment_id_found = $paymentId;
    $payment_intent = $attributes['payment_intent_id'] ?? ($attributes['payment_intent'] ?? null);

    $update = $conn->prepare("UPDATE reservations SET payment_status = 'completed', webhook_received_at = NOW(), paymongo_payment_id = ?, paymongo_payment_intent_id = ? WHERE id = ?");
    if ($update) {
        $update->bind_param('ssi', $payment_id_found, $payment_intent, $reservationId);
        $update->execute();
        $update->close();
    }

    // get advance amount
    $adv = null;
    $r = $conn->prepare('SELECT advance_payment FROM reservations WHERE id = ? LIMIT 1');
    if ($r) {
        $r->bind_param('i', $reservationId);
        $r->execute();
        $res = $r->get_result();
        if ($row = $res->fetch_assoc()) {
            $adv = $row['advance_payment'];
        }
        $r->close();
    }

    if ($adv !== null) {
        $ins = $conn->prepare("INSERT INTO payments (reservation_id, amount, payment_method, payment_date, reference_number, payment_status, provider, external_id, webhook_payload) VALUES (?, ?, 'e-wallet', CURDATE(), ?, 'completed', 'paymongo', ?, ?)");
        if ($ins) {
            $ref = $payment_id_found;
            $web = $payload_json;
            $ins->bind_param('idsss', $reservationId, $adv, $ref, $ref, $web);
            $ins->execute();
            $ins->close();
        }
    }

    echo "Reservation {$reservationId} marked completed and payment recorded.\n";
} else {
    echo "Payment not in completed state: {$status}\n";
}

?>