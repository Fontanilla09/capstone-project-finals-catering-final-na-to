<?php
session_start();

// Check if user is logged in
$is_logged_in = isset($_SESSION['user_id']);
$is_customer = $is_logged_in && $_SESSION['role'] === 'customer';

require_once __DIR__ . '/../backend/config.php';

// Get filter parameters
$search = isset($_GET['search']) ? trim($_GET['search']) : '';
$event_type = isset($_GET['event_type']) ? trim($_GET['event_type']) : '';
$sort = isset($_GET['sort']) ? trim($_GET['sort']) : 'newest';

// Build query to get all packages from verified caterers
$query = "
    SELECT 
        p.id, 
        p.package_name, 
        p.event_type, 
        p.price, 
        p.guest_count_min, 
        p.guest_count_max, 
        p.description,
        c.id as caterer_id,
        c.business_name,
        c.rating,
        c.phone,
        c.city
    FROM packages p
    JOIN caterers c ON p.caterer_id = c.id
    WHERE c.is_verified = 1
";

$params = [];
$types = '';

// Search by package name or caterer name
if (!empty($search)) {
    $query .= " AND (p.package_name LIKE ? OR c.business_name LIKE ?)";
    $search_term = '%' . $search . '%';
    $params[] = $search_term;
    $params[] = $search_term;
    $types .= 'ss';
}

// Filter by event type
if (!empty($event_type)) {
    $query .= " AND p.event_type = ?";
    $params[] = $event_type;
    $types .= 's';
}

// Sort
switch ($sort) {
    case 'price_low':
        $query .= " ORDER BY p.price ASC";
        break;
    case 'price_high':
        $query .= " ORDER BY p.price DESC";
        break;
    case 'rating':
        $query .= " ORDER BY c.rating DESC";
        break;
    case 'newest':
    default:
        $query .= " ORDER BY p.created_at DESC";
}

$stmt = $conn->prepare($query);

if (!$stmt) {
    die('Prepare failed: ' . $conn->error);
}

if (!empty($params)) {
    if (!$stmt->bind_param($types, ...$params)) {
        die('Bind param failed: ' . $stmt->error);
    }
}

if (!$stmt->execute()) {
    die('Execute failed: ' . $stmt->error);
}

$result = $stmt->get_result();
$packages = $result->fetch_all(MYSQLI_ASSOC);

