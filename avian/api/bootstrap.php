<?php
// Shared response headers for the API when the static frontend is hosted on
// a different origin, such as GitHub Pages.
declare(strict_types=1);

$origin = getenv('AV_CORS_ORIGIN') ?: '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
