<?php
session_start();

if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'customer') {
    header('Location: login.php');
    exit;
}

require_once __DIR__ . '/../backend/config.php';

$package_id = isset($_GET['package']) ? intval($_GET['package']) : 0;
$caterer_id = isset($_GET['caterer']) ? intval($_GET['caterer']) : 0;

if ($package_id <= 0 || $caterer_id <= 0) {
    header('Location: browse_packages.php');
    exit;
}

$query = $conn->prepare("SELECT p.id, p.package_name, p.event_type, p.price, p.guest_count_min, p.guest_count_max, p.description, p.includes, c.id as caterer_id, c.business_name, c.phone, c.city, c.address as caterer_address FROM packages p JOIN caterers c ON p.caterer_id = c.id WHERE p.id = ? AND c.id = ? AND c.is_verified = 1");
$query->bind_param('ii', $package_id, $caterer_id);
$query->execute();
$result = $query->get_result();
$package = $result->fetch_assoc();

if (!$package) {
    header('Location: browse_packages.php');
    exit;
}

$errors = [];
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $event_date = trim($_POST['event_date'] ?? '');
    $event_time = trim($_POST['event_time'] ?? '');
    $guest_count = intval($_POST['guest_count'] ?? 0);
    $venue_name = trim($_POST['venue_name'] ?? '');
    $venue_address = trim($_POST['venue_address'] ?? '');
    $agree_terms = isset($_POST['agree_terms']) && $_POST['agree_terms'] === 'on';

    if (empty($event_date)) {
        $errors[] = 'Please select an event date.';
    }
    if (empty($event_time)) {
        $errors[] = 'Please select an event start time.';
    }
    if ($guest_count <= 0) {
        $errors[] = 'Please enter the number of guests.';
    }
    if (empty($venue_name)) {
        $errors[] = 'Please enter the venue name.';
    }
    if (empty($venue_address)) {
        $errors[] = 'Please enter the venue address.';
    }
    if (!$agree_terms) {
        $errors[] = 'You must agree to the terms and conditions to proceed.';
    }

    if (empty($errors)) {
        $customer_id = $_SESSION['customer_id'];
        $total_amount = (float) $package['price'];
        $advance_payment = round($total_amount * 0.30, 2);
        $balance_amount = round($total_amount - $advance_payment, 2);

        $insert = $conn->prepare("INSERT INTO reservations (customer_id, caterer_id, package_id, event_date, event_time, event_type, location, guest_count, total_amount, advance_payment, balance_amount, payment_status, reservation_status, special_requests) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', '')");
        $location = $venue_name . ' - ' . $venue_address;
        $insert->bind_param('iiissssiddd', $customer_id, $caterer_id, $package_id, $event_date, $event_time, $package['event_type'], $location, $guest_count, $total_amount, $advance_payment, $balance_amount);

        if ($insert->execute()) {
            $reservation_id = $conn->insert_id;
            require_once __DIR__ . '/../backend/paypal_handler.php';
            $paypal_order = create_paypal_order(
                $reservation_id,
                $advance_payment,
                'CaterAI booking for ' . $package['business_name'] . ' - 30% down payment for ' . $package['package_name']
            );

            if ($paypal_order['ok']) {
                header('Location: ' . $paypal_order['approval_url']);
                exit;
            }

            $conn->query('DELETE FROM reservations WHERE id = ' . intval($reservation_id));
            $errors[] = 'Unable to start PayPal payment. Please try again later.';
        } else {
            $errors[] = 'Failed to create booking request. Please try again.';
        }
    }
}

