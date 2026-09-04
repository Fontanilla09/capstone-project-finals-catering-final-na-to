<?php
require_once __DIR__ . '/config.php';
echo 'Connected to DB: ' . DB_NAME . PHP_EOL;
$res = $conn->query('SELECT COUNT(*) as c FROM users');
if ($res) {
    $row = $res->fetch_assoc();
    echo 'Users: ' . $row['c'] . PHP_EOL;
} else {
    echo 'Query failed: ' . $conn->error . PHP_EOL;
}
?>