<?php
require_once __DIR__ . '/config.php';

header_remove();
// CLI-friendly output
echo "=== Last 10 reservations (most recent first) ===\n\n";

$sql = "SELECT id, customer_id, caterer_id, package_id, event_date, event_time, advance_payment, balance_amount, payment_status, reservation_status, created_at FROM reservations ORDER BY created_at DESC LIMIT 10";
$res = $conn->query($sql);
if (!$res) {
    echo "DB query failed: " . $conn->error . "\n";
    exit(1);
}

while ($row = $res->fetch_assoc()) {
    echo sprintf("ID: %d | customer_id: %d | caterer_id: %d | package_id: %d\n", $row['id'], $row['customer_id'], $row['caterer_id'], $row['package_id']);
    echo sprintf("  event: %s %s | guests: %s\n", $row['event_date'], $row['event_time'], $row['guest_count'] ?? '');
    echo sprintf("  advance: %s | balance: %s\n", $row['advance_payment'], $row['balance_amount']);
    echo sprintf("  payment_status: %s | reservation_status: %s | created_at: %s\n", $row['payment_status'], $row['reservation_status'], $row['created_at']);
    echo "------------------------------------------------------------\n";
}

echo "\nDone.\n";

?>