$downpayment = round($package['price'] * 0.30, 2);
$balance = round($package['price'] - $downpayment, 2);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Request Your Booking - CaterAI</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#f8fafc; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#111827; }
        .page { max-width: 1100px; margin: 0 auto; padding: 32px 20px; }
        .back { display:inline-flex; align-items:center; gap:8px; color:#0f172a; text-decoration:none; margin-bottom:24px; font-weight:700; }
        .grid { display:grid; grid-template-columns: 1.7fr 1fr; gap:24px; }
        .card { background:#ffffff; border-radius:24px; padding:28px; box-shadow:0 20px 50px rgba(15,23,42,0.08); }
        .card h1, .card h2, .card h3 { margin-bottom:16px; }
        .notice { border:1px solid #bfdbfe; background:#eff6ff; color:#1d4ed8; padding:18px 22px; border-radius:16px; margin-bottom:24px; }
        .field { margin-bottom:18px; }
        .field label { display:block; font-weight:700; margin-bottom:8px; color:#0f172a; }
        .field input[type=text], .field input[type=date], .field input[type=time], .field input[type=number], .field textarea { width:100%; border:1px solid #e2e8f0; border-radius:14px; padding:14px 16px; font-size:15px; background:#f8fafc; color:#0f172a; }
        .field input[type=number]::-webkit-outer-spin-button, .field input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .field textarea { resize:vertical; min-height:110px; }
        .checkbox-field { display:flex; align-items:flex-start; gap:12px; }
        .checkbox-field input { margin-top:4px; }
        .submit-row { margin-top:16px; }
        .btn { display:inline-flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:16px 18px; border:none; border-radius:14px; background:#1d4ed8; color:white; font-size:16px; font-weight:700; cursor:pointer; transition:transform 0.2s ease, background 0.2s ease; }
        .btn:hover { background:#2563eb; transform:translateY(-1px); }
        .summary { display:grid; gap:18px; }
        .summary-card { background:#f8fafc; border-radius:18px; padding:22px; }
        .summary-card strong { display:block; margin-top:10px; font-size:18px; }
        .summary-row { display:flex; justify-content:space-between; gap:12px; margin-bottom:12px; color:#475569; }
        .summary-row.total { font-size:18px; font-weight:700; color:#0f172a; }
        .highlight { color:#1d4ed8; }
        .error { background:#fee2e2; color:#991b1b; padding:14px 16px; border-radius:14px; margin-bottom:20px; }
        .success { background:#dcfce7; color:#166534; padding:14px 16px; border-radius:14px; margin-bottom:20px; }
        @media (max-width: 980px) { .grid { grid-template-columns:1fr; } }
    </style>
</head>
<body>
    <div class="page">
        <a href="package_details.php?id=<?php echo $package['id']; ?>&caterer=<?php echo $package['caterer_id']; ?>" class="back">← Back to Caterer Profile</a>

        <div class="notice">
            <strong>You're initiating a booking request.</strong>
            <p>Fill in your event details below. After submitting, you will be redirected to PayPal to pay the 30% down payment. The payment first goes to CaterAI's PayPal merchant account and is then settled with the caterer.</p>
        </div>

        <?php if (!empty($errors)): ?>
            <div class="error">
                <ul style="margin-left:18px; list-style:disc;">
                    <?php foreach ($errors as $error): ?>
                        <li><?php echo htmlspecialchars($error); ?></li>
                    <?php endforeach; ?>
                </ul>
            </div>
        <?php endif; ?>

        <?php if ($success): ?>
            <div class="success"><?php echo htmlspecialchars($success); ?></div>
        <?php endif; ?>

        <div class="grid">
            <div class="card">
                <h2>Event Details</h2>
                <p style="color:#64748b; margin-bottom:24px;">Fill in the information about your event.</p>
                <form method="POST" action="">
                    <div class="field">
                        <label for="event_date">Event Date</label>
                        <input type="date" id="event_date" name="event_date" value="<?php echo htmlspecialchars($_POST['event_date'] ?? ''); ?>" required>
                    </div>
                    <div class="field">
                        <label for="event_time">Event Start Time</label>
                        <input type="time" id="event_time" name="event_time" value="<?php echo htmlspecialchars($_POST['event_time'] ?? ''); ?>" required>
                    </div>
                    <div class="field">
                        <label for="guest_count">Number of Guests</label>
                        <input type="number" id="guest_count" name="guest_count" min="1" placeholder="e.g. 120" value="<?php echo htmlspecialchars($_POST['guest_count'] ?? ''); ?>" required>
                    </div>
                    <div class="field">
                        <label for="venue_name">Venue Name</label>
                        <input type="text" id="venue_name" name="venue_name" placeholder="e.g. Grand Hotel Ballroom" value="<?php echo htmlspecialchars($_POST['venue_name'] ?? ''); ?>" required>
                    </div>
                    <div class="field">
                        <label for="venue_address">Venue Address</label>
                        <textarea id="venue_address" name="venue_address" placeholder="Full address including city and postal code" required><?php echo htmlspecialchars($_POST['venue_address'] ?? ''); ?></textarea>
                    </div>
                    <div class="field checkbox-field">
                        <input type="checkbox" id="agree_terms" name="agree_terms" <?php echo isset($_POST['agree_terms']) ? 'checked' : ''; ?>>
                        <label for="agree_terms" style="font-weight:400; color:#475569;">I agree to the terms and conditions, cancellation policy, and understand that a 30% down payment is required to confirm this booking.</label>
                    </div>

                    <div class="submit-row">
                        <button type="submit" class="btn">Proceed to PayPal</button>
                    </div>
                </form>
            </div>

            <aside class="summary">
                <div class="summary-card">
                    <h3>Booking Summary</h3>
                    <div class="summary-row"><span>Package</span><strong><?php echo htmlspecialchars($package['package_name']); ?></strong></div>
                    <div class="summary-row"><span>Package Price</span><strong>₱<?php echo number_format($package['price'], 0); ?></strong></div>
                    <div class="summary-row"><span>Down Payment (30%)</span><strong class="highlight">₱<?php echo number_format($downpayment, 0); ?></strong></div>
                    <div class="summary-row"><span>Balance Due</span><strong>₱<?php echo number_format($balance, 0); ?></strong></div>
                </div>
                <div class="summary-card">
                    <h3>Payment Details</h3>
                    <p style="color:#475569;">PayPal will show CaterAI's merchant name as the payment recipient. Your payment is for <strong><?php echo htmlspecialchars($package['business_name']); ?></strong>, and the caterer will receive the corresponding payout from the platform.</p>
                </div>
            </aside>
        </div>
    </div>
</body>
</html>