// Get unique event types for filter dropdown
$event_types_result = $conn->query("
    SELECT DISTINCT event_type 
    FROM packages 
    WHERE event_type IS NOT NULL AND event_type != ''
    ORDER BY event_type
");
$event_types = $event_types_result->fetch_all(MYSQLI_ASSOC);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browse Catering Packages - CaterAI</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #f9fafb;
            color: #1f2937;
        }

        .navbar {
            background: white;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            padding: 16px 32px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .navbar-brand {
            font-size: 22px;
            font-weight: 700;
            color: #1f2937;
        }

        .navbar-links {
            display: flex;
            gap: 24px;
            align-items: center;
        }

        .navbar-link {
            text-decoration: none;
            color: #6b7280;
            font-size: 14px;
            font-weight: 500;
            transition: color 0.2s;
        }

        .navbar-link:hover,
        .navbar-link.active {
            color: #2563eb;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 40px 32px;
        }

        .page-header {
            margin-bottom: 40px;
        }

        .page-header h1 {
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 8px;
            color: #1f2937;
        }

        .page-header p {
            font-size: 16px;
            color: #6b7280;
        }

        .filters-card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 32px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .filters-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr auto auto;
            gap: 16px;
            align-items: flex-end;
        }

        .form-group {
            display: flex;
            flex-direction: column;
        }

        .form-group label {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #374151;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .form-group input,
        .form-group select {
            padding: 10px 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        .form-group input::placeholder {
            color: #9ca3af;
        }

        .form-group input:focus,
        .form-group select:focus {
            outline: none;
            border-color: #2563eb;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .btn-primary {
            background: #2563eb;
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
            font-size: 14px;
        }

        .btn-primary:hover {
            background: #1d4ed8;
        }

        .btn-secondary {
            background: #f3f4f6;
            color: #1f2937;
            border: 1px solid #e5e7eb;
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 14px;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .btn-secondary:hover {
            background: #e5e7eb;
        }

        .results-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }

        .results-count {
            font-size: 16px;
            color: #6b7280;
        }

        .results-count strong {
            color: #1f2937;
            font-weight: 600;
        }

        .packages-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 28px;
        }

        .package-card {
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .package-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
        }

        .card-header {
            padding: 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 120px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
        }

        .card-event-type {
            position: absolute;
            top: 16px;
            right: 16px;
            background: rgba(255, 255, 255, 0.25);
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .card-title {
            font-size: 20px;
            font-weight: 700;
            line-height: 1.3;
            margin-bottom: 4px;
            padding-right: 60px;
        }

        .card-subtitle {
            font-size: 14px;
            opacity: 0.9;
        }

        .price-display {
            font-size: 28px;
            font-weight: 700;
            color: white;
            margin-top: 8px;
        }

        .price-label {
            font-size: 12px;
            opacity: 0.8;
        }

        .card-body {
            padding: 20px;
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .caterer-info {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid #f3f4f6;
        }

        .caterer-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 16px;
            flex-shrink: 0;
        }

        .caterer-details {
            flex: 1;
            min-width: 0;
        }

        .caterer-name {
            font-weight: 600;
            font-size: 14px;
            color: #1f2937;
            margin-bottom: 2px;
        }

        .caterer-location {
            font-size: 12px;
            color: #9ca3af;
        }

        .rating {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 600;
            color: #f59e0b;
        }

        .details-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 16px;
            flex: 1;
        }

        .detail-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: #4b5563;
        }

        .description {
            font-size: 13px;
            color: #6b7280;
            line-height: 1.5;
            margin-bottom: 16px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .card-footer {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            padding-top: 16px;
            border-top: 1px solid #f3f4f6;
            margin-top: auto;
        }

        .btn-view-details {
            background: #2563eb;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            text-decoration: none;
            text-align: center;
            transition: background 0.2s;
        }

        .btn-view-details:hover {
            background: #1d4ed8;
        }

        .btn-inquiry {
            background: #f3f4f6;
            color: #1f2937;
            border: 1px solid #e5e7eb;
            padding: 10px 16px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-inquiry:hover {
            background: #e5e7eb;
        }

        .empty-state {
            text-align: center;
            padding: 80px 40px;
            background: white;
            border-radius: 12px;
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }

        .empty-state h3 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #1f2937;
        }

        .empty-state p {
            color: #6b7280;
            margin-bottom: 24px;
        }

        @media (max-width: 1024px) {
            .filters-grid {
                grid-template-columns: 1fr 1fr;
            }

            .packages-grid {
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            }
        }

        @media (max-width: 768px) {
            .navbar {
                padding: 12px 16px;
                flex-direction: column;
                gap: 12px;
                align-items: flex-start;
            }

            .navbar-links {
                width: 100%;
                justify-content: space-between;
                gap: 12px;
            }

            .container {
                padding: 24px 16px;
            }

            .page-header h1 {
                font-size: 28px;
            }

            .filters-grid {
                grid-template-columns: 1fr;
            }

            .card-footer {
                grid-template-columns: 1fr;
            }

            .packages-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="navbar">
        <div class="navbar-brand">CaterAI</div>
        <div class="navbar-links">
            <a href="index.php" class="navbar-link">Home</a>
            <a href="browse_packages.php" class="navbar-link active">Browse</a>
            <?php if ($is_logged_in): ?>
                <a href="dashboard/<?php echo $_SESSION['role']; ?>.php" class="navbar-link">Dashboard</a>
                <a href="logout.php" class="navbar-link">Logout</a>
            <?php else: ?>
                <a href="login.php" class="navbar-link">Login</a>
                <a href="register.php" class="navbar-link">Sign Up</a>
            <?php endif; ?>
        </div>
    </div>

    <div class="container">
        <div class="page-header">
            <h1>Find Your Perfect Catering Service</h1>
            <p>Browse trusted, verified caterers and discover the ideal packages for your event</p>
        </div>

        <div class="filters-card">
            <form method="GET">
                <div class="filters-grid">
                    <div class="form-group">
                        <label>Search Packages</label>
                        <input type="text" name="search" placeholder="Package or caterer name..." value="<?php echo htmlspecialchars($search); ?>">
                    </div>

                    <div class="form-group">
                        <label>Event Type</label>
                        <select name="event_type">
                            <option value="">All Types</option>
                            <?php foreach ($event_types as $type): ?>
                                <option value="<?php echo htmlspecialchars($type['event_type']); ?>" <?php echo $event_type === $type['event_type'] ? 'selected' : ''; ?>>
                                    <?php echo htmlspecialchars($type['event_type']); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Sort By</label>
                        <select name="sort">
                            <option value="newest" <?php echo $sort === 'newest' ? 'selected' : ''; ?>>Newest First</option>
                            <option value="price_low" <?php echo $sort === 'price_low' ? 'selected' : ''; ?>>Price: Low to High</option>
                            <option value="price_high" <?php echo $sort === 'price_high' ? 'selected' : ''; ?>>Price: High to Low</option>
                            <option value="rating" <?php echo $sort === 'rating' ? 'selected' : ''; ?>>Top Rated</option>
                        </select>
                    </div>

                    <button type="submit" class="btn-primary">Filter</button>
                    <a href="browse_packages.php" class="btn-secondary">Reset</a>
                </div>
            </form>
        </div>

        <div class="results-header">
            <div class="results-count">Found <strong><?php echo count($packages); ?></strong> packages</div>
        </div>

        <?php if (!empty($packages)): ?>
            <div class="packages-grid">
                <?php foreach ($packages as $package): 
                    $initials = strtoupper(substr($package['business_name'], 0, 1));
                ?>
                    <div class="package-card">
                        <div class="card-header">
                            <div>
                                <div class="card-title"><?php echo htmlspecialchars($package['package_name']); ?></div>
                                <div class="card-subtitle"><?php echo htmlspecialchars($package['event_type']); ?></div>
                            </div>
                            <div class="price-label">Starting price</div>
                            <div class="price-display">₱<?php echo number_format($package['price']); ?></div>
                            <div class="card-event-type"><?php echo htmlspecialchars($package['event_type']); ?></div>
                        </div>

                        <div class="card-body">
                            <div class="caterer-info">
                                <div class="caterer-avatar"><?php echo $initials; ?></div>
                                <div class="caterer-details">
                                    <div class="caterer-name"><?php echo htmlspecialchars($package['business_name']); ?></div>
                                    <div class="caterer-location">📍 <?php echo htmlspecialchars($package['city']); ?></div>
                                </div>
                                <div class="rating">
                                    ⭐ <?php echo number_format($package['rating'], 1); ?>
                                </div>
                            </div>

                            <div class="details-list">
                                <div class="detail-item">
                                    <span>👥</span>
                                    <span><?php echo htmlspecialchars($package['guest_count_min']); ?> - <?php echo htmlspecialchars($package['guest_count_max']); ?> guests</span>
                                </div>
                            </div>

                            <div class="description"><?php echo htmlspecialchars(substr($package['description'], 0, 100)); ?>...</div>

                            <div class="card-footer">
                                <a href="package_details.php?id=<?php echo $package['id']; ?>&caterer=<?php echo $package['caterer_id']; ?>" class="btn-view-details">View Details</a>
                                <button type="button" class="btn-inquiry" onclick="handleInquiry(<?php echo $is_customer ? 'true' : 'false'; ?>)">Inquiry</button>
                            </div>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php else: ?>
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <h3>No packages found</h3>
                <p>Try adjusting your search or filter criteria</p>
                <a href="browse_packages.php" class="btn-primary">Clear Filters</a>
            </div>
        <?php endif; ?>
    </div>

    <script>
        function handleInquiry(isCustomer) {
            if (!isCustomer) {
                alert('Please login as a customer to inquire about this service');
                window.location.href = 'login.php';
            } else {
                alert('Inquiry feature coming soon!');
            }
        }
    </script>
</body>
</html>
