<?php
// AvianVisitors - JSON facade over eBird recent observations and hotspots.
//
// Endpoints (?action=...):
//   dashboard / species / hotspots / nearby-species
//
// Config: avian/data/ebird.json (see ebird.example.json). Override token
// with env EBIRD_API_KEY. Observations are cached briefly on disk so the
// frontend's 30s poll does not hammer eBird.

declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=30');

$DATA_DIR = dirname(__DIR__) . '/data';
$CONFIG_PATH = "$DATA_DIR/ebird.json";
$CACHE_TTL = 60; // seconds

$config = [
    'lat' => 40.794618,
    'lng' => -73.959878,
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

// Optional query overrides from the menu drawer.
if (isset($_GET['lat']) && is_numeric($_GET['lat'])) {
    $config['lat'] = max(-90.0, min(90.0, (float)$_GET['lat']));
}
if (isset($_GET['lng']) && is_numeric($_GET['lng'])) {
    $config['lng'] = max(-180.0, min(180.0, (float)$_GET['lng']));
}
if (isset($_GET['dist']) && is_numeric($_GET['dist'])) {
    $config['dist'] = max(1, min(50, (int)$_GET['dist']));
}
$mode = ($_GET['mode'] ?? 'geo') === 'hotspot' ? 'hotspot' : 'geo';
$action = $_GET['action'] ?? 'dashboard';
$rawRegionCodes = $_GET['regionCode'] ?? [];
if (!is_array($rawRegionCodes)) $rawRegionCodes = [$rawRegionCodes];
$regionCodes = [];
foreach ($rawRegionCodes as $rawCode) {
    $code = trim((string)$rawCode);
    if ($code === '' || !preg_match('/^[A-Za-z0-9-]+$/', $code)) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid regionCode']);
        exit;
    }
    if (!in_array($code, $regionCodes, true)) $regionCodes[] = $code;
}
if ($mode === 'hotspot' && !$regionCodes && !in_array($action, ['hotspots', 'nearby-species'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'at least one regionCode is required for hotspot mode']);
    exit;
}
if (count($regionCodes) > 10) {
    http_response_code(400);
    echo json_encode(['error' => 'at most ten regionCode values are allowed']);
    exit;
}
$forceRefresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';

// Cache keys include the selected source so switching modes never returns
// observations from a previous geographic search or hotspot.
$CACHE_PATH = $DATA_DIR . '/ebird-cache-' . md5(json_encode([
    $mode,
    $regionCodes,
    round((float)$config['lat'], 5),
    round((float)$config['lng'], 5),
    (int)$config['dist'],
    (int)($config['back'] ?? 30),
])) . '.json';
$HOTSPOT_CACHE_PATH = $DATA_DIR . '/ebird-hotspots-' . md5(json_encode([
    round((float)$config['lat'], 5),
    round((float)$config['lng'], 5),
    (int)$config['dist'],
])) . '.json';


function parse_obs_dt(string $obsDt): ?int {
    // eBird: "2026-07-18 10:46" (local wall time, no TZ).
    $t = strtotime(str_replace(' ', 'T', $obsDt));
    return $t === false ? null : $t;
}

