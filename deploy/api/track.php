<?php
declare(strict_types=1);

/**
 * Tujjor Express — tracking API for shared PHP hosting.
 * Mirrors src/app/api/track/[code]/route.ts (the Node handler used on Node hosts).
 *
 *   GET /api/track/{code}   (.htaccess rewrites it to track.php?code={code})
 *
 * Response (same contract as the Node route, consumed by TrackingPanel.tsx):
 *   200 { "found": true,  "code": "...", "status": "...", "history": [{ "status": "...", "at": "ISO date" }] }
 *   200 { "found": false, "code": "..." }
 *   400 { "found": false, "error": "invalid" }
 *
 * Data source: api/data/tracking.json — optional map { "CODE": { "status", "history" } } (see tracking.example.json).
 * Until the warehouse system / Telegram bot is connected, a missing file or entry = "not found" and
 * the UI routes the visitor to Telegram. Nothing here invents shipment data.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const STATUSES = ['received', 'warehouse', 'consolidated', 'transit', 'uzbekistan', 'chirchiq', 'ready'];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
  http_response_code(405);
  header('Allow: GET');
  echo json_encode(['found' => false, 'error' => 'method']);
  exit;
}

$raw = isset($_GET['code']) ? (string) $_GET['code'] : '';
$clean = substr(strtoupper(trim(rawurldecode($raw))), 0, 40);
if (!preg_match('/^[A-Z0-9-]{4,40}$/', $clean)) {
  http_response_code(400);
  echo json_encode(['found' => false, 'error' => 'invalid']);
  exit;
}

$result = ['found' => false, 'code' => $clean];

$file = __DIR__ . '/data/tracking.json';
if (is_readable($file)) {
  $data = json_decode((string) file_get_contents($file), true);
  $entry = is_array($data) && isset($data[$clean]) && is_array($data[$clean]) ? $data[$clean] : null;
  if ($entry !== null) {
    $status = isset($entry['status']) && in_array($entry['status'], STATUSES, true) ? $entry['status'] : null;
    $history = [];
    foreach (is_array($entry['history'] ?? null) ? $entry['history'] : [] as $h) {
      if (is_array($h) && isset($h['status'], $h['at']) && in_array($h['status'], STATUSES, true)) {
        $history[] = ['status' => $h['status'], 'at' => (string) $h['at']];
      }
    }
    if ($status !== null) {
      $result = ['found' => true, 'code' => $clean, 'status' => $status, 'history' => $history];
    }
  }
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
