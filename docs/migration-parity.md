Independent verification checkpoint, 2026-10-21

Reference commit: `ef9ea289821051d85078d7d1bc94a8c0ce255a28`. All expected response bodies in `tests/fixtures/reference/` came from this PHP implementation, never the replacement. The lead approved the temporary I/O/clock adapter and accepted the core reference gate before A/B implementation.

The isolated runtime is PHP 8.3.33, supplied by WordPress Playground `@php-wasm/node` 3.1.60 in `/tmp/avian-php-reference-runtime`; its unmodified default timezone was UTC and GD was enabled. The deterministic clock is `2026-10-21T12:00:00+00:00` (1792584000). No PHP interpreter, source, package dependency or capture tool is required by the continuing test suite. Production's deployed timezone remains unverified.

Capture provenance and method:

- `provenance.json` records baseline source SHA256 hashes, runtime, fixed clock and adapter hash. `runtime-characterization.json` records actual PHP date parsing, query parsing and number encoding.
- Baseline API/config example files were extracted by `git archive` into `/tmp/avian-reference-capture`. Adaptation inserts a namespace and shadows `time`, `date`, `strtotime`, HTTPS `file_get_contents`, response `header`, and the last-upstream-header getter. Local file I/O and all business functions remain the baseline implementation. `strtotime` still calls PHP's parser with a fixed base timestamp. `date` calls PHP's formatter. The header adapter implements PHP's replacement-by-name behavior.
- A single capability check for `http_get_last_response_headers` becomes true so the namespaced test getter supplies the fixture status. The synthetic transport records upstream URL, context headers and timeout. All tokens are synthetic. Cache fixtures use filenames computed by PHP itself.
- `gd/` contains synthetic RGBA PNG input files and expected output PNGs encoded by the exact extracted PHP GD postprocessing block. These are independent decoded-image/geometry oracles. `public-sha256.json` captures all 845 baseline frontend/artwork file hashes.

Verification completed:

| Evidence | Result |
| --- | --- |
| `npm test -- tests/contract` after 44 initial response/cache captures | 45 tests passed: 44 response cases plus the 845-file hash comparison |
| Final expanded HTTP suite with 57 captures | 58/58 passed:57 response cases plus public hash comparison |
| `npm run test:browser` | 9 passed across Chromium, Firefox and WebKit |
| PHP GD alpha/geometry capture | Nine input/output fixtures captured; auxiliary owner independently confirmed exact decoded-byte parity |

The independent suite caught `query-array-sci`: PHP echoes `sci[]=Corvus...` as a JSON array, while the replacement initially returned an object with numeric key `0`. The lead corrected query serialization; final58/58 verification passes with the original expected fixture unchanged.

HTTP fixtures cover all four eBird actions, requested hours/days coercion, exact cutoff, future/date-only/invalid rows, normalized versus raw species keys, null/zero/negative counts, missing coordinates, batch hotspot ordering/deduplication, exact species match and 503-row detail truncation, unchanged discovery records, nearby slicing/counts, scalar/object/non-record JSON, repeated/bracketed/indexed/mixed queries, ten/eleven hotspot selections, array-valued action/hours/sci, validation and upstream-error precedence, missing token, errors/OPTIONS, and dashboard GET/POST/PUT behavior. They also cover wiki valid/invalid names, allowed/disallowed thumbnail hosts, parsed-object versus transport fallback field presence, menu GET/POST, and cutout validation/missing errors.

Independent disk-cache captures test age59 fresh versus age60 expired, literal refresh1 versus refresh=true, unlimited-age stale transport/HTTP fallback, and invalid successful JSON refusing stale fallback. Every HTTP assertion compares status, final business headers, payload field presence/types/order, upstream URL/parameter order and timeout. Whitespace/object-key order is ignored.

Browser tests use unchanged actual frontend files and real Express API routes, with synthetic upstream transport and fixed server clock. They cover populated collage/stats/atlas, modal description and nearby rows, links, Escape, dark theme, saved atlas sort and reload, stored location/refresh settings, old single-hotspot preference migration, #sci/#about bookmarks, separate API origin through config.js/AV_API_BASE, mobile viewport, custom seven-day window, and preservation of nearby rows after refresh failure. Configuration script interception supplies the separate-origin deployment setting; no browser API response is mocked. Randomness is fixed. These are smoke checks, not exhaustive visual or interaction parity.

Important measurements: date-only input uses midnight; overflow February30 normalizes March2; malformed/empty dates fail. UTC has no DST transition. America/New_York fold `2026-11-01 01:30` chooses -04:00, and gap `2026-03-08 02:30` becomes03:30 -04:00. PHP JSON encodes negative zero as `-0` and 0.000001 as `1.0e-6`. For ordinary synthetic RGBA PNGs, baseline `IMG_CROP_TRANSPARENT` leaves the canvas unchanged; an805x406 canvas becomes800x403. Alpha quantization maps input1→0,127→126,128→129,254→255. Fully transparent images retain their geometry. Palette/tRNS transparency still needs capture.

Remaining independent acceptance gaps (not claimed complete): exhaustive browser matrix including empty states, missing artwork handling, pose toggles, resize/visual comparison, all window/refresh presets, geolocation allow/deny, hotspot selection/search/clear/eleventh rejection, automatic refresh/countdown/hidden-tab/overlap, history back/forward and already-open pre-migration clients; all endpoint methods/HEAD and every image lookup/size-boundary branch at HTTP level; discovery stale cache, malformed cache/write failure/restart/concurrency and legacy-key corner cases; stalled-read timeouts; nested query warning behavior; palette transparency; live upstream and real deployed timezone/CORS behavior; clean Node-only final image smoke and release/rollback checks. Auxiliary and eBird owners have additional focused tests; those do not replace the outstanding independent/browser evidence above.


## Final local integration update — 2026-10-21

Historical checkpoint statements above describe earlier evidence. Final local suite now passes 114 tests with only the opt-in renderer skipped; that renderer separately passes in the equipped environment. The independent 57 response expectations remain unchanged. Browser acceptance expanded to 36/36 and was independently rerun by lead. Five further independently captured PHP GD palette/tRNS pairs exposed and verified a crop fix; all14 PNG fixtures now match decoded pixels. Cache restart/concurrency/error coverage, final Node-only container checks38/38 and active HTTP200 response SIGTERM passed. PHP source was removed after those replacement gates. Public845 hashes remain unchanged.

Public legacy discovery now confirms an observed UTC +00:00 timestamp, and expected live OPTIONS CORS was measured. No authenticated Fly config/renderer/platform inspection or remote candidate/cutover was performed. Remaining measurements and release gates are explicitly enumerated in migration/coverage.md, migration/verification.md and migration/rollout-rollback.md; those reports supersede the earlier checkpoint gap list without claiming exhaustive visual or live-client parity.


PR follow-up: additional-acceptance.md and visual-comparisons.json close the scoped screenshot/custom-window/stats/collage/native-browser-permission/proxy/open-client gaps.72 cold/refreshed screenshot pairs match exactly across three engines, both themes and desktop/mobile. The existing mobile Chromium cold-to-refreshed image-layout difference reproduces on the golden side; comparison preserves equivalent cache/load state. Production HTML/JS/CSS hashes match baseline, and actual production-loaded pages survive browser-only handover to Express. Actual remote candidate/credentialed eBird/platform/rollback-image and macOS window/permission checks remain unexecuted.
