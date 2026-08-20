<?php
session_start();

// Check if admin is logged in
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'admin') {
    header('Location: ../login.php');
    exit;
}

require_once __DIR__ . '/../../backend/config.php';

$success_message = '';
$error_message = '';

// Handle verification approval
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    if ($_POST['action'] === 'approve') {
        $caterer_id = intval($_POST['caterer_id']);
        $update_query = $conn->prepare("UPDATE caterers SET is_verified = 1, verification_submitted = 0 WHERE id = ?");
        $update_query->bind_param("i", $caterer_id);
        if ($update_query->execute()) {
            $success_message = 'Caterer verified successfully!';
        } else {
            $error_message = 'Failed to verify caterer.';
        }
    } elseif ($_POST['action'] === 'reject') {
        $caterer_id = intval($_POST['caterer_id']);
        $update_query = $conn->prepare("UPDATE caterers SET is_verified = 0, verification_submitted = 0, business_permit = NULL WHERE id = ?");
        $update_query->bind_param("i", $caterer_id);
        if ($update_query->execute()) {
            $success_message = 'Caterer verification rejected. Business permit cleared.';
        } else {
            $error_message = 'Failed to reject verification.';
        }
    }
}

// Get pending caterers for verification
$pending_query = $conn->query("
    SELECT c.id, c.business_name, c.phone, c.address, c.city, c.business_permit, c.description, c.is_verified, u.email as user_email
    FROM caterers c
    JOIN users u ON c.user_id = u.id
    WHERE c.business_permit IS NOT NULL AND c.is_verified = 0 AND c.verification_submitted = 1
    ORDER BY c.created_at DESC
");

if ($pending_query) {
    $pending_caterers = $pending_query->fetch_all(MYSQLI_ASSOC);
} else {
    $pending_caterers = [];
    error_log('Admin dashboard query failed: ' . $conn->error);
}

// Get dashboard stats
$total_caterers = $conn->query("SELECT COUNT(*) as count FROM caterers")->fetch_assoc()['count'];
$verified_caterers = $conn->query("SELECT COUNT(*) as count FROM caterers WHERE is_verified = 1")->fetch_assoc()['count'];
$pending_verification = $conn->query("SELECT COUNT(*) as count FROM caterers WHERE business_permit IS NOT NULL AND is_verified = 0 AND verification_submitted = 1")->fetch_assoc()['count'];
$total_customers = $conn->query("SELECT COUNT(*) as count FROM customers")->fetch_assoc()['count'];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard - CaterAI</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f5f5;
            color: #333;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px 40px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .header-left h1 {
            font-size: 24px;
            font-weight: 600;
        }

        .admin-badge {
            background-color: rgba(255,255,255,0.2);
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }

        .user-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .logout-btn {
            background-color: rgba(255,255,255,0.2);
            border: 1px solid white;
            color: white;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s ease;
        }

        .logout-btn:hover {
            background-color: white;
            color: #667eea;
        }

        .container {
            max-width: 1200px;
            margin: 30px auto;
            padding: 0 20px;
        }

        .page-title {
            margin: 20px 0 30px 0;
        }

        .page-title h2 {
            font-size: 28px;
            margin-bottom: 5px;
        }

        .page-title p {
            color: #666;
            font-size: 14px;
        }

        .alert {
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
        }

        .alert.show {
            display: block;
        }

        .alert-success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .alert-error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
        }

        .stat-card h3 {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 10px;
        }

        .stat-card .number {
            font-size: 32px;
            font-weight: 700;
            color: #667eea;
        }

        .section-title {
            font-size: 20px;
            font-weight: 600;
            margin: 30px 0 20px 0;
            color: #333;
        }

        .section-description {
            font-size: 13px;
            color: #666;
            margin-bottom: 15px;
        }

        .table-container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th {
            background-color: #f8f9fa;
            padding: 15px;
            text-align: left;
            font-weight: 600;
            font-size: 13px;
            color: #333;
            border-bottom: 1px solid #dee2e6;
        }

        td {
            padding: 15px;
            border-bottom: 1px solid #dee2e6;
            font-size: 14px;
        }

        tr:hover {
            background-color: #f8f9fa;
        }

        .badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }

        .badge-verified {
            background-color: #d4edda;
            color: #155724;
        }

        .badge-pending {
            background-color: #fff3cd;
            color: #856404;
        }

        .btn {
            padding: 8px 15px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.3s ease;
            display: inline-block;
            margin-right: 5px;
        }

        .btn-approve {
            background-color: #28a745;
            color: white;
        }

        .btn-approve:hover {
            background-color: #218838;
        }

        .btn-reject {
            background-color: #dc3545;
            color: white;
        }

        .btn-reject:hover {
            background-color: #c82333;
        }

        .btn-view {
            background-color: #007bff;
            color: white;
        }

        .btn-view:hover {
            background-color: #0056b3;
        }

        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }

        .modal.show {
            display: block;
        }

        .modal-content {
            background-color: white;
            margin: 5% auto;
            padding: 30px;
            border-radius: 8px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
        }

        .modal-header {
            margin-bottom: 20px;
        }

        .modal-header h2 {
            font-size: 20px;
            margin-bottom: 5px;
        }

        .modal-header .close {
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            color: #aaa;
        }

        .modal-header .close:hover {
            color: #000;
        }

        .modal-body {
            margin-bottom: 20px;
        }

        .modal-body p {
            margin-bottom: 10px;
            font-size: 14px;
        }

        .modal-body strong {
            display: inline-block;
            width: 150px;
            color: #666;
        }

        .permit-preview {
            margin: 15px 0;
            text-align: center;
        }

        .permit-preview img,
        .permit-preview embed {
            max-width: 100%;
            max-height: 400px;
            border-radius: 5px;
        }

        .modal-footer {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }

        .no-data {
            text-align: center;
            padding: 40px;
            color: #666;
        }

        @media (max-width: 768px) {
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }

            .header {
                flex-direction: column;
                gap: 15px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <h1>CaterAI</h1>
            <span class="admin-badge">👨‍💼 SUPER ADMIN</span>
        </div>
        <div class="user-info">
            <form method="POST" action="../logout.php" style="margin: 0;">
                <button type="submit" class="logout-btn">Logout</button>
            </form>
        </div>
    </div>

    <div class="container">
        <div class="page-title">
            <h2>Admin Dashboard</h2>
            <p>Manage caterers and verify business permits</p>
        </div>

        <?php if (!empty($success_message)): ?>
            <div class="alert alert-success show"><?php echo htmlspecialchars($success_message); ?></div>
        <?php endif; ?>

        <?php if (!empty($error_message)): ?>
            <div class="alert alert-error show"><?php echo htmlspecialchars($error_message); ?></div>
        <?php endif; ?>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total Caterers</h3>
                <div class="number"><?php echo $total_caterers; ?></div>
            </div>
            <div class="stat-card">
                <h3>Verified</h3>
                <div class="number"><?php echo $verified_caterers; ?></div>
            </div>
            <div class="stat-card">
                <h3>Pending Review</h3>
                <div class="number"><?php echo $pending_verification; ?></div>
            </div>
            <div class="stat-card">
                <h3>Total Customers</h3>
                <div class="number"><?php echo $total_customers; ?></div>
            </div>
        </div>

        <div class="section-title">Caterer Verification</div>
        <div class="section-description">Review and verify caterers' business permits</div>

        <?php if (empty($pending_caterers)): ?>
            <div class="table-container">
                <div class="no-data">
                    <p>No caterers to manage yet.</p>
                </div>
            </div>
        <?php else: ?>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Business Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>City</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($pending_caterers as $caterer): ?>
                            <tr>
                                <td><?php echo htmlspecialchars($caterer['business_name']); ?></td>
                                <td><?php echo htmlspecialchars($caterer['user_email']); ?></td>
                                <td><?php echo htmlspecialchars($caterer['phone']); ?></td>
                                <td><?php echo htmlspecialchars($caterer['city']); ?></td>
                                <td>
                                    <span class="badge <?php echo $caterer['is_verified'] ? 'badge-verified' : 'badge-pending'; ?>">
                                        <?php echo $caterer['is_verified'] ? '✓ Verified' : '⏳ Pending'; ?>
                                    </span>
                                </td>
                                <td>
                                    <button class="btn btn-view" onclick="viewCaterer(<?php echo htmlspecialchars(json_encode($caterer)); ?>)">
                                        View Details
                                    </button>
                                    <?php if (!$caterer['is_verified']): ?>
                                        <form method="POST" style="display: inline;">
                                            <input type="hidden" name="action" value="approve">
                                            <input type="hidden" name="caterer_id" value="<?php echo $caterer['id']; ?>">
                                            <button type="submit" class="btn btn-approve" onclick="return confirm('Approve this caterer?')">Approve</button>
                                        </form>
                                        <form method="POST" style="display: inline;">
                                            <input type="hidden" name="action" value="reject">
                                            <input type="hidden" name="caterer_id" value="<?php echo $caterer['id']; ?>">
                                            <button type="submit" class="btn btn-reject" onclick="return confirm('Reject this caterer?')">Reject</button>
                                        </form>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </div>

    <!-- Modal -->
    <div id="detailModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <span class="close" onclick="closeModal()">&times;</span>
                <h2 id="modalTitle">Caterer Details</h2>
            </div>
            <div class="modal-body" id="modalBody">
            </div>
        </div>
    </div>

    <script>
        function viewCaterer(caterer) {
            const modal = document.getElementById('detailModal');
            const modalBody = document.getElementById('modalBody');
            
            let permitHtml = '';
            if (caterer.business_permit) {
                const permitPath = '../../uploads/permits/' + caterer.business_permit;
                if (caterer.business_permit.endsWith('.pdf')) {
                    permitHtml = `<div class="permit-preview"><embed src="${permitPath}" type="application/pdf" width="100%" height="400px"></embed></div>`;
                } else {
                    permitHtml = `<div class="permit-preview"><img src="${permitPath}" alt="Business Permit"></div>`;
                }
            }

            modalBody.innerHTML = `
                <p><strong>Business Name:</strong> ${caterer.business_name}</p>
                <p><strong>Email:</strong> ${caterer.user_email}</p>
                <p><strong>Phone:</strong> ${caterer.phone}</p>
                <p><strong>Address:</strong> ${caterer.address}</p>
                <p><strong>City:</strong> ${caterer.city}</p>
                <p><strong>Description:</strong> ${caterer.description || 'N/A'}</p>
                <p><strong>Status:</strong> ${caterer.is_verified ? '✓ Verified' : '⏳ Pending Verification'}</p>
                <p><strong>Business Permit:</strong></p>
                ${permitHtml}
            `;

            modal.classList.add('show');
        }

        function closeModal() {
            document.getElementById('detailModal').classList.remove('show');
        }

        window.onclick = function(event) {
            const modal = document.getElementById('detailModal');
            if (event.target == modal) {
                closeModal();
            }
        }
    </script>
</body>
</html>
