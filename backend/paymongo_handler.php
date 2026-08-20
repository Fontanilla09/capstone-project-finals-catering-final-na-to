<?php
/**
 * PayMongo Payment Handler for Catering Services
 * Integrates GCash and other payment methods
 */

require_once __DIR__ . '/config.php';

function loadEnvFile(string $path): array {
    $data = [];
    if (!file_exists($path)) {
        return $data;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) {
            continue;
        }
        if (strpos($line, '=') === false) {
            continue;
        }
        list($key, $value) = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if ($key === '') {
            continue;
        }
        if ((substr($value, 0, 1) === '"' && substr($value, -1) === '"') || (substr($value, 0, 1) === "'" && substr($value, -1) === "'")) {
            $value = substr($value, 1, -1);
        }
        $data[$key] = $value;
        putenv("$key=$value");
        $_ENV[$key] = $value;
    }
    return $data;
}

$env = loadEnvFile(__DIR__ . '/../.env');

// PayMongo API Configuration
define('PAYMONGO_PUBLIC_KEY', $env['PAYMONGO_PUBLIC_KEY'] ?? getenv('PAYMONGO_PUBLIC_KEY') ?: 'pk_test_YOUR_PUBLIC_KEY_HERE');
define('PAYMONGO_SECRET_KEY', $env['PAYMONGO_SECRET_KEY'] ?? getenv('PAYMONGO_SECRET_KEY') ?: 'sk_test_YOUR_SECRET_KEY_HERE');
define('PAYMONGO_API_URL', 'https://api.paymongo.com/v1');
define('PAYMONGO_TEST_MODE', ($env['PAYMONGO_TEST_MODE'] ?? getenv('PAYMONGO_TEST_MODE')) === 'true');

class PayMongoHandler {
    private $public_key;
    private $secret_key;

    public function __construct($public_key, $secret_key) {
        $this->public_key = $public_key;
        $this->secret_key = $secret_key;
    }

    /**
     * Create a Payment Link for GCash
     * @param int $caterer_id
     * @param string $description
     * @param float $amount
     * @param array $metadata
     * @return array
     */
    public function createPaymentLink($caterer_id, $description, $amount, $metadata = []) {
        $metadata = array_map('strval', array_merge([
            'caterer_id' => $caterer_id,
            'type' => 'down_payment'
        ], $metadata));

        $data = [
            'data' => [
                'attributes' => [
                    'payment_method_types' => ['gcash', 'card'],
                    'currency' => 'PHP',
                    'line_items' => [
                        [
                            'name' => $description,
                            'quantity' => 1,
                            'amount' => (int)($amount * 100),
                            'currency' => 'PHP'
                        ]
                    ],
                    'description' => $description,
                    'redirect' => [
                        'failed' => site_url('/frontend/dashboard/customer.php?payment=failed'),
                        'success' => site_url('/frontend/dashboard/customer.php?payment=success')
                    ],
                    'metadata' => $metadata
                ]
            ]
        ];

        $response = $this->makeRequest('POST', '/checkout_sessions', $data);

        if (!empty($response['success']) && isset($response['data']['data']['attributes']['checkout_url'])) {
            $response['checkout_url'] = $response['data']['data']['attributes']['checkout_url'];
            // try to persist checkout session id to reservation if reservation_id in metadata
            $session_id = $response['data']['data']['id'] ?? null;
            $reservation_id = isset($metadata['reservation_id']) ? intval($metadata['reservation_id']) : null;
            if ($session_id && $reservation_id) {
                $stmt = $GLOBALS['conn']->prepare("UPDATE reservations SET paymongo_checkout_session_id = ? WHERE id = ?");
                if ($stmt) {
                    $stmt->bind_param('si', $session_id, $reservation_id);
                    $stmt->execute();
                    $stmt->close();
                }
            }
        }

        return $response;
    }

    /**
     * Retrieve Payment Status
     * @param string $payment_id
     * @return array
     */
    public function getPaymentStatus($payment_id) {
        return $this->makeRequest('GET', '/payments/' . $payment_id);
    }

