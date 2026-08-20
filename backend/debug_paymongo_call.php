<?php
require_once __DIR__ . '/paymongo_handler.php';

$handler = new PayMongoHandler(PAYMONGO_PUBLIC_KEY, PAYMONGO_SECRET_KEY);
$metadata = [
    'customer_id' => 1,
    'caterer_id' => 2,
    'package_id' => 3,
    'reservation_id' => 4,
    'payment_type' => 'down_payment'
];

$response = $handler->createPaymentLink(2, 'Test down payment', 18000, $metadata);

echo "Response:\n";
print_r($response);