function fetch_ebird_source(array $config, string $token, string $cachePath, int $cacheTtl, bool $forceRefresh, string $mode, string $regionCode): array {
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
    if ($mode === 'hotspot') {
        if ($regionCode === '') {
            http_response_code(400);
            echo json_encode(['error' => 'regionCode is required for hotspot mode']);
            exit;
        }
        $url = 'https://api.ebird.org/v2/data/obs/US/recent?' . http_build_query([
            'back' => $back,
            'r' => $regionCode,
        ]);
    } else {
        $query = http_build_query([
            'lat' => $config['lat'],
            'lng' => $config['lng'],
            'dist' => $config['dist'],
            'sort' => 'date',
            'hotspot' => !empty($config['hotspot']) ? 'true' : 'false',
            'back' => $back,
        ]);
        $url = 'https://api.ebird.org/v2/data/obs/geo/recent?' . $query;
    }

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

function fetch_ebird(array $config, string $token, string $cachePath, int $cacheTtl, bool $forceRefresh = false, string $mode = 'geo', array $regionCodes = []): array {
    if ($mode !== 'hotspot') {
        return fetch_ebird_source($config, $token, $cachePath, $cacheTtl, $forceRefresh, 'geo', '');
    }
    // eBird accepts the requested hotspot IDs as a comma-separated `r` list.
    // The path region is only a required API parameter here; the `r` values
    // determine which locations are actually returned.
    $sourceCache = dirname($cachePath) . '/ebird-hotspots-batch-' . md5(json_encode([
        $regionCodes, (int)($config['back'] ?? 30),
    ])) . '.json';
    return fetch_ebird_source($config, $token, $sourceCache, $cacheTtl, $forceRefresh, 'hotspot', implode(',', $regionCodes));
}

function fetch_hotspots(array $config, string $token, string $cachePath, int $cacheTtl, bool $forceRefresh = false): array {
    if (!$forceRefresh && is_file($cachePath)) {
        $cached = json_decode((string)file_get_contents($cachePath), true);
        if (is_array($cached)
            && isset($cached['fetched_at'], $cached['hotspots'])
            && (time() - (int)$cached['fetched_at']) < $cacheTtl
            && is_array($cached['hotspots'])) {
            return $cached['hotspots'];
        }
    }
    $url = 'https://api.ebird.org/v2/ref/hotspot/geo?' . http_build_query([
        'lat' => $config['lat'],
        'lng' => $config['lng'],
        'dist' => $config['dist'],
        'fmt' => 'json',
    ]);
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
        if (is_file($cachePath)) {
            $cached = json_decode((string)file_get_contents($cachePath), true);
            if (is_array($cached) && is_array($cached['hotspots'] ?? null)) return $cached['hotspots'];
        }
        http_response_code(502);
        echo json_encode(['error' => 'eBird hotspot fetch failed', 'status' => $status]);
        exit;
    }
    $hotspots = json_decode($raw, true);
    if (!is_array($hotspots)) {
        http_response_code(502);
        echo json_encode(['error' => 'eBird returned invalid hotspot data']);
        exit;
    }
    @file_put_contents($cachePath, json_encode(['fetched_at' => time(), 'hotspots' => $hotspots]));
    return $hotspots;
}

/** Fetch recent nearby observations for one eBird species code. */
function fetch_nearby_species_observations(
    float $lat,
    float $lng,
    int $back,
    int $dist,
    int $maxResults,
    string $speciesCode,
    string $token
): array {
    $url = 'https://api.ebird.org/v2/data/obs/geo/recent/' . rawurlencode($speciesCode) . '?' . http_build_query([
        'lat' => $lat,
        'lng' => $lng,
        'back' => $back,
        'dist' => $dist,
        'maxResults' => $maxResults,
        'hotspot' => 'true',
    ]);
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
        http_response_code(502);
        echo json_encode(['error' => 'eBird nearby species fetch failed', 'status' => $status]);
        exit;
    }
    $rows = json_decode($raw, true);
    if (!is_array($rows)) {
        http_response_code(502);
        echo json_encode(['error' => 'eBird returned invalid nearby species data']);
        exit;
    }

    $observations = [];
    foreach (array_slice($rows, 0, $maxResults) as $row) {
        if (!is_array($row)) continue;
        $observations[] = [
            'speciesCode' => trim((string)($row['speciesCode'] ?? $speciesCode)),
            'locId' => trim((string)($row['locId'] ?? '')),
            'locName' => trim((string)($row['locName'] ?? '')),
            'obsDt' => trim((string)($row['obsDt'] ?? '')),
            'howMany' => isset($row['howMany']) ? max(1, (int)$row['howMany']) : null,
        ];
    }
    usort($observations, function ($a, $b) {
        return strcmp($b['obsDt'], $a['obsDt']);
    });
    return $observations;
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
                'speciesCode' => trim((string)($row['speciesCode'] ?? '')),
                'n' => 0,
                'last_observed' => $dt,
                'last_locName' => $row['locName'] ?? null,
                'first_observed' => $dt,
                'best_conf' => null,
                'top_file' => null,
                'top_at' => $dt,
            ];
        }
        $by[$sci]['n'] += $n;
        if (!empty($row['speciesCode'])) $by[$sci]['speciesCode'] = trim((string)$row['speciesCode']);
        if ($com !== '') $by[$sci]['com'] = $com;
        if ($dt !== '' && ($by[$sci]['last_observed'] === '' || strcmp($dt, $by[$sci]['last_observed']) > 0)) {
            $by[$sci]['last_observed'] = $dt;
            $by[$sci]['last_locName'] = $row['locName'] ?? null;
            $by[$sci]['top_at'] = $dt;
        }
        if ($dt !== '' && ($by[$sci]['first_observed'] === '' || strcmp($dt, $by[$sci]['first_observed']) < 0)) {
            $by[$sci]['first_observed'] = $dt;
        }
    }
    $list = array_values($by);
    usort($list, function ($a, $b) {
        return strcmp($b['last_observed'], $a['last_observed']);
    });
    return $list;
}