    /**
     * Make API Request to PayMongo
     * @param string $method
     * @param string $endpoint
     * @param array $data
     * @return array
     */
    private function makeRequest($method, $endpoint, $data = []) {
        $ch = curl_init();
        
        curl_setopt_array($ch, [
            CURLOPT_URL => PAYMONGO_API_URL . $endpoint,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
            CURLOPT_USERPWD => $this->secret_key . ':',
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        if (!empty($data)) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $response = curl_exec($ch);
        $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        
        curl_close($ch);

        if ($error) {
            return [
                'success' => false,
                'error' => $error
            ];
        }

        $decoded = json_decode($response, true);
        
        return [
            'success' => ($httpcode >= 200 && $httpcode < 300),
            'httpcode' => $httpcode,
            'data' => $decoded
        ];
    }
}

/**
 * Handle Payment Webhook
 */
function handlePaymentWebhook() {
    $input = file_get_contents('php://input');
    $headers = function_exists('getallheaders') ? getallheaders() : [];

    // Log raw webhook for debugging
    write_webhook_log([
        'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'cli',
        'time' => date('Y-m-d H:i:s'),
        'headers' => $headers,
        'body' => $input
    ]);

    $payload = json_decode($input, true);

    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid webhook payload']);
        return;
    }

    // Support PayMongo webhook event wrapper and direct object payloads
    $inner = $payload['data']['attributes'] ?? [];
    if (isset($inner['data']['attributes'])) {
        $inner = $inner['data']['attributes'];
    }

    $status = $inner['status'] ?? null;
    $metadata = $inner['metadata'] ?? [];
    $eventType = $payload['data']['attributes']['type'] ?? $payload['type'] ?? null;

    if (!$status) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing payment status in webhook']);
        return;
    }

    $logEntry = [
        'status' => $status,
        'metadata' => $metadata,
        'event_type' => $eventType,
        'timestamp' => date('Y-m-d H:i:s')
    ];

    // Ensure a lightweight webhook_events table exists for auditing (visible in phpMyAdmin)
    $create_table_sql = "CREATE TABLE IF NOT EXISTS webhook_events (
        id INT PRIMARY KEY AUTO_INCREMENT,
        event_type VARCHAR(100) DEFAULT NULL,
        payload LONGTEXT,
        headers LONGTEXT,
        reservation_id INT DEFAULT NULL,
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
    $GLOBALS['conn']->query($create_table_sql);

    // Insert raw webhook into webhook_events for audit and debugging
    $event_type = $payload['type'] ?? ($payload['data']['type'] ?? null);
    $headers_json = json_encode($headers);
    $payload_json = is_string($input) ? $input : json_encode($payload);
    $res_id = !empty($metadata['reservation_id']) ? intval($metadata['reservation_id']) : null;
    if ($res_id === null) {
        $stmt_e = $GLOBALS['conn']->prepare('INSERT INTO webhook_events (event_type, payload, headers, processed) VALUES (?, ?, ?, 0)');
        if ($stmt_e) {
            $stmt_e->bind_param('sss', $event_type, $payload_json, $headers_json);
            @$stmt_e->execute();
            $stmt_e->close();
        }
    } else {
        $stmt_e = $GLOBALS['conn']->prepare('INSERT INTO webhook_events (event_type, payload, headers, reservation_id, processed) VALUES (?, ?, ?, ?, 0)');
        if ($stmt_e) {
            $stmt_e->bind_param('sssi', $event_type, $payload_json, $headers_json, $res_id);
            @$stmt_e->execute();
            $stmt_e->close();
        }
    }

    // Update reservation when PayMongo confirms payment
    // helper: recursively find PayMongo-like ids in payload
    $findPaymentIds = function ($node) {
        $found = [];
        if (is_array($node)) {
            foreach ($node as $k => $v) {
                if (is_string($v) && preg_match('/^(cs|pi|pay|pm|pmnt|payment)_[A-Za-z0-9]+$/', $v)) {
                    $found[] = $v;
                } elseif (is_array($v)) {
                    $found = array_merge($found, $GLOBALS['__finder']($v));
                }
            }
        }
        return $found;
    };
    // workaround to allow recursion closure
    $GLOBALS['__finder'] = $findPaymentIds;

