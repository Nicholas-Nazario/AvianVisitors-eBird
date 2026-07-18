<?php
// AvianVisitors - JSON facade over eBird recent geo observations.
//
// Endpoints (?action=...):
//   stats / lifelist / recent / species / timeseries / firstseen
//
// Config: avian/data/ebird.json (see ebird.example.json). Override token
// with env EBIRD_API_KEY. Observations are cached briefly on disk so the
// frontend's 30s poll does not hammer eBird.

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=30');

$DATA_DIR = dirname(__DIR__) . '/data';
$CONFIG_PATH = "$DATA_DIR/ebird.json";
$CACHE_TTL = 60; // seconds

$config = [
    'lat' => 40.785091,
    'lng' => -73.968285,
    'dist' => 3,
    'hotspot' => true,
    'back' => 30, // days to pull from eBird (max 30); window filter is applied in PHP
    'token' => '',
];
if (is_file($CONFIG_PATH)) {
    $loaded = json_decode((string)file_get_contents($CONFIG_PATH), true);
    if (is_array($loaded)) $config = array_merge($config, $loaded);
}
$token = getenv('EBIRD_API_KEY') ?: (string)($config['token'] ?? '');
if ($token === '') {
    http_response_code(503);
    echo json_encode(['error' => 'eBird API token missing — set avian/data/ebird.json or EBIRD_API_KEY']);
    exit;
}

// Optional query overrides from the menu drawer (lat / lng / dist / refresh).
if (isset($_GET['lat']) && is_numeric($_GET['lat'])) {
    $config['lat'] = max(-90.0, min(90.0, (float)$_GET['lat']));
}
if (isset($_GET['lng']) && is_numeric($_GET['lng'])) {
    $config['lng'] = max(-180.0, min(180.0, (float)$_GET['lng']));
}
if (isset($_GET['dist']) && is_numeric($_GET['dist'])) {
    $config['dist'] = max(1, min(50, (int)$_GET['dist']));
}
$forceRefresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';

// Per-geo cache file so changing location doesn't serve the wrong birds.
$CACHE_PATH = $DATA_DIR . '/ebird-cache-' . md5(json_encode([
    round((float)$config['lat'], 5),
    round((float)$config['lng'], 5),
    (int)$config['dist'],
    (int)($config['back'] ?? 30),
])) . '.json';


function parse_obs_dt(string $obsDt): ?int {
    // eBird: "2026-07-18 10:46" (local wall time, no TZ).
    $t = strtotime(str_replace(' ', 'T', $obsDt));
    return $t === false ? null : $t;
}

function fetch_ebird(array $config, string $token, string $cachePath, int $cacheTtl, bool $forceRefresh = false): array {
    if (!$forceRefresh && is_file($cachePath)) {
        $cached = json_decode((string)file_get_contents($cachePath), true);
        if (is_array($cached)
            && isset($cached['fetched_at'], $cached['obs'])
            && (time() - (int)$cached['fetched_at']) < $cacheTtl
            && is_array($cached['obs'])) {
            return $cached['obs'];
        }
    }

    $back = max(1, min(30, (int)($config['back'] ?? 30)));
    $query = http_build_query([
        'lat' => $config['lat'],
        'lng' => $config['lng'],
        'dist' => $config['dist'],
        'sort' => 'date',
        'hotspot' => !empty($config['hotspot']) ? 'true' : 'false',
        'back' => $back,
    ]);
    $url = 'https://api.ebird.org/v2/data/obs/geo/recent?' . $query;

    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "X-eBirdApiToken: $token\r\nAccept: application/json\r\n",
            'timeout' => 20,
            'ignore_errors' => true,
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    $status = 0;
    $respHeaders = function_exists('http_get_last_response_headers')
        ? http_get_last_response_headers()
        : ($http_response_header ?? null);
    if (is_array($respHeaders) && isset($respHeaders[0]) && preg_match('/\s(\d{3})\s/', $respHeaders[0], $m)) {
        $status = (int)$m[1];
    }
    if ($raw === false || $status >= 400) {
        // Serve stale cache if present rather than hard-failing the collage.
        if (is_file($cachePath)) {
            $cached = json_decode((string)file_get_contents($cachePath), true);
            if (is_array($cached) && is_array($cached['obs'] ?? null)) {
                return $cached['obs'];
            }
        }
        http_response_code(502);
        echo json_encode(['error' => 'eBird fetch failed', 'status' => $status]);
        exit;
    }
    $obs = json_decode($raw, true);
    if (!is_array($obs)) {
        http_response_code(502);
        echo json_encode(['error' => 'eBird returned invalid JSON']);
        exit;
    }

    @file_put_contents($cachePath, json_encode([
        'fetched_at' => time(),
        'obs' => $obs,
    ]));
    return $obs;
}

