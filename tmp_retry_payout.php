<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
$_GET['action'] = 'send_payout';
$_POST['payout_id'] = 13;
require __DIR__ . '/backend/config.php';
$_SESSION['user_id'] = 1;
$_SESSION['role'] = 'admin';
require __DIR__ . '/backend/dashboard_api.php';
