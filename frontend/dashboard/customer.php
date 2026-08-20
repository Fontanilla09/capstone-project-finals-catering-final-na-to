<?php
session_start();

// Check if customer is logged in
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'customer') {
    header('Location: ../login.php');
    exit;
}

require_once __DIR__ . '/../../backend/config.php';

// Get customer information from database
$customer_id = $_SESSION['customer_id'];
$query = $conn->prepare("SELECT c.id, c.full_name, u.email
    FROM customers c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?");
$query->bind_param("i", $customer_id);
$query->execute();
$result = $query->get_result();
$customer = $result->fetch_assoc();

// Get customer reservations
$reservations_stmt = $conn->prepare("SELECT r.id, p.package_name, c.business_name, r.event_date, r.guest_count, r.reservation_status
    FROM reservations r
    JOIN packages p ON r.package_id = p.id
    JOIN caterers c ON r.caterer_id = c.id
    WHERE r.customer_id = ?
    ORDER BY r.event_date DESC");
$reservations_stmt->bind_param("i", $customer_id);
$reservations_stmt->execute();
$reservations_result = $reservations_stmt->get_result();
$reservations = $reservations_result->fetch_all(MYSQLI_ASSOC);

$payment_status = isset($_GET['payment']) ? $_GET['payment'] : '';
$payment_message = '';
$payment_class = '';
if ($payment_status === 'success') {
    $payment_message = 'Your payment was successful. Your booking is now pending confirmation from the caterer.';
    $payment_class = 'success';
} elseif ($payment_status === 'failed') {
    $payment_message = 'Your payment did not complete. Please try again or contact support.';
    $payment_class = 'error';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Customer Dashboard - CaterAI</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f7ff;
            color: #1f2937;
        }

        .header {
            background: white;
            padding: 20px 30px;
            box-shadow: 0 10px 40px rgba(15, 23, 42, 0.08);
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .brand h1 {
            color: #2563eb;
            font-size: 28px;
            font-weight: 700;
        }

        .account {
            display: flex;
            align-items: center;
            gap: 18px;
        }

        .account div {
            text-align: right;
        }

        .account strong {
            display: block;
            font-size: 15px;
        }

        .account small {
            display: block;
            color: #64748b;
            font-size: 13px;
        }

        .logout-btn {
            border: 1px solid #e2e8f0;
            background: #ffffff;
            color: #1f2937;
            padding: 10px 18px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.25s ease;
        }

        .logout-btn:hover {
            background: #eef2ff;
            border-color: #bfdbfe;
        }

        .layout {
            display: grid;
            grid-template-columns: 280px 1fr;
            gap: 30px;
            max-width: 1400px;
            margin: 30px auto;
            padding: 0 24px 40px;
        }

        .sidebar {
            background: white;
            border-radius: 24px;
            padding: 28px 22px;
            box-shadow: 0 28px 60px rgba(100, 116, 139, 0.08);
            min-height: calc(100vh - 120px);
        }

        .sidebar h2 {
            font-size: 22px;
            color: #1d4ed8;
            margin-bottom: 22px;
        }

        .nav-list {
            list-style: none;
            display: grid;
            gap: 10px;
        }

        .nav-list a {
            display: flex;
            align-items: center;
            gap: 12px;
            text-decoration: none;
            padding: 14px 16px;
            border-radius: 18px;
            color: #334155;
            font-weight: 600;
            transition: all 0.25s ease;
        }

        .nav-list a.active,
        .nav-list a:hover {
            background: #eff6ff;
            color: #1d4ed8;
        }

        .nav-list a .icon {
            width: 34px;
            height: 34px;
            display: inline-grid;
            place-items: center;
            border-radius: 14px;
            background: #e0e7ff;
            font-size: 18px;
        }

        .main {
            display: grid;
            gap: 28px;
        }

        .page-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 18px;
        }

        .page-top h2 {
            font-size: 32px;
        }

        .page-top p {
            color: #64748b;
            font-size: 15px;
        }

        .card {
            background: white;
            border-radius: 28px;
            padding: 28px;
            box-shadow: 0 28px 60px rgba(100, 116, 139, 0.08);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            flex-wrap: wrap;
            margin-bottom: 22px;
        }

        .card-header h3 {
            font-size: 21px;
        }

        .card-header span {
            color: #64748b;
            font-size: 14px;
        }

        .booking-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }

        .booking-table th,
        .booking-table td {
            padding: 18px 16px;
            border-bottom: 1px solid #eef2ff;
            text-align: left;
        }

        .booking-table th {
            background: #f8fbff;
            color: #475569;
            font-weight: 700;
        }

        .status-pill {
            border-radius: 999px;
            padding: 10px 14px;
            font-weight: 700;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
        }

        .status-confirmed {
            background: #dcfce7;
            color: #166534;
        }

        .status-pending {
            background: #fef9c3;
            color: #92400e;
        }

        .status-cancelled {
            background: #fee2e2;
            color: #991b1b;
        }

        .grid-two {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 28px;
        }

        .calendar-grid {
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 10px;
        }

        .day-name,
        .calendar-cell {
            text-align: center;
            font-size: 13px;
            color: #475569;
        }

        .day-name {
            font-weight: 700;
        }

        .calendar-cell {
            min-height: 82px;
            padding: 14px 10px;
            border-radius: 20px;
            background: #f8fbff;
            display: grid;
            place-items: center;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .calendar-cell:hover {
            transform: translateY(-2px);
            box-shadow: 0 18px 35px rgba(59, 130, 246, 0.12);
        }

        .calendar-cell.active {
            background: #eef2ff;
            color: #1d4ed8;
            box-shadow: 0 18px 35px rgba(59, 130, 246, 0.18);
        }

        .event-list {
            margin-top: 24px;
            min-height: 176px;
        }

        .event-item {
            background: #f8fafc;
            border-radius: 18px;
            padding: 18px 20px;
            margin-bottom: 16px;
            border: 1px solid #e2e8f0;
        }

        .event-item:last-child {
            margin-bottom: 0;
        }

        .event-item h4 {
            font-size: 15px;
            margin-bottom: 8px;
        }

        .event-item p {
            font-size: 14px;
            color: #475569;
            margin: 0;
        }

        .history-list {
            display: grid;
            gap: 16px;
        }

        .history-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 20px;
            padding: 20px;
        }

        .history-card h4 {
            margin-bottom: 10px;
            font-size: 16px;
        }

        .history-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 14px;
            color: #64748b;
            font-size: 14px;
        }

        .note {
            color: #64748b;
            font-size: 14px;
            margin-top: 4px;
        }

        @media (max-width: 1080px) {
            .layout {
                grid-template-columns: 1fr;
            }

            .grid-two {
                grid-template-columns: 1fr;
            }

            .sidebar {
                min-height: auto;
            }
        }

        @media (max-width: 720px) {
            .header {
                flex-direction: column;
                gap: 16px;
                align-items: flex-start;
            }

            .layout {
                padding: 0 16px 30px;
            }

            .sidebar {
                padding: 22px 18px;
            }

            .nav-list a {
                font-size: 14px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="brand">
            <h1>Customer</h1>
        </div>
        <div class="account">
            <div>
                <strong><?php echo htmlspecialchars($customer['full_name']); ?></strong>
                <small><?php echo htmlspecialchars($customer['email']); ?></small>
            </div>
            <form method="POST" action="../logout.php" style="margin: 0;">
                <button type="submit" class="logout-btn">Logout</button>
            </form>
        </div>
    </div>

    <div class="layout">
        <aside class="sidebar">
            <h2>Navigation</h2>
            <nav>
                <ul class="nav-list">
                    <li><a class="active" href="customer.php"><span class="icon">🏠</span>Dashboard</a></li>
                    <li><a href="#"><span class="icon">💬</span>Messages</a></li>
                    <li><a href="../browse_packages.php"><span class="icon">👁️</span>Browse Package</a></li>
                    <li><a href="venue_visualizer.php"><span class="icon">🎯</span>Venue Visualizer</a></li>
                    <li><a href="#"><span class="icon">⚙️</span>Settings</a></li>
                    <li><a href="../logout.php"><span class="icon">↩️</span>Log Out</a></li>
                </ul>
            </nav>
        </aside>

        <main class="main">
            <div class="page-top">
                <div>
                    <h2>Dashboard</h2>
                    <p>Here are your booking requests:</p>
                </div>
            </div>

            <?php if (!empty($payment_message)): ?>
                <section class="card" style="border-left: 4px solid <?php echo $payment_class === 'success' ? '#16a34a' : '#dc2626'; ?>;">
                    <div style="padding: 16px 20px;">
                        <p style="margin: 0; color: <?php echo $payment_class === 'success' ? '#165f31' : '#7f1d1d'; ?>; font-weight: 700;">
                            <?php echo htmlspecialchars($payment_message); ?>
                        </p>
                    </div>
                </section>
            <?php endif; ?>

            <section class="card">
                <div class="card-header">
                    <h3>Booking Requests</h3>
                    <span><?php echo date('F j, Y'); ?></span>
                </div>
                <table class="booking-table">
                    <thead>
                        <tr>
                            <th>Package</th>
                            <th>Caterer</th>
                            <th>Date</th>
                            <th>Guests</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (!empty($reservations)): ?>
                            <?php foreach ($reservations as $reservation): ?>
                                <?php
                                    $statusClass = 'status-pending';
                                    if ($reservation['reservation_status'] === 'confirmed') {
                                        $statusClass = 'status-confirmed';
                                    } elseif ($reservation['reservation_status'] === 'cancelled') {
                                        $statusClass = 'status-cancelled';
                                    }
                                ?>
                                <tr>
                                    <td><?php echo htmlspecialchars($reservation['package_name']); ?></td>
                                    <td><?php echo htmlspecialchars($reservation['business_name']); ?></td>
                                    <td><?php echo htmlspecialchars($reservation['event_date']); ?></td>
                                    <td><?php echo htmlspecialchars($reservation['guest_count']); ?></td>
                                    <td><span class="status-pill <?php echo $statusClass; ?>"><?php echo ucfirst(htmlspecialchars($reservation['reservation_status'])); ?></span></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <tr>
                                <td colspan="5" style="text-align:center; padding: 30px 0; color: #64748b;">No booking requests found.</td>
                            </tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </section>

            <div class="grid-two">
                <section class="card">
                    <div class="card-header">
                        <h3>Reservation Calendar</h3>
                        <span>Events on selected date</span>
                    </div>
                    <div class="calendar-grid" id="calendar-grid"></div>
                    <div class="event-list" id="event-list"></div>
                </section>

                <section class="card">
                    <div class="card-header">
                        <h3>Booking History</h3>
                        <span>Your recent reservations</span>
                    </div>
                    <div class="history-list">
                        <?php if (!empty($reservations)): ?>
                            <?php foreach ($reservations as $reservation): ?>
                                <div class="history-card">
                                    <h4><?php echo htmlspecialchars($reservation['package_name']); ?> • <?php echo ucfirst(htmlspecialchars($reservation['reservation_status'])); ?></h4>
                                    <div class="history-meta">
                                        <span><?php echo htmlspecialchars($reservation['event_date']); ?></span>
                                        <span><?php echo htmlspecialchars($reservation['business_name']); ?></span>
                                        <span><?php echo htmlspecialchars($reservation['guest_count']); ?> guests</span>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <div class="history-card">
                                <h4>No past bookings yet.</h4>
                                <p class="note">Once you book a catering package, your reservation history will appear here.</p>
                            </div>
                        <?php endif; ?>
                    </div>
                </section>
            </div>
        </main>
    </div>

    <script>
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const calendarGrid = document.getElementById('calendar-grid');
        const eventList = document.getElementById('event-list');

        const eventsByDate = {};
        const reservations = <?php echo json_encode($reservations); ?>;
        reservations.forEach(reservation => {
            if (!eventsByDate[reservation.event_date]) {
                eventsByDate[reservation.event_date] = [];
            }
            eventsByDate[reservation.event_date].push(reservation);
        });

        const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        dayNames.forEach(day => {
            const heading = document.createElement('div');
            heading.className = 'day-name';
            heading.textContent = day;
            calendarGrid.appendChild(heading);
        });

        const firstDay = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-cell';
            empty.style.visibility = 'hidden';
            calendarGrid.appendChild(empty);
        }

        for (let day = 1; day <= totalDays; day++) {
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const cell = document.createElement('div');
            cell.className = 'calendar-cell';
            cell.textContent = day;
            cell.dataset.date = dateString;

            if (dateString === today.toISOString().slice(0, 10)) {
                cell.classList.add('active');
            }

            if (eventsByDate[dateString]) {
                const badge = document.createElement('div');
                badge.textContent = eventsByDate[dateString].length;
                badge.style.marginTop = '8px';
                badge.style.fontSize = '12px';
                badge.style.color = '#1d4ed8';
                cell.appendChild(badge);
            }

            cell.addEventListener('click', () => {
                document.querySelectorAll('.calendar-cell').forEach(el => el.classList.remove('active'));
                cell.classList.add('active');
                renderEvents(dateString);
            });

            calendarGrid.appendChild(cell);
        }

        function renderEvents(dateString) {
            eventList.innerHTML = '';
            const events = eventsByDate[dateString] || [];
            if (events.length === 0) {
                const emptyCard = document.createElement('div');
                emptyCard.className = 'event-item';
                emptyCard.innerHTML = '<h4>No events for this date.</h4><p>Select a date to view your reservations.</p>';
                eventList.appendChild(emptyCard);
                return;
            }

            events.forEach(event => {
                const item = document.createElement('div');
                item.className = 'event-item';
                item.innerHTML = `
                    <h4>${event.package_name}</h4>
                    <p>${event.business_name} • ${event.guest_count} guests</p>
                    <p>Status: ${event.reservation_status}</p>
                `;
                eventList.appendChild(item);
            });
        }

        renderEvents(today.toISOString().slice(0, 10));
    </script>
</body>
</html>
