<?php
// Database Configuration
define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASSWORD', '');
define('DB_NAME', 'cateraidb');

// Create connection
$conn = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Set charset to utf8
$conn->set_charset("utf8");

// Ensure the critical schema exists for the chat and admin flows.
$conn->query("CREATE TABLE IF NOT EXISTS admin_activity_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    admin_user_id INT NOT NULL,
    action VARCHAR(80) NOT NULL,
    details VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
)");

$conn->query("CREATE TABLE IF NOT EXISTS messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    reservation_id INT DEFAULT NULL,
    package_id INT DEFAULT NULL,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    message TEXT NOT NULL,
    attachment VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");

$messages_check = $conn->query("SHOW COLUMNS FROM messages LIKE 'package_id'");
if ($messages_check === false || $messages_check->num_rows === 0) {
    $conn->query('ALTER TABLE messages ADD COLUMN package_id INT DEFAULT NULL');
}

$messages_reservation_check = $conn->query("SHOW COLUMNS FROM messages LIKE 'reservation_id'");
if ($messages_reservation_check === false || $messages_reservation_check->num_rows === 0) {
    $conn->query('ALTER TABLE messages ADD COLUMN reservation_id INT DEFAULT NULL');
} else {
    $conn->query('ALTER TABLE messages MODIFY reservation_id INT NULL');
}

$profile_image_check = $conn->query("SHOW COLUMNS FROM caterers LIKE 'profile_image'");
if ($profile_image_check === false || $profile_image_check->num_rows === 0) {
    $conn->query('ALTER TABLE caterers ADD COLUMN profile_image VARCHAR(255) DEFAULT NULL AFTER business_permit');
}

// Base URL
define('BASE_URL', 'http://localhost/capstone project finals catering/');

// Start session only if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
?>
