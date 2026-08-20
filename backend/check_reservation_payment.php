<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (empty($data['reservation_id'])) {
    echo json_encode(['error' => 'missing reservation_id']);
    exit;
}

$reservation_id = intval($data['reservation_id']);
$stmt = $conn->prepare('SELECT payment_status FROM reservations WHERE id = ?');
$stmt->bind_param('i', $reservation_id);
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    echo json_encode(['payment_status' => $row['payment_status']]);
} else {
    echo json_encode(['error' => 'not found']);
}
$stmt->close();

?>