function filter_by_hours(array $obs, int $hours): array {
    $cutoff = time() - ($hours * 3600);
    $out = [];
    foreach ($obs as $row) {
        if (!is_array($row)) continue;
        $ts = parse_obs_dt((string)($row['obsDt'] ?? ''));
        if ($ts === null) continue;
        if ($ts >= $cutoff) $out[] = $row;
    }
    return $out;
}

/** Collapse checklist rows → one species record for the collage. */
function aggregate_species(array $obs): array {
    $by = [];
    foreach ($obs as $row) {
        $sci = trim((string)($row['sciName'] ?? ''));
        if ($sci === '') continue;
        $com = trim((string)($row['comName'] ?? $sci));
        $n = isset($row['howMany']) ? max(1, (int)$row['howMany']) : 1;
        $dt = (string)($row['obsDt'] ?? '');
        if (!isset($by[$sci])) {
            $by[$sci] = [
                'sci' => $sci,
                'com' => $com,
                'n' => 0,
                'last_seen' => $dt,
                'first_seen' => $dt,
                'best_conf' => null,
                'top_file' => null,
                'top_at' => $dt,
            ];
        }
        $by[$sci]['n'] += $n;
        if ($com !== '') $by[$sci]['com'] = $com;
        if ($dt !== '' && ($by[$sci]['last_seen'] === '' || strcmp($dt, $by[$sci]['last_seen']) > 0)) {
            $by[$sci]['last_seen'] = $dt;
            $by[$sci]['top_at'] = $dt;
        }
        if ($dt !== '' && ($by[$sci]['first_seen'] === '' || strcmp($dt, $by[$sci]['first_seen']) < 0)) {
            $by[$sci]['first_seen'] = $dt;
        }
    }
    $list = array_values($by);
    usort($list, function ($a, $b) {
        return strcmp($b['last_seen'], $a['last_seen']);
    });
    return $list;
}

$allObs = fetch_ebird($config, $token, $CACHE_PATH, $CACHE_TTL, $forceRefresh);
$action = $_GET['action'] ?? 'stats';

