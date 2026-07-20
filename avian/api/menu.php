<?php
// Minimal menu stub (Pi admin overlays removed).
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(['items' => []]);