    if (!empty($metadata['reservation_id'])) {
        $reservation_id = intval($metadata['reservation_id']);
        // get advance payment amount to record in payments table
        $adv_amount = null;
        $rstmt = $GLOBALS['conn']->prepare("SELECT advance_payment FROM reservations WHERE id = ? LIMIT 1");
        if ($rstmt) {
            $rstmt->bind_param('i', $reservation_id);
            $rstmt->execute();
            $rres = $rstmt->get_result();
            if ($rrow = $rres->fetch_assoc()) {
                $adv_amount = $rrow['advance_payment'];
            }
            $rstmt->close();
        }

        if (in_array($status, ['paid', 'succeeded', 'completed'], true)) {
            // Mark payment complete, but keep reservation pending for caterer acceptance.
            // attempt to extract payment ids from payload
            $ids_found = $GLOBALS['__finder']($payload);
            $payment_id = $ids_found[0] ?? null;
            $payment_intent = $ids_found[1] ?? null;

            $update = $GLOBALS['conn']->prepare("UPDATE reservations SET payment_status = 'completed', webhook_received_at = NOW(), paymongo_payment_id = ?, paymongo_payment_intent_id = ? WHERE id = ?");
            if ($update) {
                $update->bind_param('ssi', $payment_id, $payment_intent, $reservation_id);
                $ok = $update->execute();
                $update->close();
            } else {
                $ok = false;
            }
            $logEntry['db_update'] = $ok ? 'payment_status set to completed' : 'db update failed';

            // insert a payments record using advance_payment amount (if available)
            if ($adv_amount !== null) {
                $ins = $GLOBALS['conn']->prepare("INSERT INTO payments (reservation_id, amount, payment_method, payment_date, reference_number, payment_status, provider, external_id, webhook_payload) VALUES (?, ?, 'e-wallet', CURDATE(), ?, 'completed', 'paymongo', ?, ?)");
                if ($ins) {
                    $ref = $payment_id ?? ($payload['data']['id'] ?? null);
                    $web = $input;
                    $ins->bind_param('idsss', $reservation_id, $adv_amount, $ref, $ref, $web);
                    $ins->execute();
                    $ins->close();
                }
            }

            // If the webhooks come from the event wrapper, also process the inner payment data
        } elseif ($status === 'failed') {
            $update = $GLOBALS['conn']->prepare("UPDATE reservations SET payment_status = 'failed', webhook_received_at = NOW() WHERE id = ?");
            $update->bind_param('i', $reservation_id);
            $ok = $update->execute();
            $update->close();
            $logEntry['db_update'] = $ok ? 'payment_status set to failed' : 'db update failed';
        }
    } else {
        $logEntry['db_update'] = 'no reservation_id in metadata';
    }

    write_webhook_log($logEntry);

    http_response_code(200);
    echo json_encode(['success' => true]);
}

/**
 * Append structured webhook info to a log file for debugging
 * @param array $data
 */
function write_webhook_log(array $data) {
    $logFile = __DIR__ . '/paymongo_webhook.log';
    $entry = '[' . date('Y-m-d H:i:s') . '] ' . json_encode($data) . PHP_EOL . PHP_EOL;
    // Use file_put_contents with FILE_APPEND and LOCK_EX to avoid concurrent write issues
    @file_put_contents($logFile, $entry, FILE_APPEND | LOCK_EX);
}

/**
 * Helper function to get full URL
 */
function site_url($path = '') {
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    return $protocol . '://' . $host . $path;
}

// Handle incoming webhooks
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'POST' && strpos($_SERVER['REQUEST_URI'], 'webhook') !== false) {
    handlePaymentWebhook();
    exit;
}
?>
