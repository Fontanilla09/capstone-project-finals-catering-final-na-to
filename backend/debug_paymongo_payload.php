<?php
require_once __DIR__ . '/paymongo_handler.php';
$handler = new PayMongoHandler(PAYMONGO_PUBLIC_KEY, PAYMONGO_SECRET_KEY);
$reflection = new ReflectionClass($handler);
$method = $reflection->getMethod('createPaymentLink');
$method->setAccessible(true);
$payloadProperty = null;

// Build payload manually using internal logic
$metadata = [
    'customer_id' => 1,
    'caterer_id' => 2,
    'package_id' => 3,
    'reservation_id' => 4,
    'payment_type' => 'down_payment'
];

$data = [
    'data' => [
        'attributes' => [
            'payment_method_types' => ['gcash', 'card'],
            'currency' => 'PHP',
            'line_items' => [
                [
                    'name' => 'Test down payment',
                    'quantity' => 1,
                    'amount' => (int)(18000 * 100),
                    'currency' => 'PHP'
                ]
            ],
            'description' => 'Test payment',
            'redirect' => [
                'failed' => 'http://localhost/frontend/dashboard/customer.php?payment=failed',
                'success' => 'http://localhost/frontend/dashboard/customer.php?payment=success'
            ],
            'metadata' => array_map('strval', array_merge([
                'caterer_id' => 2,
                'type' => 'down_payment'
            ], $metadata))
        ]
    ]
];

echo json_encode($data, JSON_PRETTY_PRINT);
