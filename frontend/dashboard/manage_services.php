<?php
session_start();

// Check if caterer is logged in
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'caterer') {
    header('Location: ../login.php');
    exit;
}

require_once __DIR__ . '/../../backend/config.php';

$caterer_id = $_SESSION['caterer_id'];
$success_message = '';
$error_message = '';

// Check if caterer is verified
$caterer_query = $conn->prepare("SELECT business_name, is_verified FROM caterers WHERE id = ?");
$caterer_query->bind_param("i", $caterer_id);
$caterer_query->execute();
$caterer_result = $caterer_query->get_result();
$caterer = $caterer_result->fetch_assoc();

if (!$caterer || !$caterer['is_verified']) {
    header('Location: caterer.php');
    exit;
}

// Prepare query for fetching services
$services_query = $conn->prepare("
    SELECT id, package_name, event_type, price, guest_count_min, guest_count_max, description
    FROM packages
    WHERE caterer_id = ?
    ORDER BY created_at DESC
");
$services_query->bind_param("i", $caterer_id);

// Handle delete service
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'delete') {
    $package_id = intval($_POST['package_id']);
    $delete_query = $conn->prepare("DELETE FROM packages WHERE id = ? AND caterer_id = ?");
    $delete_query->bind_param("ii", $package_id, $caterer_id);
    if ($delete_query->execute()) {
        $success_message = 'Service deleted successfully!';
    } else {
        $error_message = 'Failed to delete service.';
    }
}

