<?php
require_once __DIR__ . '/config.php';
header_remove();
$log = __DIR__ . '/paymongo_webhook.log';
if (!file_exists($log)) {
    echo "log not found\n";
    exit(1);
}
$lines = file($log, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$inserted = 0;
foreach ($lines as $line) {
    $pos = strpos($line, '{');
    if ($pos === false) continue;
    $json = substr($line, $pos);
    $obj = json_decode($json, true);
    if (!$obj) continue;
    // If entry includes 'body' which is a JSON string, decode it
    $body_raw = $obj['body'] ?? null;
    if ($body_raw) {
        $payload = json_decode($body_raw, true);
    } else {
        $payload = $obj;
    }
    $event_type = $payload['type'] ?? ($payload['data']['type'] ?? null);
    $reservation_id = null;
    if (isset($payload['data']['attributes']['metadata']['reservation_id'])) {
        $reservation_id = intval($payload['data']['attributes']['metadata']['reservation_id']);
    } elseif (isset($obj['metadata']['reservation_id'])) {
        $reservation_id = intval($obj['metadata']['reservation_id']);
    }
    $payload_json = is_string($body_raw) ? $body_raw : json_encode($payload);
    $headers_json = json_encode($obj['headers'] ?? []);
    // skip duplicates by matching payload text in table
    $escaped = $conn->real_escape_string(substr($payload_json,0,200));
    $check = $conn->query("SELECT id FROM webhook_events WHERE LEFT(payload,200) = '".$escaped."' LIMIT 1");
    if ($check && $check->num_rows > 0) continue;
    if ($reservation_id === null) {
        $stmt = $conn->prepare('INSERT INTO webhook_events (event_type, payload, headers, processed) VALUES (?, ?, ?, 0)');
        $stmt->bind_param('sss', $event_type, $payload_json, $headers_json);
        $stmt->execute();
        $stmt->close();
        $inserted++;
    } else {
        $stmt = $conn->prepare('INSERT INTO webhook_events (event_type, payload, headers, reservation_id, processed) VALUES (?, ?, ?, ?, 0)');
        $stmt->bind_param('sssi', $event_type, $payload_json, $headers_json, $reservation_id);
        $stmt->execute();
        $stmt->close();
        $inserted++;
    }
}

echo "Inserted: $inserted\n";
?>