<?php
session_start();

if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'caterer') {
    header('Location: ../login.php');
    exit;
}

require_once __DIR__ . '/../../backend/config.php';

$caterer_id = $_SESSION['caterer_id'];
$message = '';
$message_type = 'success';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'], $_POST['reservation_id'])) {
    $reservation_id = intval($_POST['reservation_id']);
    if ($_POST['action'] === 'accept') {
        $stmt = $conn->prepare("UPDATE reservations SET reservation_status = 'confirmed' WHERE id = ? AND caterer_id = ? AND payment_status = 'completed'");
        $stmt->bind_param('ii', $reservation_id, $caterer_id);
        if ($stmt->execute() && $stmt->affected_rows === 1) {
            $message = 'Reservation accepted successfully.';
        } else {
            $message = 'Unable to accept reservation. Please try again.';
            $message_type = 'error';
        }
        $stmt->close();
    }
}

$reservations_stmt = $conn->prepare(
    "SELECT r.id, cu.full_name AS customer_name, p.package_name, r.event_date, r.event_time, r.guest_count, r.location, r.advance_payment, r.balance_amount, r.payment_status, r.reservation_status
     FROM reservations r
     JOIN customers cu ON r.customer_id = cu.id
     JOIN packages p ON r.package_id = p.id
    WHERE r.caterer_id = ? AND r.payment_status = 'completed'
     ORDER BY r.event_date DESC"
);
$reservations_stmt->bind_param('i', $caterer_id);
$reservations_stmt->execute();
$reservations = $reservations_stmt->get_result()->fetch_all(MYSQLI_ASSOC);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>View Reservations - CaterAI</title>
    <style>
        body { margin:0; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background:#f5f7ff; color:#111827; }
        .page { max-width: 1200px; margin: 0 auto; padding: 24px; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
        .header a { color:#2563eb; text-decoration:none; font-weight:700; }
        .message { margin-bottom:20px; padding:16px; border-radius:14px; }
        .message.success { background:#dcfce7; color:#166534; }
        .message.error { background:#fee2e2; color:#991b1b; }
        table { width:100%; border-collapse:collapse; background:white; border-radius:20px; overflow:hidden; box-shadow:0 20px 50px rgba(15,23,42,0.08); }
        th, td { padding:16px 18px; text-align:left; border-bottom:1px solid #e5e7eb; }
        th { background:#f8fafc; color:#475569; text-transform:uppercase; font-size:12px; letter-spacing:0.08em; }
        td { color:#0f172a; font-size:14px; }
        .status { display:inline-flex; align-items:center; padding:8px 12px; border-radius:999px; font-size:12px; font-weight:700; }
        .status.pending { background:#fef3c7; color:#b45309; }
        .status.confirmed { background:#dbeafe; color:#1d4ed8; }
        .status.completed { background:#dcfce7; color:#166534; }
        .status.cancelled { background:#fee2e2; color:#991b1b; }
        .btn { border:none; border-radius:12px; padding:10px 14px; color:white; background:#2563eb; cursor:pointer; font-weight:700; }
        .btn.disabled { background:#94a3b8; cursor:not-allowed; }
    </style>
</head>
<body>
    <div class="page">
        <div class="header">
            <div>
                <h1>View Reservations</h1>
                <p>Accept completed-payments from customers and confirm the booking.</p>
            </div>
            <a href="caterer_dashboard.php">Back to Dashboard</a>
        </div>

        <?php if ($message): ?>
            <div class="message <?php echo htmlspecialchars($message_type); ?>"><?php echo htmlspecialchars($message); ?></div>
        <?php endif; ?>

        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Package</th>
                    <th>Date</th>
                    <th>Guests</th>
                    <th>Payment</th>
                    <th>Payment Status</th>
                    <th>Status</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($reservations)): ?>
                    <tr><td colspan="7" style="text-align:center; color:#64748b; padding:30px;">No reservations found.</td></tr>
                <?php else: ?>
                    <?php foreach ($reservations as $reservation): ?>
                        <?php $canAccept = $reservation['payment_status'] === 'completed' && $reservation['reservation_status'] === 'pending'; ?>
                        <tr>
                            <td><?php echo htmlspecialchars($reservation['customer_name']); ?></td>
                            <td><?php echo htmlspecialchars($reservation['package_name']); ?></td>
                            <td><?php echo htmlspecialchars($reservation['event_date']); ?> <?php echo htmlspecialchars($reservation['event_time']); ?></td>
                            <td><?php echo htmlspecialchars($reservation['guest_count']); ?></td>
                            <td>₱<?php echo number_format($reservation['advance_payment'], 2); ?></td>
                            <td><span class="status <?php echo htmlspecialchars($reservation['payment_status']); ?>" id="payment-status-<?php echo intval($reservation['id']); ?>"><?php echo htmlspecialchars(ucfirst($reservation['payment_status'])); ?></span></td>
                            <td><span class="status <?php echo htmlspecialchars($reservation['reservation_status']); ?>"><?php echo htmlspecialchars(ucfirst($reservation['reservation_status'])); ?></span></td>
                            <td>
                                <form method="POST" style="margin:0; display:inline-block;" id="accept-form-<?php echo intval($reservation['id']); ?>">
                                    <input type="hidden" name="reservation_id" value="<?php echo intval($reservation['id']); ?>">
                                    <button type="submit" name="action" value="accept" class="btn<?php echo $canAccept ? '' : ' disabled'; ?>"<?php echo $canAccept ? '' : ' disabled'; ?> id="accept-btn-<?php echo intval($reservation['id']); ?>">Accept</button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
    <script>
    </script>
</body>
</html>