function geo_distance_km(float $latA, float $lngA, float $latB, float $lngB): float {
    $earthRadiusKm = 6371.0088;
    $latDelta = deg2rad($latB - $latA);
    $lngDelta = deg2rad($lngB - $lngA);
    $a = sin($latDelta / 2) ** 2
        + cos(deg2rad($latA)) * cos(deg2rad($latB)) * sin($lngDelta / 2) ** 2;
    return $earthRadiusKm * 2 * atan2(sqrt($a), sqrt(max(0.0, 1 - $a)));
}

/** Group observation rows by hotspot, then order hotspots nearest-first. */
function aggregate_hotspots(array $obs, float $originLat, float $originLng): array {
    $by = [];
    foreach ($obs as $row) {
        if (!is_array($row)) continue;
        $locId = trim((string)($row['locId'] ?? ''));
        $locName = trim((string)($row['locName'] ?? ''));
        if ($locId === '' && $locName === '') continue;
        $key = $locId !== '' ? $locId : $locName;
        $sci = trim((string)($row['sciName'] ?? ''));
        if ($sci === '') continue;
        $com = trim((string)($row['comName'] ?? $sci));
        $n = isset($row['howMany']) ? max(1, (int)$row['howMany']) : 1;
        $dt = (string)($row['obsDt'] ?? '');
        $lat = isset($row['lat']) && is_numeric($row['lat']) ? (float)$row['lat'] : null;
        $lng = isset($row['lng']) && is_numeric($row['lng']) ? (float)$row['lng'] : null;

        if (!isset($by[$key])) {
            $by[$key] = [
                'locId' => $locId !== '' ? $locId : null,
                'locName' => $locName !== '' ? $locName : $key,
                'lat' => $lat,
                'lng' => $lng,
                'n' => 0,
                'last_observed' => $dt,
                'species' => [],
            ];
        }
        $by[$key]['n'] += $n;
        if ($locName !== '') $by[$key]['locName'] = $locName;
        if ($by[$key]['lat'] === null && $lat !== null) $by[$key]['lat'] = $lat;
        if ($by[$key]['lng'] === null && $lng !== null) $by[$key]['lng'] = $lng;
        if ($dt !== '' && ($by[$key]['last_observed'] === '' || strcmp($dt, $by[$key]['last_observed']) > 0)) {
            $by[$key]['last_observed'] = $dt;
        }
        if (!isset($by[$key]['species'][$sci])) {
            $by[$key]['species'][$sci] = [
                'sci' => $sci,
                'com' => $com,
                'n' => 0,
                'last_observed' => $dt,
            ];
        }
        $by[$key]['species'][$sci]['n'] += $n;
        if ($com !== '') $by[$key]['species'][$sci]['com'] = $com;
        if ($dt !== '' && ($by[$key]['species'][$sci]['last_observed'] === '' || strcmp($dt, $by[$key]['species'][$sci]['last_observed']) > 0)) {
            $by[$key]['species'][$sci]['last_observed'] = $dt;
        }
    }

    foreach ($by as &$hotspot) {
        $hotspot['species'] = array_values($hotspot['species']);
        $hotspot['distance_km'] = $hotspot['lat'] !== null && $hotspot['lng'] !== null
            ? geo_distance_km($originLat, $originLng, $hotspot['lat'], $hotspot['lng'])
            : null;
        usort($hotspot['species'], function ($a, $b) {
            return ($b['n'] <=> $a['n']) ?: strcmp($b['last_observed'], $a['last_observed']);
        });
    }
    unset($hotspot);
    $list = array_values($by);
    usort($list, function ($a, $b) {
        $aDistance = $a['distance_km'];
        $bDistance = $b['distance_km'];
        if ($aDistance === null && $bDistance !== null) return 1;
        if ($aDistance !== null && $bDistance === null) return -1;
        if ($aDistance !== null && $bDistance !== null) {
            $byDistance = $aDistance <=> $bDistance;
            if ($byDistance !== 0) return $byDistance;
        }
        return strcmp($b['last_observed'], $a['last_observed']);
    });
    return $list;
}

