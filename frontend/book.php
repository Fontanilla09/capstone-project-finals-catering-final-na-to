<?php
$package = isset($_GET['package']) ? '?package=' . rawurlencode($_GET['package']) : '';
$caterer = isset($_GET['caterer']) ? (str_contains($package, '?') ? '&' : '?') . 'caterer=' . rawurlencode($_GET['caterer']) : '';
$payment = isset($_GET['payment']) ? ((str_contains($package . $caterer, '?') ? '&' : '?') . 'payment=' . rawurlencode($_GET['payment'])) : '';
$target = 'http://localhost:5174/book' . $package . $caterer . $payment;
header('Location: ' . $target, true, 302);
exit;