// Handle create service
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'create') {
    $package_name = trim($_POST['package_name'] ?? '');
    $event_type = trim($_POST['event_type'] ?? '');
    $guest_range = trim($_POST['guest_range'] ?? '');
    $price = floatval($_POST['price'] ?? 0);
    $description = trim($_POST['description'] ?? '');
    $features = trim($_POST['features'] ?? '');
    
    // Validate inputs
    if (empty($package_name) || empty($event_type) || empty($guest_range) || $price <= 0) {
        $error_message = 'Please fill in all required fields.';
    } else {
        // Parse guest range (e.g., "100-150")
        $range_parts = explode('-', str_replace(' ', '', $guest_range));
        $guest_min = intval($range_parts[0] ?? 0);
        $guest_max = intval($range_parts[1] ?? $guest_min);
        
        if ($guest_min <= 0 || $guest_max <= 0) {
            $error_message = 'Invalid guest range.';
        } else {
            // Insert package into database
            $insert_query = $conn->prepare("
                INSERT INTO packages (caterer_id, package_name, event_type, price, guest_count_min, guest_count_max, description, includes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $insert_query->bind_param("isisiiis", $caterer_id, $package_name, $event_type, $price, $guest_min, $guest_max, $description, $features);
            
            if ($insert_query->execute()) {
                $success_message = 'Service created successfully!';
            } else {
                $error_message = 'Failed to create service. Please try again.';
            }
        }
    }
}

// Fetch all services for this caterer
$services_query->execute();
$services_result = $services_query->get_result();
$services = $services_result->fetch_all(MYSQLI_ASSOC);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manage Services - CaterAI</title>
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

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 20px;
        }

        .back-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #6b7280;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 14px;
            margin-bottom: 30px;
            transition: color 0.2s ease;
        }

        .back-button:hover {
            color: #1f2937;
        }

        .page-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
            gap: 20px;
            flex-wrap: wrap;
        }

        .header-content h1 {
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .header-content p {
            color: #64748b;
            font-size: 16px;
        }

        .add-service-btn {
            background: #1f2937;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background 0.2s ease;
            white-space: nowrap;
        }

        .add-service-btn:hover {
            background: #111827;
        }

        .services-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 24px;
        }

        .service-card {
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            padding: 24px;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .service-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 16px;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            background: #1f2937;
            color: white;
        }

        .status-badge.inactive {
            background: #e5e7eb;
            color: #6b7280;
        }

        .card-actions {
            display: flex;
            gap: 12px;
        }

        .action-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 18px;
            padding: 4px 8px;
            transition: opacity 0.2s ease;
        }

        .action-btn:hover {
            opacity: 0.7;
        }

        .action-btn.delete {
            color: #ef4444;
        }

        .action-btn.edit {
            color: #3b82f6;
        }

        .service-title {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 8px;
            color: #111827;
        }

        .service-type {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 16px;
        }

        .service-details {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
        }

        .detail-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: #475569;
        }

        .price {
            font-size: 20px;
            font-weight: 700;
            color: #1f2937;
            margin-top: 12px;
        }

        .alert {
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 24px;
        }

        .alert.success {
            background: #dcfce7;
            color: #15803d;
            border: 1px solid #86efac;
        }

        .alert.error {
            background: #fee2e2;
            color: #dc2626;
            border: 1px solid #fca5a5;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
        }

        .empty-state h2 {
            font-size: 24px;
            margin-bottom: 12px;
            color: #1f2937;
        }

        .empty-state p {
            color: #6b7280;
            margin-bottom: 24px;
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .modal.active {
            display: flex;
        }

        .modal-content {
            background: white;
            border-radius: 12px;
            padding: 32px;
            max-width: 400px;
            width: 90%;
        }

        .modal-header {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 20px;
        }

        .modal-body {
            margin-bottom: 24px;
            color: #6b7280;
        }

        .modal-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        }

        .modal-btn {
            padding: 10px 16px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
        }

        .modal-btn.cancel {
            background: #e5e7eb;
            color: #1f2937;
        }

        .modal-btn.delete {
            background: #ef4444;
            color: white;
        }

        .modal-btn:hover {
            opacity: 0.9;
        }

        .modal-content-large {
            background: white;
            border-radius: 12px;
            padding: 32px;
            max-width: 600px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
        }

        .modal-header-large {
            margin-bottom: 28px;
            position: relative;
        }

        .modal-header-large h2 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
            color: #1f2937;
        }

        .modal-header-large p {
            color: #6b7280;
            font-size: 14px;
        }

        .close-btn {
            position: absolute;
            top: 0;
            right: 0;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #6b7280;
            transition: color 0.2s ease;
        }

        .close-btn:hover {
            color: #1f2937;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
            color: #1f2937;
            font-size: 14px;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.2s ease;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: #1f2937;
            box-shadow: 0 0 0 3px rgba(31, 41, 55, 0.1);
        }

        .form-group textarea {
            resize: vertical;
        }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }

        .form-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 28px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }

        .btn-cancel {
            background: #e5e7eb;
            color: #1f2937;
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: background 0.2s ease;
        }

        .btn-cancel:hover {
            background: #d1d5db;
        }

        .btn-submit {
            background: #1f2937;
            color: white;
            padding: 10px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: background 0.2s ease;
        }

        .btn-submit:hover {
            background: #111827;
        }

        @media (max-width: 768px) {
            .page-header {
                flex-direction: column;
                align-items: flex-start;
            }

            .header-content h1 {
                font-size: 28px;
            }

            .services-grid {
                grid-template-columns: 1fr;
            }

            .add-service-btn {
                width: 100%;
                justify-content: center;
            }

            .form-row {
                grid-template-columns: 1fr;
            }

            .modal-content-large {
                max-width: 95%;
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <button type="button" class="back-button" onclick="window.location.href='caterer_dashboard.php'">
            ← Back
        </button>

        <?php if ($success_message): ?>
            <div class="alert success"><?php echo htmlspecialchars($success_message); ?></div>
        <?php endif; ?>

        <?php if ($error_message): ?>
            <div class="alert error"><?php echo htmlspecialchars($error_message); ?></div>
        <?php endif; ?>

        <div class="page-header">
            <div class="header-content">
                <h1>Manage Services</h1>
                <p>Create and manage your catering packages</p>
            </div>
        <button type="button" class="add-service-btn" onclick="openCreateModal()">
            + Add New Service
        </button>
        </div>

        <?php if (count($services) > 0): ?>
            <div class="services-grid">
                <?php foreach ($services as $service): ?>
                    <div class="service-card">
                        <div class="card-header">
                            <div class="status-badge">active</div>
                            <div class="card-actions">
                                <button type="button" class="action-btn edit" onclick="window.location.href='#edit-service'">
                                    ✏️
                                </button>
                                <button type="button" class="action-btn delete" onclick="openDeleteModal(<?php echo $service['id']; ?>)">
                                    🗑️
                                </button>
                            </div>
                        </div>

                        <div class="service-title"><?php echo htmlspecialchars($service['package_name']); ?></div>
                        <div class="service-type"><?php echo htmlspecialchars($service['event_type']); ?></div>

                        <div class="service-details">
                            <div class="detail-item">
                                👥 <?php echo $service['guest_count_min'] . '-' . $service['guest_count_max']; ?> guests
                            </div>
                        </div>

                        <div class="price">₱<?php echo number_format($service['price'], 2); ?></div>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php else: ?>
            <div class="empty-state">
                <h2>No services yet</h2>
                <p>Start by creating your first catering package</p>
            </div>
        <?php endif; ?>
    </div>

    <!-- Delete Confirmation Modal -->
    <div class="modal" id="deleteModal">
        <div class="modal-content">
            <div class="modal-header">Delete Service</div>
            <div class="modal-body">
                Are you sure you want to delete this service? This action cannot be undone.
            </div>
            <div class="modal-actions">
                <button type="button" class="modal-btn cancel" onclick="closeDeleteModal()">Cancel</button>
                <form method="POST" style="display: inline;">
                    <input type="hidden" name="action" value="delete">
                    <input type="hidden" name="package_id" id="deletePackageId" value="">
                    <button type="submit" class="modal-btn delete">Delete</button>
                </form>
            </div>
        </div>
    </div>

    <!-- Create Service Modal -->
    <div class="modal" id="createModal">
        <div class="modal-content-large">
            <div class="modal-header-large">
                <h2>Create New Service</h2>
                <p>Add a new catering package to your offerings</p>
                <button type="button" class="close-btn" onclick="closeCreateModal()">✕</button>
            </div>
            <form method="POST" enctype="multipart/form-data" id="createServiceForm">
                <input type="hidden" name="action" value="create">
                
                <div class="form-group">
                    <label>Package Name</label>
                    <input type="text" name="package_name" placeholder="e.g. Elegant Wedding Package" required>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Event Type</label>
                        <select name="event_type" required>
                            <option value="">Select type</option>
                            <option value="Wedding Event">Wedding Event</option>
                            <option value="Corporate Event">Corporate Event</option>
                            <option value="Birthday Event">Birthday Event</option>
                            <option value="Graduation">Graduation</option>
                            <option value="Anniversary">Anniversary</option>
                            <option value="Engagement">Engagement</option>
                            <option value="Baby Shower">Baby Shower</option>
                            <option value="Reunion">Reunion</option>
                            <option value="Conference">Conference</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Guest Range</label>
                        <input type="text" name="guest_range" placeholder="e.g. 100-150" required>
                    </div>
                </div>

                <div class="form-group">
                    <label>Price (₱)</label>
                    <input type="number" name="price" placeholder="75000" min="0" step="0.01" required>
                </div>

                <div class="form-group">
                    <label>Description</label>
                    <textarea name="description" placeholder="Describe what's included in this package..." rows="4"></textarea>
                </div>

                <div class="form-group">
                    <label>Features (one per line)</label>
                    <textarea name="features" placeholder="Premium Menu&#10;Elegant Decorations&#10;Professional Staff" rows="4"></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn-cancel" onclick="closeCreateModal()">Cancel</button>
                    <button type="submit" class="btn-submit">Create Service</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        function openDeleteModal(packageId) {
            document.getElementById('deletePackageId').value = packageId;
            document.getElementById('deleteModal').classList.add('active');
        }

        function closeDeleteModal() {
            document.getElementById('deleteModal').classList.remove('active');
        }

        function openCreateModal() {
            document.getElementById('createModal').classList.add('active');
            document.getElementById('createServiceForm').reset();
        }

        function closeCreateModal() {
            document.getElementById('createModal').classList.remove('active');
        }

        // Close modals when clicking outside
        document.getElementById('deleteModal').addEventListener('click', function (e) {
            if (e.target === this) {
                closeDeleteModal();
            }
        });

        document.getElementById('createModal').addEventListener('click', function (e) {
            if (e.target === this) {
                closeCreateModal();
            }
        });

        // Scroll to top when alerts appear
        window.addEventListener('load', function() {
            const alert = document.querySelector('.alert');
            if (alert) {
                alert.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    </script>
</body>
</html>
