<?php
require_once __DIR__ . '/config.php';

function showColumns($conn, $table) {
    $sql = "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '" . $conn->real_escape_string($table) . "' ORDER BY ORDINAL_POSITION";
    $res = $conn->query($sql);
    if (!$res) {
        echo "Error reading schema for {$table}: " . $conn->error . "\n";
        return;
    }
    echo "\nTable: {$table}\n";
    echo str_pad('COLUMN', 30) . str_pad('TYPE', 20) . str_pad('NULL', 8) . "DEFAULT\n";
    echo str_repeat('-', 80) . "\n";
    while ($row = $res->fetch_assoc()) {
        echo str_pad($row['COLUMN_NAME'], 30) . str_pad($row['COLUMN_TYPE'], 20) . str_pad($row['IS_NULLABLE'], 8) . var_export($row['COLUMN_DEFAULT'], true) . "\n";
    }
}

showColumns($conn, 'reservations');
showColumns($conn, 'payments');

?>