switch ($action) {

    case 'stats': {
        $day = filter_by_hours($allObs, 24);
        $hour = filter_by_hours($allObs, 1);
        $week = filter_by_hours($allObs, 168);
        $allAgg = aggregate_species($allObs);
        $dayAgg = aggregate_species($day);
        $weekAgg = aggregate_species($week);
        $started = null;
        foreach ($allAgg as $s) {
            if ($started === null || strcmp($s['first_seen'], $started) < 0) {
                $started = substr($s['first_seen'], 0, 10);
            }
        }
        $det = function (array $obs): int {
            $n = 0;
            foreach ($obs as $r) $n += isset($r['howMany']) ? max(1, (int)$r['howMany']) : 1;
            return $n;
        };
        echo json_encode([
            'totals'    => ['detections' => $det($allObs), 'species' => count($allAgg)],
            'today'     => ['detections' => $det($day), 'species' => count($dayAgg)],
            'last_hour' => ['detections' => $det($hour)],
            'week'      => ['detections' => $det($week), 'species' => count($weekAgg)],
            'started'   => $started,
            'as_of'     => date('c'),
            'source'    => 'ebird',
        ]);
        break;
    }

    case 'lifelist': {
        $rs = aggregate_species($allObs);
        usort($rs, function ($a, $b) {
            return strcmp($a['first_seen'], $b['first_seen']);
        });
        echo json_encode(['species' => $rs, 'as_of' => date('c'), 'source' => 'ebird']);
        break;
    }

    case 'recent': {
        $hours = max(1, min(1000000, (int)($_GET['hours'] ?? 24)));
        // eBird only retains ~30 days on this endpoint; ALL still caps there.
        $windowHours = min($hours, 30 * 24);
        $rs = aggregate_species(filter_by_hours($allObs, $windowHours));
        echo json_encode([
            'hours' => $hours,
            'species' => $rs,
            'as_of' => date('c'),
            'source' => 'ebird',
        ]);
        break;
    }

    case 'species': {
        $sci = $_GET['sci'] ?? '';
        if ($sci === '') {
            http_response_code(400);
            echo json_encode(['error' => 'sci= required']);
            break;
        }
        $mine = array_values(array_filter($allObs, function ($r) use ($sci) {
            return is_array($r) && ($r['sciName'] ?? '') === $sci;
        }));
        usort($mine, function ($a, $b) {
            return strcmp((string)($b['obsDt'] ?? ''), (string)($a['obsDt'] ?? ''));
        });
        $detections = [];
        foreach (array_slice($mine, 0, 500) as $r) {
            $dt = (string)($r['obsDt'] ?? '');
            $parts = explode(' ', $dt, 2);
            $detections[] = [
                'd' => $parts[0] ?? '',
                't' => $parts[1] ?? '00:00',
                'file' => null,
                'conf' => null,
                'howMany' => isset($r['howMany']) ? (int)$r['howMany'] : 1,
                'locName' => $r['locName'] ?? null,
            ];
        }
        $agg = aggregate_species($mine);
        $summary = $agg[0] ?? null;
        if ($summary) {
            $summary = [
                'com' => $summary['com'],
                'total' => $summary['n'],
                'first_seen' => $summary['first_seen'],
                'last_seen' => $summary['last_seen'],
                'best_conf' => null,
            ];
        }
        echo json_encode(['sci' => $sci, 'summary' => $summary, 'detections' => $detections, 'source' => 'ebird']);
        break;
    }

    case 'timeseries': {
        $days = max(1, min(90, (int)($_GET['days'] ?? 30)));
        $window = filter_by_hours($allObs, $days * 24);
        $byDate = [];
        $byHour = array_fill(0, 24, 0);
        foreach ($window as $r) {
            $dt = (string)($r['obsDt'] ?? '');
            $ts = parse_obs_dt($dt);
            if ($ts === null) continue;
            $date = substr($dt, 0, 10);
            $hour = (int)date('G', $ts);
            $n = isset($r['howMany']) ? max(1, (int)$r['howMany']) : 1;
            if (!isset($byDate[$date])) $byDate[$date] = ['detections' => 0, 'species' => []];
            $byDate[$date]['detections'] += $n;
            $sci = (string)($r['sciName'] ?? '');
            if ($sci !== '') $byDate[$date]['species'][$sci] = true;
            $byHour[$hour] += $n;
        }
        $daily = [];
        ksort($byDate);
        foreach ($byDate as $date => $row) {
            $daily[] = [
                'date' => $date,
                'detections' => $row['detections'],
                'species' => count($row['species']),
            ];
        }
        $by_hour = [];
        foreach ($byHour as $h => $n) {
            if ($n > 0) $by_hour[] = ['hour' => $h, 'detections' => $n];
        }
        echo json_encode([
            'days' => $days,
            'daily' => $daily,
            'by_hour' => $by_hour,
            'as_of' => date('c'),
            'source' => 'ebird',
        ]);
        break;
    }

    case 'firstseen': {
        $limit = max(1, min(50, (int)($_GET['limit'] ?? 10)));
        $rs = aggregate_species($allObs);
        usort($rs, function ($a, $b) {
            return strcmp($b['first_seen'], $a['first_seen']);
        });
        $out = [];
        foreach (array_slice($rs, 0, $limit) as $s) {
            $out[] = [
                'sci' => $s['sci'],
                'com' => $s['com'],
                'first_seen' => $s['first_seen'],
                'total' => $s['n'],
            ];
        }
        echo json_encode(['species' => $out, 'as_of' => date('c'), 'source' => 'ebird']);
        break;
    }

    default:
        http_response_code(404);
        echo json_encode(['error' => 'unknown action']);
}
