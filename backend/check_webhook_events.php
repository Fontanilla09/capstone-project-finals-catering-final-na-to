<?php
require_once __DIR__ . '/config.php';
header_remove();
$res = $conn->query('SELECT id, event_type, reservation_id, received_at, processed FROM webhook_events ORDER BY received_at DESC LIMIT 20');
if (!$res) {
    echo "query failed: " . $conn->error . "\n";
    exit(1);
}
while ($r = $res->fetch_assoc()) {
    echo sprintf("%d | %s | %s | %s | %s\n", $r['id'], $r['event_type'], $r['reservation_id'], $r['received_at'], $r['processed']);
}

?>