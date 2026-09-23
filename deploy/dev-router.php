<?php
/**
 * Local emulation of deploy/htaccess for `php -S` (verification only, not uploaded):
 *   php -S 127.0.0.1:8090 -t out deploy/dev-router.php
 */
$root = rtrim($_SERVER["DOCUMENT_ROOT"] ?? getcwd(), "/");
$uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');

if (preg_match('#^/api/track/([A-Za-z0-9-]{1,40})/?$#i', $uri, $m)) {
  $_GET['code'] = $m[1];
  require $root . '/api/track.php';
  return true;
}
if (preg_match('#^/api/data/#', $uri)) {
  http_response_code(403);
  return true;
}
if ($uri !== '/' && substr($uri, -1) === '/' && (is_file($root . rtrim($uri, '/') . '.html') || !is_dir($root . $uri))) {
  header('Location: ' . rtrim($uri, '/'), true, 301);
  return true;
}
if ($uri === '/opengraph-image' && is_file($root . $uri)) {
  header('Content-Type: image/png');
  readfile($root . $uri);
  return true;
}
if (is_file($root . $uri)) {
  $ext = strtolower(pathinfo($uri, PATHINFO_EXTENSION));
  $types = ['wasm' => 'application/wasm', 'glb' => 'model/gltf-binary', 'ktx2' => 'image/ktx2', 'woff' => 'font/woff', 'woff2' => 'font/woff2', 'webmanifest' => 'application/manifest+json', 'txt' => 'text/plain', 'json' => 'application/json'];
  if (isset($types[$ext])) {
    header('Content-Type: ' . $types[$ext]);
    readfile($root . $uri);
    return true;
  }
  return false;
}
if (is_dir($root . $uri) && is_file($root . rtrim($uri, '/') . '/index.html')) {
  readfile($root . rtrim($uri, '/') . '/index.html');
  return true;
}
if (is_file($root . $uri . '.html')) {
  header('Content-Type: text/html; charset=utf-8');
  readfile($root . $uri . '.html');
  return true;
}
http_response_code(404);
header('Content-Type: text/html; charset=utf-8');
readfile($root . '/404.html');
return true;
