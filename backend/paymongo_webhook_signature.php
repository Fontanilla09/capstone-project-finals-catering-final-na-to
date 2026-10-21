<?php

function paymongo_webhook_signature_is_valid(string $header, string $rawBody, string $mode, string $secret): bool
{
    if (!in_array($mode, ['test', 'live'], true) || $secret === '') return false;

    $parts = [];
    foreach (explode(',', $header) as $part) {
        $pair = explode('=', trim($part), 2);
        if (count($pair) === 2) $parts[$pair[0]] = $pair[1];
    }

    $timestamp = $parts['t'] ?? '';
    $signature = $parts[$mode === 'live' ? 'li' : 'te'] ?? '';
    if (!ctype_digit($timestamp) || !preg_match('/^[a-f0-9]{64}$/i', $signature)) return false;

    $expected = hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);
    return hash_equals($expected, strtolower($signature));
}