function build_timeseries(array $obs, int $days): array {
    $window = filter_by_hours($obs, $days * 24);
    $byDate = [];
    $byHour = array_fill(0, 24, 0);
    foreach ($window as $r) {
        $dt = (string)($r['obsDt'] ?? '');
        $ts = parse_obs_dt($dt);
        if ($ts === null) continue;
        $date = substr($dt, 0, 10);
        $hour = (int)date('G', $ts);
        $n = isset($r['howMany']) ? max(1, (int)$r['howMany']) : 1;
        if (!isset($byDate[$date])) $byDate[$date] = ['observations' => 0, 'species' => []];
        $byDate[$date]['observations'] += $n;
        $sci = (string)($r['sciName'] ?? '');
        if ($sci !== '') $byDate[$date]['species'][$sci] = true;
        $byHour[$hour] += $n;
    }
    $daily = [];
    ksort($byDate);
    foreach ($byDate as $date => $row) {
        $daily[] = [
            'date' => $date,
            'observations' => $row['observations'],
            'species' => count($row['species']),
        ];
    }
    $by_hour = [];
    foreach ($byHour as $h => $n) {
        if ($n > 0) $by_hour[] = ['hour' => $h, 'observations' => $n];
    }
    return [
        'days' => $days,
        'daily' => $daily,
        'by_hour' => $by_hour,
    ];
}

if ($action === 'nearby-species') {
    $speciesCode = trim((string)($_GET['speciesCode'] ?? ''));
    if ($speciesCode === '' || !preg_match('/^[A-Za-z0-9-]+$/', $speciesCode)) {
        http_response_code(400);
        echo json_encode(['error' => 'valid speciesCode= required']);
        exit;
    }
    $back = max(1, min(30, (int)($_GET['back'] ?? 7)));
    $dist = max(1, min(50, (int)($_GET['dist'] ?? 25)));
    $maxResults = max(1, min(10000, (int)($_GET['maxResults'] ?? 100)));
    header('Cache-Control: no-store');
    echo json_encode([
        'speciesCode' => $speciesCode,
        'observations' => fetch_nearby_species_observations(
            (float)$config['lat'],
            (float)$config['lng'],
            $back,
            $dist,
            $maxResults,
            $speciesCode,
            $token
        ),
        'as_of' => date('c'),
        'source' => 'ebird',
    ]);
    exit;
}

if ($action === 'hotspots') {
    echo json_encode([
        'hotspots' => fetch_hotspots($config, $token, $HOTSPOT_CACHE_PATH, $CACHE_TTL, $forceRefresh),
        'as_of' => date('c'),
    ]);
    exit;
}

$allObs = fetch_ebird($config, $token, $CACHE_PATH, $CACHE_TTL, $forceRefresh, $mode, $regionCodes);

switch ($action) {

    case 'dashboard': {
        $hours = max(1, min(1000000, (int)($_GET['hours'] ?? 24)));
        $days = max(1, min(90, (int)($_GET['days'] ?? 30)));
        // eBird only retains ~30 days on this endpoint; ALL still caps there.
        $windowHours = min($hours, 30 * 24);
        $asOf = date('c');
        $recent = [
            'hours' => $hours,
            'species' => aggregate_species(filter_by_hours($allObs, $windowHours)),
            'hotspots' => aggregate_hotspots(
                filter_by_hours($allObs, $windowHours),
                (float)$config['lat'],
                (float)$config['lng']
            ),
            'as_of' => $asOf,
            'source' => 'ebird',
        ];
        $timeseries = build_timeseries($allObs, $days);
        $timeseries['as_of'] = $asOf;
        $timeseries['source'] = 'ebird';
        echo json_encode([
            'recent' => $recent,
            'timeseries' => $timeseries,
            'as_of' => $asOf,
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
        $observations = [];
        foreach (array_slice($mine, 0, 500) as $r) {
            $dt = (string)($r['obsDt'] ?? '');
            $parts = explode(' ', $dt, 2);
            $observations[] = [
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
                'speciesCode' => $summary['speciesCode'],
                'total' => $summary['n'],
                'first_observed' => $summary['first_observed'],
                'last_observed' => $summary['last_observed'],
                'last_locName' => $summary['last_locName'],
                'best_conf' => null,
            ];
        }
        echo json_encode(['sci' => $sci, 'summary' => $summary, 'observations' => $observations, 'source' => 'ebird']);
        break;
    }

    default:
        http_response_code(404);
        echo json_encode(['error' => 'unknown action']);
}
