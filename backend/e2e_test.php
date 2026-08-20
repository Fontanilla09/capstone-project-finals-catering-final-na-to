<?php
// End-to-end test: create reservation, create checkout session, simulate webhook
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/paymongo_handler.php';

// ensure site_url works in CLI
if (!isset($_SERVER['HTTP_HOST'])) {
    $_SERVER['HTTP_HOST'] = 'localhost';
}

// create a test reservation
$customer_id = 3;
$caterer_id = 2;
$package_id = 2;
$event_date = date('Y-m-d', strtotime('+7 days'));
$event_time = '12:00:00';
$location = 'Test Venue - 123 Test St';
$guest_count = 50;
$total = 10000.00;
$advance = round($total * 0.30, 2);
$balance = $total - $advance;

$ins = $conn->prepare("INSERT INTO reservations (customer_id, caterer_id, package_id, event_date, event_time, event_type, location, guest_count, total_amount, advance_payment, balance_amount, payment_status, reservation_status, special_requests) VALUES (?, ?, ?, ?, ?, 'Test', ?, ?, ?, ?, ?, 'pending', 'pending', '')");
$ins->bind_param('iiissiiddd', $customer_id, $caterer_id, $package_id, $event_date, $event_time, $location, $guest_count, $total, $advance, $balance);
if (!$ins->execute()) {
    echo "Failed to insert reservation: " . $conn->error . "\n";
    exit(1);
}
$reservation_id = $conn->insert_id;
$ins->close();

echo "Created reservation id: $reservation_id\n";

$handler = new PayMongoHandler(PAYMONGO_PUBLIC_KEY, PAYMONGO_SECRET_KEY);
$description = 'E2E test down payment';
$metadata = ['reservation_id' => $reservation_id];
$resp = $handler->createPaymentLink($caterer_id, $description, $advance, $metadata);

echo "createPaymentLink response success: " . var_export($resp['success'] ?? false, true) . "\n";
$checkout = $resp['checkout_url'] ?? ($resp['data']['data']['attributes']['checkout_url'] ?? null);
echo "checkout_url: " . ($checkout ?? 'none') . "\n";

// simulate webhook
$payload = json_encode(['data' => ['attributes' => ['status' => 'paid', 'metadata' => ['reservation_id' => (string)$reservation_id]]]]);
$ch = curl_init('http://localhost/capstone-project-finals-catering/backend/paymongo_handler.php/webhook');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$res = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
echo "Simulated webhook response HTTP $http, body: $res\n";

// show DB rows
$res = $conn->query("SELECT id, payment_status, reservation_status, paymongo_checkout_session_id, paymongo_payment_id, paymongo_payment_intent_id FROM reservations WHERE id = " . intval($reservation_id));
echo "Reservation row:\n";
print_r($res->fetch_assoc());

$p = $conn->query("SELECT * FROM payments WHERE reservation_id = " . intval($reservation_id));
echo "Payments rows:\n";
while ($row = $p->fetch_assoc()) print_r($row);

?>
