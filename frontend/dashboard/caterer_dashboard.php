<?php
session_start();

// Check if caterer is logged in
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'caterer') {
    header('Location: ../login.php');
    exit;
}

require_once __DIR__ . '/../../backend/config.php';

$caterer_id = $_SESSION['caterer_id'];
$query = $conn->prepare("SELECT c.id, c.business_name, c.is_verified, u.email
    FROM caterers c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?");
$query->bind_param("i", $caterer_id);
$query->execute();
$result = $query->get_result();
$caterer = $result->fetch_assoc();

if (!$caterer || !$caterer['is_verified']) {
    header('Location: caterer.php');
    exit;
}

// Stats
$total_packages = $conn->prepare("SELECT COUNT(*) as count FROM packages WHERE caterer_id = ?");
$total_packages->bind_param("i", $caterer_id);
$total_packages->execute();
$total_packages_count = $total_packages->get_result()->fetch_assoc()['count'];

$active_reservations = $conn->prepare("SELECT COUNT(*) as count FROM reservations WHERE caterer_id = ? AND reservation_status IN ('pending', 'confirmed')");
$active_reservations->bind_param("i", $caterer_id);
$active_reservations->execute();
$active_reservations_count = $active_reservations->get_result()->fetch_assoc()['count'];

$average_rating = $conn->prepare("SELECT IFNULL(ROUND(AVG(rating), 1), 0) as avg_rating FROM reviews WHERE caterer_id = ?");
$average_rating->bind_param("i", $caterer_id);
$average_rating->execute();
$avg_rating_value = $average_rating->get_result()->fetch_assoc()['avg_rating'];

$upcoming_events = $conn->prepare("SELECT COUNT(*) as count FROM reservations WHERE caterer_id = ? AND event_date >= CURDATE() AND reservation_status = 'confirmed'");
$upcoming_events->bind_param("i", $caterer_id);
$upcoming_events->execute();
$upcoming_events_count = $upcoming_events->get_result()->fetch_assoc()['count'];

$recent_reservations_stmt = $conn->prepare("SELECT r.event_date, p.package_name, cu.full_name as customer_name, r.guest_count, r.reservation_status
    FROM reservations r
    JOIN packages p ON r.package_id = p.id
    JOIN customers cu ON r.customer_id = cu.id
    WHERE r.caterer_id = ?
    ORDER BY r.event_date DESC
    LIMIT 5");
$recent_reservations_stmt->bind_param("i", $caterer_id);
$recent_reservations_stmt->execute();
$recent_reservations = $recent_reservations_stmt->get_result()->fetch_all(MYSQLI_ASSOC);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Caterer Dashboard - CaterAI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fb; color: #1f2937; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 28px; }
        .header strong { display: block; font-size: 14px; color: rgba(255,255,255,0.85); }
        .logout-btn { background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 10px 16px; border-radius: 8px; cursor: pointer; }
        .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
        .page-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; }
        .page-header h1 { font-size: 36px; margin-bottom: 8px; }
        .page-header p { color: #64748b; font-size: 16px; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; border-radius: 24px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08); padding: 28px; }
        .stat-card h3 { font-size: 14px; color: #64748b; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.09em; }
        .stat-card .value { font-size: 36px; font-weight: 700; color: #111827; }
        .stat-card .meta { margin-top: 12px; color: #10b981; font-size: 13px; display: flex; align-items: center; gap: 6px; }
        .action-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; margin-bottom: 30px; }
        .action-card { background: white; border-radius: 22px; padding: 28px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08); border: 1px solid #e5e7eb; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease; text-align: center; }
        .action-card:hover { transform: translateY(-4px); box-shadow: 0 22px 50px rgba(15, 23, 42, 0.12); }
        .action-card .icon { width: 52px; height: 52px; border-radius: 18px; display: grid; place-items: center; margin: 0 auto 18px; background: #eef2ff; color: #4338ca; font-size: 24px; }
        .action-card h3 { font-size: 16px; margin-bottom: 8px; }
        .action-card p { color: #64748b; font-size: 13px; line-height: 1.6; }
        .dashboard-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; }
        .calendar-card, .history-card { background: white; border-radius: 24px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08); padding: 28px; }
        .calendar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; text-align: center; }
        .calendar-day { font-size: 12px; color: #64748b; }
        .calendar-date { padding: 14px 0; border-radius: 12px; background: #f8fafc; color: #334155; }
        .calendar-date.today { background: #4f46e5; color: white; }
        .booking-table { width: 100%; border-collapse: collapse; }
        .booking-table th, .booking-table td { padding: 16px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        .booking-table th { color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
        .booking-table td { color: #111827; font-size: 14px; }
        .status-dot { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px; font-size: 12px; background: #eef2ff; color: #1d4ed8; }
        .status-dot.completed { background: #dcfce7; color: #15803d; }
        .status-dot.pending { background: #fff7ed; color: #b45309; }
        .status-dot.confirmed { background: #dbeafe; color: #1d4ed8; }
        @media (max-width: 1100px) { .stats-grid, .action-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dashboard-grid { grid-template-columns: 1fr; } }
        @media (max-width: 640px) { .header { flex-direction: column; align-items: flex-start; gap: 16px; } .stats-grid, .action-grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>Caterer Dashboard</h1>
            <strong>Welcome back, <?php echo htmlspecialchars($caterer['business_name']); ?></strong>
        </div>
        <form method="POST" action="../logout.php">
            <button type="submit" class="logout-btn">Logout</button>
        </form>
    </div>

    <div class="container">
        <div class="page-header">
            <div>
                <h1>Dashboard</h1>
                <p>Welcome back, <?php echo htmlspecialchars($caterer['business_name']); ?></p>
            </div>
            <div class="header-actions">
                <form method="POST" action="../logout.php" style="margin:0;">
                    <button type="submit" class="logout-btn">Logout</button>
                </form>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total Bookings</h3>
                <div class="value"><?php echo $total_packages_count; ?></div>
                <div class="meta">+12% from last month</div>
            </div>
            <div class="stat-card">
                <h3>Active Bookings</h3>
                <div class="value"><?php echo $active_reservations_count; ?></div>
                <div class="meta"><?php echo $upcoming_events_count; ?> upcoming events</div>
            </div>
            <div class="stat-card">
                <h3>Average Rating</h3>
                <div class="value"><?php echo $avg_rating_value; ?></div>
                <div class="meta">★★★★★</div>
            </div>
            <div class="stat-card">
                <h3>Profile Status</h3>
                <div class="value"><?php echo $caterer['is_verified'] ? 'Verified' : 'Pending'; ?></div>
                <div class="meta"><?php echo $caterer['is_verified'] ? 'Live on platform' : 'Awaiting approval'; ?></div>
            </div>
        </div>

        <div class="action-grid">
            <div class="action-card" onclick="location.href='manage_services.php'">
                <div class="icon">📦</div>
                <h3>Manage Services</h3>
                <p>Update your packages, pricing, and available offerings for customers.</p>
            </div>
            <div class="action-card" onclick="location.href='view_reservations.php'">
                <div class="icon">📅</div>
                <h3>View Reservations</h3>
                <p>Check upcoming events, reservation status, and booking details.</p>
            </div>

            <script>
                document.querySelectorAll('.action-card')[1].addEventListener('click', function() {
                    window.location.href = 'view_reservations.php';
                });
            </script>
            <div class="action-card" onclick="location.href='messages.php'">
                <div class="icon">💬</div>
                <h3>Messages</h3>
                <p>Respond to new inquiries and chat with customers in real time.</p>
            </div>
            <div class="action-card" onclick="location.href='caterer.php'">
                <div class="icon">👤</div>
                <h3>Profile Settings</h3>
                <p>Update your business profile and verify your permit documents.</p>
            </div>
        </div>

        <div class="dashboard-grid">
            <div class="calendar-card">
                <div class="calendar-header">
                    <div>
                        <h2>Reservation Calendar</h2>
                        <p>Events on selected dates are shown below.</p>
                    </div>
                    <div class="status-pill"><?php echo date('F Y'); ?></div>
                </div>
                <div class="calendar-grid">
                    <div class="calendar-day">Su</div>
                    <div class="calendar-day">Mo</div>
                    <div class="calendar-day">Tu</div>
                    <div class="calendar-day">We</div>
                    <div class="calendar-day">Th</div>
                    <div class="calendar-day">Fr</div>
                    <div class="calendar-day">Sa</div>
                    <?php for ($i = 1; $i <= 30; $i++): ?>
                        <div class="calendar-date<?php echo $i === (int)date('j') ? ' today' : ''; ?>"><?php echo $i; ?></div>
                    <?php endfor; ?>
                </div>
                <div style="margin-top:24px; color:#475569; font-size:14px;">
                    <strong>Events on (select a date)</strong>
                    <p style="margin-top:10px; color:#64748b;">No events for this date.</p>
                </div>
            </div>
            <div class="history-card">
                <div class="calendar-header">
                    <div>
                        <h2>Booking History</h2>
                        <p>Recent reservation activity from customers.</p>
                    </div>
                    <div class="status-pill">Latest</div>
                </div>
                <?php if (empty($recent_reservations)): ?>
                    <p>No reservations yet.</p>
                <?php else: ?>
                    <table class="booking-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Package</th>
                                <th>Date</th>
                                <th>Guests</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($recent_reservations as $reservation): ?>
                                <tr>
                                    <td><?php echo htmlspecialchars($reservation['customer_name']); ?></td>
                                    <td><?php echo htmlspecialchars($reservation['package_name']); ?></td>
                                    <td><?php echo htmlspecialchars($reservation['event_date']); ?></td>
                                    <td><?php echo htmlspecialchars($reservation['guest_count']); ?></td>
                                    <td>
                                        <span class="status-dot <?php echo htmlspecialchars($reservation['reservation_status']); ?>">
                                            <?php echo htmlspecialchars(ucfirst($reservation['reservation_status'])); ?>
                                        </span>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>
            </div>
        </div>
    </div>
</body>
</html>
