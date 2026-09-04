<?php
session_start();

// Check if caterer is logged in
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'caterer') {
    header('Location: ../login.php');
    exit;
}

require_once __DIR__ . '/../../backend/config.php';

// Get caterer information from database
$caterer_id = $_SESSION['caterer_id'];
$query = $conn->prepare("
    SELECT c.id, c.business_name, c.phone, c.address, c.city, c.description, c.business_permit, c.paypal_email, c.is_verified, c.verification_submitted, u.email
    FROM caterers c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
");
$query->bind_param("i", $caterer_id);
$query->execute();
$result = $query->get_result();
$caterer = $result->fetch_assoc();

$success_message = '';
$error_message = '';
// Which tab to show after reload (default to business-info)
$active_tab = isset($_GET['tab']) ? $_GET['tab'] : 'business-info';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['action']) && $_POST['action'] === 'update_profile') {
        $business_name = trim($_POST['business_name'] ?? '');
        $phone = trim($_POST['phone'] ?? '');
        $address = trim($_POST['address'] ?? '');
        $city = trim($_POST['city'] ?? '');
        $description = trim($_POST['description'] ?? '');
        $paypal_email = trim($_POST['paypal_email'] ?? '');

        if (empty($business_name) || empty($phone) || empty($address) || empty($city)) {
            $error_message = 'Please fill in all required fields.';
        } else {
            if ($paypal_email !== '' && !filter_var($paypal_email, FILTER_VALIDATE_EMAIL)) {
                $error_message = 'Please enter a valid PayPal email address.';
            }

            if (empty($error_message)) {
                $update_query = $conn->prepare("
                UPDATE caterers
                SET business_name = ?, phone = ?, address = ?, city = ?, description = ?, paypal_email = ?
                WHERE id = ?
            ");
                $update_query->bind_param("ssssssi", $business_name, $phone, $address, $city, $description, $paypal_email, $caterer_id);

            if ($update_query->execute()) {
                $success_message = 'Profile updated successfully!';
                // Refresh caterer data
                $query->execute();
                $result = $query->get_result();
                $caterer = $result->fetch_assoc();
                } else {
                    $error_message = 'Failed to update profile. Please try again.';
                }
            }
        }
    }

    if (isset($_POST['action']) && $_POST['action'] === 'submit_verification') {
        // Check if business permit is uploaded
        if (empty($caterer['business_permit'])) {
            $error_message = 'Please upload your business permit first.';
        } else {
            // Update verification submission state
            $verify_query = $conn->prepare("
                UPDATE caterers
                SET verification_submitted = 1, is_verified = 0
                WHERE id = ?
            ");
            $verify_query->bind_param("i", $caterer_id);

            if ($verify_query->execute()) {
                $success_message = 'Your application has been submitted for verification. The super admin will review your business permit.';
                // Refresh caterer data
                $query->execute();
                $result = $query->get_result();
                $caterer = $result->fetch_assoc();
            } else {
                $error_message = 'Failed to submit for verification. Please try again.';
            }
        }
    }
}

// Handle permit upload
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['business_permit'])) {
    $file = $_FILES['business_permit'];
    $allowed_types = ['application/pdf', 'image/jpeg', 'image/png'];
    $max_size = 10 * 1024 * 1024; // 10MB

    if ($file['error'] === UPLOAD_ERR_OK) {
        if (!in_array($file['type'], $allowed_types)) {
            $error_message = 'Invalid file type. Please upload PDF, JPG, or PNG only.';
        } elseif ($file['size'] > $max_size) {
            $error_message = 'File is too large. Maximum size is 10MB.';
        } else {
            $upload_dir = '../../uploads/permits/';
            if (!is_dir($upload_dir)) {
                mkdir($upload_dir, 0755, true);
            }

            $file_ext = pathinfo($file['name'], PATHINFO_EXTENSION);
            $file_name = 'permit_' . $caterer_id . '_' . time() . '.' . $file_ext;
            $file_path = $upload_dir . $file_name;

            if (move_uploaded_file($file['tmp_name'], $file_path)) {
                // Update database with permit filename and reset submission state
                $permit_query = $conn->prepare("UPDATE caterers SET business_permit = ?, verification_submitted = 0 WHERE id = ?");
                $permit_query->bind_param("si", $file_name, $caterer_id);

                if ($permit_query->execute()) {
                    $success_message = 'Business permit uploaded successfully!';
                    // Refresh caterer data
                    $query->execute();
                    $result = $query->get_result();
                    $caterer = $result->fetch_assoc();
                } else {
                    $error_message = 'Failed to save permit. Please try again.';
                }
            } else {
                $error_message = 'Failed to upload file. Please try again.';
            }
        }
    } else {
        $error_message = 'File upload error. Please try again.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Caterer Profile - CaterAI</title>
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

        .user-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .user-name {
            text-align: right;
        }

        .user-name strong {
            display: block;
        }

        .user-name small {
            font-size: 12px;
            opacity: 0.9;
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
            max-width: 1000px;
            margin: 30px auto;
            padding: 0 20px;
        }

        .back-btn {
            background-color: white;
            border: 1px solid #ddd;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            margin-bottom: 20px;
            font-size: 14px;
            transition: all 0.3s ease;
        }

        .back-btn:hover {
            background-color: #f0f0f0;
        }

        .page-title {
            margin: 20px 0;
        }

        .page-title h2 {
            font-size: 28px;
            margin-bottom: 5px;
        }

        .page-title p {
            color: #666;
            font-size: 14px;
        }

        .verification-badge {
            display: inline-block;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-top: 10px;
        }

        .badge-pending {
            background-color: #fff3cd;
            color: #856404;
        }

        .badge-verified {
            background-color: #d4edda;
            color: #155724;
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

        .alert-warning {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }

        .tabs {
            display: flex;
            gap: 0;
            margin: 20px 0;
            border-bottom: 2px solid #ddd;
        }

        .tab-btn {
            background: none;
            border: none;
            padding: 15px 30px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            color: #666;
            border-bottom: 3px solid transparent;
            transition: all 0.3s ease;
        }

        .tab-btn.active {
            color: #667eea;
            border-bottom-color: #667eea;
        }

        .tab-btn:hover {
            color: #667eea;
        }

        .tab-content {
            display: none;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .tab-content.active {
            display: block;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #333;
        }

        .form-group label .required {
            color: #e74c3c;
        }

        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.3s ease;
        }

        .form-group input:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-group textarea {
            resize: vertical;
            min-height: 100px;
        }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .form-row.full {
            grid-template-columns: 1fr;
        }

        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin: 25px 0 15px 0;
            color: #333;
        }

        .section-description {
            font-size: 13px;
            color: #666;
            margin-bottom: 15px;
        }

        .upload-area {
            border: 2px dashed #ddd;
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .upload-area:hover {
            border-color: #667eea;
            background-color: #f8f9ff;
        }

        .upload-area.dragover {
            border-color: #667eea;
            background-color: #f0f2ff;
        }

        .upload-area-icon {
            font-size: 40px;
            margin-bottom: 10px;
        }

        .upload-area-text {
            font-size: 14px;
            color: #666;
        }

        .upload-area-hint {
            font-size: 12px;
            color: #999;
            margin-top: 8px;
        }

        #permit_input {
            display: none;
        }

        .btn {
            padding: 12px 25px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.3s ease;
        }

        .btn-primary {
            background-color: #667eea;
            color: white;
        }

        .btn-primary:hover {
            background-color: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
        }

        .btn-secondary {
            background-color: #6c757d;
            color: white;
        }

        .btn-secondary:hover {
            background-color: #5a6268;
        }

        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 30px;
        }

        .verification-checklist {
            background-color: #f0f2ff;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-top: 20px;
        }

        .verification-checklist h4 {
            font-size: 14px;
            margin-bottom: 12px;
            color: #333;
        }

        .checklist-item {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
            font-size: 13px;
        }

        .checklist-item input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }

        .verification-status {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 10px;
        }

        .status-pending {
            background-color: #fff3cd;
            color: #856404;
        }

        .status-verified {
            background-color: #d4edda;
            color: #155724;
        }

        .status-text {
            font-size: 13px;
            color: #666;
            margin-top: 5px;
        }

        @media (max-width: 768px) {
            .form-row {
                grid-template-columns: 1fr;
            }

            .header {
                flex-direction: column;
                gap: 15px;
            }

            .header-left {
                width: 100%;
            }

            .user-info {
                width: 100%;
                justify-content: space-between;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <h1>CaterAI</h1>
        </div>
        <div class="user-info">
            <div class="user-name">
                <strong><?php echo htmlspecialchars($caterer['business_name']); ?></strong>
                <small><?php echo htmlspecialchars($caterer['email']); ?></small>
            </div>
            <form method="POST" action="../logout.php" style="margin: 0;">
                <button type="submit" class="logout-btn">Logout</button>
            </form>
        </div>
    </div>

    <div class="container">
        <button class="back-btn" onclick="window.history.back()">← Back</button>

        <div class="page-title">
            <h2>Business Profile</h2>
            <p>Manage your catering business information</p>
            <div class="verification-badge <?php echo $caterer['is_verified'] ? 'badge-verified' : 'badge-pending'; ?>">
                <?php echo $caterer['is_verified'] ? '✓ Verified' : '⏳ Pending Verification'; ?>
            </div>
        </div>

        <?php if (!empty($success_message)): ?>
            <div class="alert alert-success show"><?php echo htmlspecialchars($success_message); ?></div>
        <?php endif; ?>

        <?php if (!empty($error_message)): ?>
            <div class="alert alert-error show"><?php echo htmlspecialchars($error_message); ?></div>
        <?php endif; ?>

        <div class="tabs">
            <button class="tab-btn <?php echo $active_tab === 'business-info' ? 'active' : ''; ?>" onclick="switchTab('business-info', event)">Business Information</button>
            <button class="tab-btn <?php echo $active_tab === 'documents' ? 'active' : ''; ?>" onclick="switchTab('documents', event)">Documents</button>
        </div>

        <!-- Business Information Tab -->
        <div id="business-info" class="tab-content <?php echo $active_tab === 'business-info' ? 'active' : ''; ?>">
            <div class="section-title">Basic Information</div>
            <div class="section-description">Update your business details</div>

            <form method="POST" action="">
                <input type="hidden" name="action" value="update_profile">

                <div class="form-row">
                    <div class="form-group">
                        <label for="business_name">Business Name <span class="required">*</span></label>
                        <input 
                            type="text" 
                            id="business_name" 
                            name="business_name" 
                            value="<?php echo htmlspecialchars($caterer['business_name']); ?>"
                            required
                        >
                    </div>
                    <div class="form-group">
                        <label for="email">Email <span class="required">*</span></label>
                        <input 
                            type="email" 
                            id="email" 
                            value="<?php echo htmlspecialchars($caterer['email']); ?>"
                            readonly
                            disabled
                        >
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="phone">Phone Number <span class="required">*</span></label>
                        <input 
                            type="tel" 
                            id="phone" 
                            name="phone" 
                            value="<?php echo htmlspecialchars($caterer['phone']); ?>"
                            placeholder="09XXXXXXXXX"
                            required
                        >
                    </div>
                    <div class="form-group">
                        <label for="city">City <span class="required">*</span></label>
                        <input 
                            type="text" 
                            id="city" 
                            name="city" 
                            value="<?php echo htmlspecialchars($caterer['city'] ?? ''); ?>"
                            required
                        >
                    </div>
                </div>

                <div class="form-group form-row full">
                    <label for="address">Business Address <span class="required">*</span></label>
                    <textarea 
                        id="address" 
                        name="address"
                        required
                    ><?php echo htmlspecialchars($caterer['address'] ?? ''); ?></textarea>
                </div>

                <div class="form-group form-row full">
                    <label for="description">Business Description</label>
                    <textarea 
                        id="description" 
                        name="description"
                        placeholder="Tell customers about your catering business, experience, and specialties..."
                    ><?php echo htmlspecialchars($caterer['description'] ?? ''); ?></textarea>
                </div>

                <div class="form-group form-row full">
                    <label for="paypal_email">PayPal Email for Payouts</label>
                    <input type="email" id="paypal_email" name="paypal_email" value="<?php echo htmlspecialchars($caterer['paypal_email'] ?? ''); ?>" placeholder="you@example.com">
                    <small style="display:block; margin-top:6px; color:#666;">Admin will use this account when sending your completed-payment payout.</small>
                </div>

                <div class="button-group">
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>

        <!-- Documents Tab -->
        <div id="documents" class="tab-content <?php echo $active_tab === 'documents' ? 'active' : ''; ?>">
            <div class="section-title">Business Documents</div>
            <div class="section-description">Upload required documents for verification</div>

            <?php if (empty($caterer['business_permit'])): ?>
                <div class="alert alert-warning show">
                    ⚠️ Please upload your business permit to complete your profile and submit for verification.
                </div>
            <?php endif; ?>

            <div class="verification-status">
                <div class="status-badge <?php echo $caterer['is_verified'] ? 'status-verified' : 'status-pending'; ?>">
                    <?php echo $caterer['is_verified'] ? '✓ Verified' : 'Pending Verification'; ?>
                </div>
                <div class="status-text">
                    <?php 
                    if ($caterer['is_verified']) {
                        echo 'Your business has been verified by the super admin.';
                    } else if (!empty($caterer['business_permit'])) {
                        echo 'Your application is being reviewed by the super admin. This may take 1-3 business days.';
                    } else {
                        echo 'Submit your business permit for verification.';
                    }
                    ?>
                </div>
            </div>

            <?php if (!$caterer['is_verified']): ?>
                <form method="POST" enctype="multipart/form-data" action="">
                    <div class="form-group form-row full">
                        <label>Business Permit <span class="required">*</span></label>
                        <div class="upload-area" id="upload-area" onclick="document.getElementById('permit_input').click()">
                            <div class="upload-area-icon">📁</div>
                            <div class="upload-area-text">Click to upload business permit</div>
                            <div class="upload-area-hint">PDF, JPG, or PNG up to 10MB</div>
                        </div>
                            <input type="file" id="permit_input" name="business_permit" accept=".pdf,.jpg,.jpeg,.png" onchange="handleFileSelect(event)">
                    </div>

                    <div class="verification-checklist">
                        <h4>Verification Requirements:</h4>
                        <div class="checklist-item">
                            <input type="checkbox" id="check1" disabled <?php echo !empty($caterer['business_name']) ? 'checked' : ''; ?>>
                            <label for="check1">Valid business permit</label>
                        </div>
                        <div class="checklist-item">
                            <input type="checkbox" id="check2" disabled <?php echo !empty($caterer['business_name']) && !empty($caterer['address']) ? 'checked' : ''; ?>>
                            <label for="check2">Complete business information</label>
                        </div>
                        <div class="checklist-item">
                            <input type="checkbox" id="check3" disabled <?php echo !empty($caterer['business_permit']) ? 'checked' : ''; ?>>
                            <label for="check3">Clear and readable document copy</label>
                        </div>
                    </div>

                    <div class="button-group">
                        <?php if (!empty($caterer['business_permit']) && !$caterer['verification_submitted']): ?>
                            <button type="submit" name="action" value="submit_verification" class="btn btn-primary">Submit for Verification</button>
                        <?php elseif (!empty($caterer['business_permit']) && $caterer['verification_submitted']): ?>
                            <button type="button" class="btn btn-secondary" disabled>Awaiting Approval</button>
                        <?php else: ?>
                            <button type="submit" class="btn btn-primary" disabled>Upload Permit First</button>
                        <?php endif; ?>
                    </div>
                </form>
            <?php else: ?>
                <div class="alert alert-success show">
                    ✅ Your business is already verified. No further action is required.
                </div>
            <?php endif; ?>
        </div>
    </div>

    <script>
        function switchTab(tabName, event) {
            event.preventDefault();

            // Hide all tabs
            const tabs = document.querySelectorAll('.tab-content');
            tabs.forEach(tab => tab.classList.remove('active'));

            // Remove active class from all buttons
            const buttons = document.querySelectorAll('.tab-btn');
            buttons.forEach(btn => btn.classList.remove('active'));

            // Show selected tab
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
        }

        function handleFileSelect(event) {
            const file = event.target.files[0];
            const uploadArea = document.getElementById('upload-area');

            if (file) {
                // Check file size
                if (file.size > 10 * 1024 * 1024) {
                    alert('File is too large. Maximum size is 10MB.');
                    return;
                }

                // Check file type
                const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
                if (!allowedTypes.includes(file.type)) {
                    alert('Invalid file type. Please upload PDF, JPG, or PNG only.');
                    return;
                }

                uploadArea.innerHTML = `
                    <div class="upload-area-icon">✓</div>
                    <div class="upload-area-text">${file.name}</div>
                    <div class="upload-area-hint">Ready to upload</div>
                `;

                // Auto-submit the form
                event.target.form.submit();
            }
        }

        // Drag and drop functionality
        const uploadArea = document.getElementById('upload-area');
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                document.getElementById('permit_input').files = e.dataTransfer.files;
                handleFileSelect({ target: document.getElementById('permit_input') });
            });
        }
    </script>
</body>
</html>
