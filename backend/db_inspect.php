<?php
require_once __DIR__ . '/config.php';
header_remove();

echo "--- payments ---\n";
$res = $conn->query('SELECT id,reservation_id,amount,payment_method,payment_date,reference_number,payment_status,provider,external_id,created_at,webhook_payload FROM payments ORDER BY created_at DESC LIMIT 20');
if (!$res) { echo 'payments query failed: ' . $conn->error . "\n"; exit(1); }
while ($r = $res->fetch_assoc()) {
    echo json_encode($r, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
}

echo "\n--- reservations matching 22500 ---\n";
$r2 = $conn->query("SELECT id,advance_payment,total_amount,event_date,customer_id,caterer_id,payment_status,reservation_status,created_at FROM reservations WHERE advance_payment = 22500 OR advance_payment = 22500.00 OR total_amount = 22500 ORDER BY created_at DESC");
if ($r2) {
    while ($x = $r2->fetch_assoc()) {
        echo json_encode($x) . "\n";
    }
} else {
    echo 'reservation query failed: ' . $conn->error . "\n";
}

echo "\n--- webhook_events (recent) ---\n";
$r3 = $conn->query('SELECT id,reservation_id,payload,received_at FROM webhook_events ORDER BY received_at DESC LIMIT 20');
if ($r3) {
    while ($w = $r3->fetch_assoc()) {
        $payload_snip = substr($w['payload'], 0, 400);
        echo "ID:" . $w['id'] . " res:" . $w['reservation_id'] . " received:" . $w['received_at'] . " payload:" . $payload_snip . "\n";
    }
} else {
    echo 'webhook_events query failed: ' . $conn->error . "\n";
}

?>