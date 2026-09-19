<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? 'http://localhost:5174'));
header('Access-Control-Allow-Credentials: true');
require_once __DIR__ . '/config.php';
session_unset(); session_destroy(); echo json_encode(['success' => true]);
