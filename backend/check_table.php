<?php
require_once __DIR__ . '/config.php';
header_remove();
$res = $conn->query("SHOW TABLES LIKE 'webhook_events'");
if (!$res) { echo 'query failed: '.$conn->error; exit(1); }
$row = $res->fetch_row();
if ($row) { echo "webhook_events table exists\n"; } else { echo "webhook_events table does NOT exist\n"; }

$res2 = $conn->query('SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE()');
if($res2){ $r=$res2->fetch_assoc(); echo "tables in DB: " . $r['c'] . "\n"; }
?>