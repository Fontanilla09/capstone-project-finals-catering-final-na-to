<?php
session_start();

require_once __DIR__ . '/../backend/config.php';

// Get package ID and caterer ID from URL
$package_id = isset($_GET['id']) ? intval($_GET['id']) : 0;
$caterer_id = isset($_GET['caterer']) ? intval($_GET['caterer']) : 0;

if ($package_id <= 0 || $caterer_id <= 0) {
    header('Location: browse_packages.php');
    exit;
}

// Get package details with caterer info
$query = $conn->prepare("
    SELECT 
        p.id,
        p.package_name,
        p.event_type,
        p.price,
        p.guest_count_min,
        p.guest_count_max,
        p.description,
        p.includes,
        c.id as caterer_id,
        c.business_name,
        c.rating,
        c.phone,
        c.city,
        c.address,
        c.description as caterer_description
    FROM packages p
    JOIN caterers c ON p.caterer_id = c.id
    WHERE p.id = ? AND c.id = ? AND c.is_verified = 1
");
$query->bind_param("ii", $package_id, $caterer_id);
$query->execute();
$result = $query->get_result();
$package = $result->fetch_assoc();

if (!$package) {
    header('Location: browse_packages.php');
    exit;
}

$is_logged_in = isset($_SESSION['user_id']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($package['package_name']); ?> - CaterAI</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8fafc;
            color: #1f2937;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 24px 32px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h1 {
            font-size: 24px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
        }

        .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #667eea;
            text-decoration: none;
            margin-bottom: 24px;
            font-weight: 600;
            transition: color 0.2s ease;
        }

        .back-btn:hover {
            color: #764ba2;
        }

        .package-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            border-radius: 12px;
            margin-bottom: 30px;
        }

        .package-title {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 12px;
        }

        .package-meta {
            display: flex;
            gap: 20px;
            margin-bottom: 24px;
            flex-wrap: wrap;
        }

        .meta-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 16px;
        }

        .price-large {
            font-size: 36px;
            font-weight: 700;
            margin-top: 20px;
        }

        .main-content {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 30px;
        }

        .section {
            background: white;
            border-radius: 12px;
            padding: 28px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .section h2 {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 16px;
            color: #1f2937;
        }

        .section p {
            color: #6b7280;
            line-height: 1.6;
            margin-bottom: 16px;
        }

        .features-list {
            list-style: none;
            margin-bottom: 20px;
        }

        .features-list li {
            padding: 12px 0;
            border-bottom: 1px solid #e5e7eb;
            color: #475569;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .features-list li:last-child {
            border-bottom: none;
        }

        .features-list li:before {
            content: "✓";
            color: #10b981;
            font-weight: 700;
            font-size: 16px;
        }

        .caterer-card {
            background: white;
            border-radius: 12px;
            padding: 28px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }

        .caterer-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 20px;
        }

        .caterer-name {
            font-size: 20px;
            font-weight: 700;
            color: #1f2937;
        }

        .rating {
            display: flex;
            align-items: center;
            gap: 4px;
            background: #fef3c7;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            color: #b45309;
        }

        .caterer-contact {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }

        .contact-item {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 14px;
            color: #6b7280;
        }

        .guest-range {
            background: #f3f4f6;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .guest-range p {
            color: #64748b;
            font-size: 14px;
            margin: 0;
        }

        .guest-range strong {
            font-size: 18px;
            color: #1f2937;
            display: block;
            margin-top: 4px;
        }

        .action-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-top: 20px;
        }

        .btn {
            padding: 14px;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s ease;
            text-decoration: none;
            text-align: center;
        }

        .btn-primary {
            background: #667eea;
            color: white;
        }

        .btn-primary:hover {
            background: #764ba2;
            transform: translateY(-2px);
        }

        .btn-secondary {
            background: #f3f4f6;
            color: #1f2937;
            border: 1px solid #d1d5db;
        }

        .btn-secondary:hover {
            background: #e5e7eb;
        }

        @media (max-width: 768px) {
            .main-content {
                grid-template-columns: 1fr;
            }

            .package-header {
                padding: 24px;
            }

            .package-title {
                font-size: 24px;
            }

            .price-large {
                font-size: 28px;
            }

            .action-buttons {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>CaterAI</h1>
        <a href="browse_packages.php" style="color: white; text-decoration: none;">← Back to Browse</a>
    </div>

    <div class="container">
        <a href="browse_packages.php" class="back-btn">← Back to all packages</a>

        <div class="package-header">
            <div class="package-title"><?php echo htmlspecialchars($package['package_name']); ?></div>
            <div class="package-meta">
                <div class="meta-item">
                    📅 <?php echo htmlspecialchars($package['event_type']); ?>
                </div>
                <div class="meta-item">
                    👥 <?php echo $package['guest_count_min']; ?>-<?php echo $package['guest_count_max']; ?> guests
                </div>
            </div>
            <div class="price-large">₱<?php echo number_format($package['price'], 0); ?></div>
        </div>

        <div class="main-content">
            <div>
                <?php if ($package['description']): ?>
                    <div class="section">
                        <h2>About This Package</h2>
                        <p><?php echo nl2br(htmlspecialchars($package['description'])); ?></p>
                    </div>
                <?php endif; ?>

                <?php if ($package['includes']): ?>
                    <div class="section">
                        <h2>What's Included</h2>
                        <ul class="features-list">
                            <?php 
                            $features = array_filter(array_map('trim', explode("\n", $package['includes'])));
                            foreach ($features as $feature):
                                if (!empty($feature)):
                            ?>
                                <li><?php echo htmlspecialchars($feature); ?></li>
                            <?php 
                                endif;
                            endforeach; 
                            ?>
                        </ul>
                    </div>
                <?php endif; ?>
            </div>

            <div>
                <div class="caterer-card">
                    <div class="caterer-header">
                        <div>
                            <div class="caterer-name"><?php echo htmlspecialchars($package['business_name']); ?></div>
                            <?php if ($package['rating'] > 0): ?>
                                <div style="margin-top: 8px;">
                                    <div class="rating">
                                        ★ <?php echo number_format($package['rating'], 1); ?>
                                    </div>
                                </div>
                            <?php endif; ?>
                        </div>
                    </div>

                    <?php if ($package['caterer_description']): ?>
                        <p style="font-size: 14px; color: #6b7280; margin-bottom: 16px;">
                            <?php echo nl2br(htmlspecialchars(substr($package['caterer_description'], 0, 150))); ?>...
                        </p>
                    <?php endif; ?>

                    <div class="guest-range">
                        <p>Recommended Guest Count</p>
                        <strong><?php echo $package['guest_count_min']; ?> - <?php echo $package['guest_count_max']; ?> people</strong>
                    </div>

                    <div class="caterer-contact">
                        <div class="contact-item">
                            <span>📍</span>
                            <span><?php echo htmlspecialchars($package['city']); ?></span>
                        </div>
                        <?php if ($package['phone']): ?>
                            <div class="contact-item">
                                <span>📞</span>
                                <span><?php echo htmlspecialchars($package['phone']); ?></span>
                            </div>
                        <?php endif; ?>
                    </div>

                    <div class="action-buttons">
                        <?php if ($is_logged_in && $_SESSION['role'] === 'customer'): ?>
                            <button class="btn btn-primary" onclick="bookPackage()">Book Now</button>
                            <button class="btn btn-secondary" onclick="contactCaterer()">Contact</button>
                        <?php else: ?>
                            <a href="login.php" class="btn btn-primary">Login to Book</a>
                            <a href="login.php" class="btn btn-secondary">Login to Message</a>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        function bookPackage() {
            window.location.href = '/capstone-project-finals-catering/frontend/book.php?package=' + <?php echo $package_id; ?> + '&caterer=' + <?php echo $package['caterer_id']; ?>;
        }

        function contactCaterer() {
            window.location.href = '/capstone-project-finals-catering/frontend/dashboard/messages.php?caterer=' + <?php echo $package['caterer_id']; ?>;
        }
    </script>
</body>
</html>
