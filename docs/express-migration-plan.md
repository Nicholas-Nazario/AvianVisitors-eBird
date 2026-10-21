**AvianVisitors: PHP-to-Express migration plan**

Status: planning complete; implementation has not started. Prepared 2026-10-21 against commit `ef9ea289821051d85078d7d1bc94a8c0ce255a28`.

The lead engineer owns architecture, task sequencing, integration, and release acceptance. Three subagents performed read-only reviews of the eBird API, frontend contracts, and auxiliary APIs/deployment to inform this plan. This document authorizes no production cutover by itself. The current deliverable is the plan; implementation starts on the user's instruction to proceed.

**Outcome and scope.** Replace every PHP implementation and the PHP/Apache runtime with Express 5, TypeScript, and Node.js. Frequent visitors must retain the same application, preferences, bookmarks, images, counts, and refresh behavior. This is a backend migration, with compatibility measured against the existing code and captured responses rather than assumptions in older documentation.

The completed application must contain no PHP source, interpreter, PHP build dependency, or PHP requirement for development, deployment, or its normal test suite. The independent Python artwork tools remain supported.

The following are mandatory constraints:

- Keep the frontend origin, backend hostname, public URL paths, and same-origin/separate-origin hosting options. Browser localStorage is origin-specific; changing the frontend domain would lose returning visitors' preferences.
- Keep existing HTML, CSS, JavaScript, artwork, dimensions, masks, and image version constants unchanged. Preserve the existing frontend configuration mechanism, `window.AV_API_BASE`.
- Keep `/avian/api/birdnet-api.php`, `/avian/api/cutout.php`, `/avian/api/wiki.php`, and `/avian/api/menu.php` as Express route names. A URL ending in `.php` does not execute PHP. Keeping these names protects old frontend bundles, already-open tabs, direct image links, and API consumers without a coordinated frontend deployment.
- Do not introduce extensionless API redesigns, a frontend framework, a database, new accounts/authentication, new count semantics, or artwork regeneration in this migration.
- Preserve behavior that may look unusual until its compatibility implications are understood. Any necessary externally visible deviation must be documented and raised before implementation; it cannot be silently included in a parity claim.

**Target architecture.** Use Node.js 24 LTS, Express 5, TypeScript with strict checking, and npm with a committed lockfile. Pin the selected runtime and dependency versions when implementation begins. Build server TypeScript to JavaScript for production; use a development runner locally. Node 24 is an LTS release at the time of this plan; recheck support if execution is substantially delayed. [Node release schedule](https://nodejs.org/en/about/previous-releases)

Use native asynchronous HTTP/filesystem facilities for upstream calls and caching. Keep eBird aggregation independent of Express so it can be tested with fixed clocks and fixture data. Use a small compatibility parser for existing query semantics rather than applying stricter schema coercions that would change requests accepted today. Express 5 defaults to simple query parsing, so bracketed hotspot arrays require deliberate handling. [Express 5 migration guide](https://expressjs.com/en/guide/migrating-5/)

Proposed implementation layout:

```text
server/
  index.ts                 # listen, signals, startup configuration
  app.ts                   # application factory, middleware and route mounting
  config.ts                # existing JSON configuration and environment overrides
  contracts.ts             # shared response types and injectable dependencies
  http/                    # CORS, legacy query parsing and response helpers
  ebird/                   # upstream client, disk cache, time parsing, aggregation
  routes/                  # birdnet-compatible dispatcher, wiki, cutout, menu
  images/                  # resolver, optional rembg adapter, PNG postprocessing
tests/
  fixtures/                # synthetic upstream data and captured baseline outputs
  ebird/                   # data transformation and eBird service tests
  auxiliary/               # image, wiki and menu tests
  contract/                # independent HTTP compatibility tests
  browser/                 # unchanged frontend against the replacement backend
scripts/                   # local startup and verification helpers as needed
avian/frontend/            # existing frontend, unchanged
avian/assets/              # existing artwork, unchanged
avian/scripts/             # existing independent Python tooling
```

Expose an application factory that accepts a clock, HTTP transport, cache paths, and image-processing adapter for tests. Production upstream hosts remain fixed; test injection must not become a public URL parameter. Keep credentials server-side. Serve explicitly selected public directories rather than exposing the whole repository or `avian/data`.

Use a single test runner selected by the lead, with HTTP integration tests and Playwright browser tests. A suitable baseline is Vitest, Supertest, and Playwright. The auxiliary API implementation may use Sharp for the small PNG crop/resize operation currently done with PHP GD; the lead owns the dependency decision and lockfile. Mandatory runtime dependencies should remain limited to functions this server actually uses.

**Ownership and coordination.** At most three subagents work alongside the lead. Assign disjoint files; agents report requested shared-interface changes to the lead rather than editing each other's work. Every task must report changed files, behavior implemented, checks run, and remaining gaps. The lead maintains a coverage ledger linking each requirement below to its owner and passing test evidence.

| Owner | Responsibility and file scope | Required handoff |
| --- | --- | --- |
| Lead engineer | Shared architecture, `server/app.ts`, `index.ts`, `config.ts`, `contracts.ts`, `server/http/`, package/TypeScript/test configuration; final integration and source removal | Stable dependency interfaces, reviewed query/time/response conventions, integration report, release decision |
| Agent A: eBird API | `server/ebird/`, birdnet-compatible route, `tests/ebird/` | All four actions, aggregation, request validation, upstream errors, cache compatibility, focused tests |
| Agent B: auxiliary APIs and images | Wiki/cutout/menu route modules, `server/images/`, `tests/auxiliary/` | Image resolution and optional generation, Wikipedia behavior, menu methods, focused tests |
| Agent C: independent parity verification | `tests/fixtures/`, `tests/contract/`, `tests/browser/`, parity reports | Baseline responses, independent HTTP comparisons, returning-user/browser checks, regression report |
| Agent A, reassigned after its API handoff | `Dockerfile`, `fly.toml`, `serve.sh`, ignore files, deployment documentation and packaging scripts | Node-only image, local launcher, both hosting layouts, candidate deployment/rollback instructions |

The lead owns shared files throughout; there are no concurrent lockfile edits. Agent C must not replace failing expected outputs with new server output merely to make tests pass. After implementation, Agent B reviews Agent A's API changes, Agent A reviews Agent B's handlers, and the lead reviews all shared code and deployment changes. Agent C remains independent of the implementation it verifies.

**Execution sequence and gates.** Implementation is organized around demonstrated behavior, with PHP deletion occurring only after the replacement is verified.

| Stage | Work | Dependencies and completion gate |
| --- | --- | --- |
| 0. Capture reference behavior | Record baseline commit, public file hashes, supported configuration, runtime timezone and HTTP responses. Prepare deterministic upstream fixtures and an isolated legacy reference environment. | No migration code yet. Lead accepts baseline evidence and enumerates unresolved behavior. |
| 1. Establish server foundation | Lead creates Node/TypeScript/Express scaffolding, shared interfaces, configuration loading, CORS, query normalization and static mapping. Agent C establishes the independent test harness. | Contracts are stable enough for agents to implement against; reference responses are available. |
| 2. Implement in parallel | Agent A ports eBird behavior; Agent B ports auxiliary handlers; Agent C builds and runs parity tests against the agreed contracts. | Each feature has implementation plus independent acceptance evidence. Shared changes go through the lead. |
| 3. Integrate and package | Lead integrates services. Agent A moves to deployment/local tooling. Agent B performs cross-review. Agent C exercises real Express routes from the unchanged browser app. | Same-origin and separate-origin checks pass; runtime and optional image-processing cases are covered. |
| 4. Remove PHP and verify final artifact | Lead deletes the five PHP files, removes PHP/Apache build/run instructions and temporary oracle requirements, and validates the final Node-only image and test suite. | Full checks pass from a clean checkout with no PHP installed; no PHP source or interpreter ships. |
| 5. Prepare and execute release | Prepare candidate deployment, smoke results, immutable rollback reference and production cutover procedure. Execute production cutover only under a release instruction. | Candidate meets every release criterion; production verification and rollback checks are recorded. |

The five implementation files to delete at Stage 4 are `avian/api/birdnet-api.php`, `bootstrap.php`, `cutout.php`, `wiki.php`, and `menu.php`. PHP-named compatibility URLs are deliberately retained as strings. Historical Git commits and a previous release image used for emergency rollback are separate from the new application artifact.

**eBird contract coverage.** Agent A owns this behavior; Agent C independently verifies it.

| Contract | Behavior to preserve |
| --- | --- |
| Configuration | Defaults: latitude `40.794618`, longitude `-73.959878`, radius `3`, hotspot-only upstream flag `true`, lookback `30`, empty token. Merge existing `avian/data/ebird.json`. Nonempty `EBIRD_API_KEY` overrides its token. Existing local files must continue working without conversion. |
| Request defaults | Missing action means `dashboard`. Only exact `mode=hotspot` selects hotspot mode. Numeric coordinate overrides clamp to latitude ±90 / longitude ±180; general radius clamps to 1–50 km. Preserve per-parameter integer conversion and invalid-input behavior. |
| Hotspot selections | Accept a scalar `regionCode` and existing `regionCode[]=...` requests. Characterize indexed and repeated parameters. Trim/validate IDs, deduplicate in input order, permit ten unique IDs, reject invalid/empty values and more than ten. Require a selection in hotspot mode except for discovery and nearby-species actions. |
| Geographic upstream request | Request `/v2/data/obs/geo/recent` with coordinates, radius, `sort=date`, configured hotspot flag, and configured lookback clamped to 1–30 days. Dashboard query `back` does not override the configured lookback. |
| Hotspot upstream request | Make one `/v2/data/obs/US/recent` call with a comma-separated `r` list and configured lookback. Preserve batch semantics; do not replace this with one request per selected hotspot. |
| Discovery upstream request | Use `/v2/ref/hotspot/geo` with coordinates, radius and `fmt=json`. Discovery is independent of selected source mode. Return upstream hotspot records unchanged, without dropping fields or normalizing their values. |
| Dashboard | Preserve nested `recent`, `timeseries`, top-level `as_of`, and `source: "ebird"`. Default hours 24, accepted range 1–1,000,000, actual recent filtering capped at 720 hours. Default timeseries days 30, accepted range 1–90. Return the clamped requested hours/days even when fewer days of source data exist. |
| Species aggregation | Preserve scientific/common names, speciesCode, `n`, first/last observation, last location, `top_at`, and legacy null fields `best_conf`/`top_file`. Sum normalized counts from returned rows, preserve sorting and stable ties. Missing/null counts become one; provided counts are integer-converted with a minimum of one. |
| Hotspot aggregation | Preserve `locId`, `locName`, numeric/null coordinates, count, latest report, species rows and `distance_km`. Group by ID or fallback name; calculate Haversine distance with radius 6371.0088 km; sort nearest first, missing coordinates last, then newest report. Sort nested species by count then report time. |
| Timeseries | Filter the source rows independently by days. Sum counts and count unique species per day; keep ascending dates and only populated hour buckets. Preserve original date strings and the current distinction between trimmed aggregation names and raw timeseries species keys. |
| Species detail | Exact scientific-name matching; no added trimming/case normalization. Use all fetched rows, independent of selected hours. Return `summary` or null and at most 500 newest observation rows. Summary totals include all matches. Preserve observation `d`, `t`, null `file`/`conf`, `howMany`, and `locName`; observation counts here are not minimum-one clamped. |
| Nearby species | Geographic lookup even when the main UI uses hotspots. Validate trimmed speciesCode; defaults back=7, dist=25, maxResults=100; clamp to 1–30, 1–50 and 1–10000 respectively. Pass hotspot=true. Slice before normalization/sorting as today. Preserve nullable count and response fields. No server disk cache; `Cache-Control: no-store` after code validation. |
| HTTP failures | Preserve 400 validation, 404 unknown action, 502 upstream failure and 503 missing token, including existing error text and JSON shape. Upstream failures include numeric `status` where currently present, with zero for transport failure. Preserve validation/fetch ordering that changes which error wins. |

Public JSON comparison includes field presence, null versus omitted fields, numeric versus string types, array order, error messages, and timestamp format. Whitespace and object key order need not match. Every response's source/as_of presence must match its endpoint: discovery has no source field, species detail has no as_of field, and dashboard uses the same timestamp in all three positions. Floating-point distance differences require a justified tolerance and must not change displayed values or ordering.

Recent-observation data is not a complete observation history. Preserve the current rows and aggregation exactly; this migration must not reinterpret displayed counts, collect historical totals, change the eBird endpoints, or attempt to correct help-text/data discrepancies.

**Caching, timing, and failure behavior.** Preserve the 60-second disk-cache lifetime for observation and discovery responses, with freshness defined by age strictly less than 60 seconds. Preserve the `{fetched_at, obs}` and `{fetched_at, hotspots}` formats, location/mode cache isolation, and batch cache identity based on the ordered hotspot list and configured lookback.

Keep existing cache filenames readable through a characterized legacy key implementation or an explicit compatibility lookup. Test PHP JSON number encoding and five-decimal coordinate rounding before assuming JavaScript generates the same MD5 key. Existing files must remain usable for stale fallback after an upgrade. Do not clear caches on startup or change them to memory-only storage.

`refresh=1` bypasses fresh cache reads but still permits stale fallback. Transport errors and upstream HTTP errors use available stale observation/discovery data with no existing stale-age limit; invalid JSON from a successful upstream response currently fails instead. Preserve this distinction. Without usable stale data, return the existing error rather than partial success. Cache write failures must not turn an otherwise successful upstream response into a failed dashboard. Use atomic writes for the replacement cache to avoid partially written files under concurrency.

Preserve eBird's 20-second request timeout and the API's normal 30-second public HTTP cache header. Verify timeout behavior with controlled slow responses, including stalled reads. Preserve upstream request headers and avoid logging tokens. Returning stale data still produces the current response time in `as_of`, as the existing code does.

Capture the reference PHP runtime timezone before choosing Node's explicit timezone configuration. eBird `obsDt` lacks a timezone; the current server interprets it in its own timezone. Do not silently switch to the observer's or browser's timezone. Cover date-only values, exact window boundaries, DST transitions, malformed dates, and future observations. Match `date('c')` formatting, including the offset and absence of fractional seconds, instead of blindly using `toISOString()`.

**Auxiliary endpoint and image coverage.** Agent B owns these handlers; Agent C verifies their public contracts.

| Contract | Behavior to preserve |
| --- | --- |
| Shared CORS | `AV_CORS_ORIGIN` or `*`; current advertised methods `GET, OPTIONS` and allowed header `Content-Type`. OPTIONS returns 204 before token checks. Apply headers to successful and failing API responses. Verify actual GET/HEAD behavior and the existing POST flow. |
| Menu | HTTP 200 with `{ "items": [] }`, JSON UTF-8 and `no-store`. Preserve GET and POST, including the frontend's Authorization header flow when an external same-origin reverse proxy supplies Basic Auth. Do not invent application authentication from historical comments. |
| Wiki validation | Trim scientific name and apply the existing name regex. Missing/invalid names return 400 with the existing JSON error. Preserve public max-age=86400, including fallback/validation responses. |
| Wiki lookup | Existing Wikipedia REST summary request, eight-second timeout, and `AV_USER_AGENT` override/default. Keep Wikipedia/Wikimedia host validation for returned thumbnails. |
| Wiki fallback | Network failure/invalid JSON returns HTTP 200 with exactly `extract:null` and `thumbnail:null`. Parsed success includes `title` as well, even when null. Preserve that field-presence distinction. |
| Image validation | Same scientific-name validation; 400 text response on missing/invalid name. Pose defaults to one and falls back to one outside 1–99 after integer conversion. Keep ignored `com` and version query parameters compatible. |
| Image lookup | Requested illustration pose → pose-one illustration → bundled photo cutout → previously generated cutout → optional on-demand generation. Existing-file threshold is greater than 1024 bytes. |
| Image responses | GET and HEAD agree on status and selected resource; HEAD has no body. Success uses PNG MIME, byte content length and public max-age=86400. Bundled and cached hits return the same bytes. A missing image remains 404, not a 200 placeholder. |
| Optional generation | If `/usr/local/bin/rembg-cli` is executable, fetch Wikipedia summary/photo, use the current `u2netp` model and `-ppm` option, crop transparent bounds, downscale to at most 800 pixels on the longest edge, preserve alpha, and atomically cache. Retain the 12-second Wikipedia/photo request timeouts. |
| Generation failures | Preserve 404 when renderer/photo is unavailable, 503 on photo download failure/undersized data, and 500 on renderer failure. Maintain the established response bodies where observable. Clean temporary files and use process argument arrays instead of shell interpolation. |

Preserve default renderer availability: the existing Fly Dockerfile does not install rembg, so the replacement must not suddenly generate new artwork there. However, enabled-renderer deployments are part of current supported functionality and must still work. Keep this optional path separate from the offline BiRefNet artwork pipeline. Provide a documented opt-in installation recipe and verify it in an equipped environment; fake-process tests alone cannot establish real renderer integration.

Image fixtures must cover the current size-boundary asymmetry: existing-file hits require more than 1024 bytes, whereas downloaded photos and renderer output pass at exactly 1024 bytes. Match transparent-alpha crop bounds and integer-truncated resize dimensions; test fully transparent input and images already below the maximum size. A replacement library's default trim or rounding must not silently change geometry or upscale images.

The dynamic image cache currently resolves to `BirdSongs/Extracted/cutouts` under the repository's parent, and to `/var/www/BirdSongs/Extracted/cutouts` in the existing image. Preserve lookup of existing generated files. If moving writes to a configured application cache directory, add a non-destructive legacy lookup/import and retain prior files. Generate temporary output on the destination filesystem so rename is atomic. For newly generated images, compare dimensions, transparent bounds, alpha preservation, and decoded visual output against reference fixtures; different PNG encoders need not produce identical compressed bytes. Material visual differences block acceptance.

Preserve current CORS behavior rather than widening it incidentally. Cross-origin authenticated POST with Authorization is already limited by the advertised preflight headers; record that limitation separately. Same-origin reverse-proxy authentication must continue to work. PHP accepts non-OPTIONS methods more broadly than its CORS header suggests: characterize that dispatcher behavior and preserve it on compatibility routes instead of casually returning 405.

**Frontend and returning-visitor verification.** The frontend is the integration client and remains unchanged. Agent C owns automated/browser evidence for each row below.

| Area | Required scenarios |
| --- | --- |
| Collage | Populated and empty states, count-based sizing, both poses, silhouette hover/click, resize, loading state, and missing-artwork handling with identical masks/images |
| Stats | Graph values and ordering, desktop species subset versus mobile scrolling, top-ten species, hotspot grouping/distances/order, cross-highlighting and links to atlas |
| Atlas | Count/recent/alphabetical sorts, empty state, cards, modal details/rarity/description, pose selection, missing images, Wikipedia/eBird links |
| Nearby reports | Initial load, reopening cached data, geographic scope in hotspot mode, manual refresh, null counts, ordering, and preserving displayed data when refresh fails |
| Time windows | Default 24h, 7d/14d/30d presets, custom 1–30 days, old saved unlimited-window migration, exact cutoff behavior |
| Location | Default NYC/radius, coordinate edits, permitted geolocation and denial, radius changes, discovery/search, selection/deselection/clear, ten selections and rejected eleventh |
| Preferences | Same-origin persistence for `bird:theme`, `bird:window`, `bird:atlasSort`, `bird:lat`, `bird:lng`, `bird:dist`, `bird:sourceMode`, `bird:hotspots`, `bird:refreshMs`; old `bird:regionCode`/`bird:regionName` migration |
| Navigation | `#sci=...` and `#about` bookmarks, reload, modal open/close, back/forward history |
| Refresh | 1m/5m/15m/1h options, five-minute default, manual refresh, countdown, hidden-tab pause/resume, overlapping window requests, loader accounting |
| Hosting | Same-origin local/container app; separate frontend/API origins through AV_API_BASE; already-open pre-migration tab and old cached frontend bundle against Express |
| Presentation | Desktop and mobile viewports; both themes; Chromium, Firefox and WebKit smoke checks; existing keyboard/modal controls |

The existing one-second frontend test delay, browser memory-cache keys, and known location/pose request races are baseline behavior. Do not remove or redesign them during a backend migration. Record existing failures separately and compare the new backend under the same conditions. Audio/spectrogram code and `recording.php` references are inside a removed-code block comment; there is no active recording endpoint to port. Historical comments about Cloudflare workers, JIT Gemini routes, Caddy, and Pi detection do not establish additional active features.

**Local development, packaging, and hosting.** Agent A owns these files after its API implementation handoff; the lead signs off on the final runtime.

- Keep `./serve.sh`, `PORT`, and the default `http://localhost:8080/` entry point. Replace its PHP invocation with the Node development command. Preserve existing config-file support and first-run setup without overwriting configured files or exposing tokens in logs.
- Provide documented `npm ci`, development, build, start, typecheck and test commands, with matching scripts and a lockfile. Ignore build output, dependency directories, test reports, and runtime caches appropriately.
- Explicitly serve `index.html`, `apt.js`, `config.js`, `styles.css`, `dims.json`, `masks.json`, `nest.webp`, root favicon, and `/avian/assets/...`. Retain intended `/avian/frontend/...` public paths where used. Do not expose JSON configuration, cache contents, server source, or private working files.
- Package the relative loading-animation assets on the frontend origin for the GitHub Pages option. Publishing only `avian/frontend/` as currently described omits these assets. Correct packaging/documentation while preserving the frontend URLs.
- Build a multi-stage Node-only container with production dependencies, compiled server code, public assets, and correctly owned writable cache directories. Run as a non-root user on an unprivileged port, proposed 8080; change Fly's `internal_port` in the same task. Container binding is `0.0.0.0`; local launcher binding remains localhost.
- Preserve the existing Fly application hostname, `ewr` region, HTTPS behavior, auto-stop/start, minimum zero machines, and 512 MB allocation. Preserve GET `/` health checking and verify it serves the frontend. Support graceful termination and cleanup of in-flight optional renderer subprocesses.
- Do not introduce a persistent database, volume, Redis, or hosting-provider move as an incidental migration step. Existing caches are disposable on machine replacement because no volume is configured; verify cold start, warm cache, restart, and an unavailable-upstream cold start.
- Update root README and runtime instructions to reflect Express, preserving the independent Python artwork instructions. Never copy local credentials, generated observations, or reference images into the image or tests.

**How parity will be established.** Agent C creates deterministic reference cases before PHP deletion. Reference tests run the baseline commit in an isolated legacy environment, using synthetic upstream fixtures and controlled time. A test-only transport/clock adapter or isolated network fixture service may be needed for the hardcoded upstream URLs; any adaptation is reviewed by the lead to ensure only I/O and time are replaced, never business logic. Record fixture provenance, timezone, and capture method.

Keep the temporary legacy runtime outside the new application's final artifact. Store sanitized expected responses and test data, not PHP source, in the final repository. The continuing test suite runs solely against Express and these fixtures, without requiring PHP, external API credentials, live eBird/Wikipedia access, or Gemini calls. A small controlled live integration smoke check supplements deterministic tests before release.

The test suite must include:

1. HTTP comparisons for every action, method, success/failure branch, status, relevant header, response field and ordering rule above. Compare business headers; incidental Apache/Express server-identification headers need not be reproduced.
2. Query compatibility cases: absent/empty/scalar/bracketed/repeated inputs, duplicate IDs, boundaries, invalid values, integer conversion, and exact `refresh=1` handling. Include error precedence such as missing token before validation and unknown action after observation fetching.
3. Data fixtures: empty rows, missing counts, zero/negative counts, missing names/coordinates, equal timestamps/counts, multiple hotspots, more than 500 species-detail rows, nearby truncation, date-only data, and window boundaries. Characterize syntactically valid upstream JSON with unexpected shapes (objects, scalars, and non-record rows): PHP associative decoding and TypeScript array validation differ, so these must not accidentally be conflated with invalid JSON. Preserve supported baseline behavior and document any deliberately different malformed-input handling for review.
4. Cache cases: fresh hit with no upstream call, exact TTL expiry, forced refresh, stale-on-failure, malformed cached JSON, invalid successful upstream JSON, write failure, old cache file reuse, restart and concurrent requests. No response may mix source modes or locations.
5. Auxiliary cases: all image lookup stages; requested-pose fallback; every error code; HEAD agreement; allowed/disallowed Wikipedia hosts; wiki fallback field presence; menu GET/POST; OPTIONS without credentials. Test renderer subprocess errors and real crop/resize fixtures, then an enabled-renderer integration run.
6. Browser checks from the feature matrix. Freeze clock/randomness or compare stable rendered properties so random pose/layout choices do not produce misleading visual diffs. Exercise actual Express endpoints with fixture upstreams rather than mocking all browser API responses.
7. Final-image smoke: startup, root/assets, representative endpoints, CORS, writable caches, shutdown, port configuration, and absence of PHP/Apache runtime. Verify source/config/cache URLs are not served.

Do not require fresh upstream data to equal historical data in live tests; fixture comparison establishes content parity. The lead accepts captured baseline outputs before implementation can redefine them. Any uncovered branch remains an explicit gap rather than being reported as complete.

**Release and rollback.** Once the migration is implemented and verified locally, prepare a separate candidate deployment using the production configuration shape and server-side secret management. Avoid publishing credentials or changing the existing frontend origin. Confirm unchanged clients can call the candidate API, including image HEAD requests and multi-hotspot queries. Verify the real deployed timezone and renderer availability against Stage 0 assumptions.

Before a production cutover, record the previous immutable deployment image, non-secret configuration, and cache compatibility assumptions. The existing frontend continues to address the same hostname and paths during the backend replacement. After cutover, check root/assets, all API actions, image responses, settings unlock, error rates, request latency, memory, upstream call volume, and cold starts. Run at least one configured refresh cycle and a manual refresh with the unchanged client.

Rollback if valid baseline requests fail, data/images differ materially, settings become inaccessible, CORS blocks the existing frontend, or the new service fails health/resource checks. Restore the previous immutable deployment and configuration; do not require a frontend redeployment, cache deletion, or credential rotation. The legacy rollback artifact is retained outside the new application while release verification completes. Declare the deployed migration complete only after the Express release passes these checks.

**Definition of done.** The lead must be able to attach evidence to every item:

- All active endpoint/action and UI requirements above are mapped to implementation and passing tests, with no unexplained parity failures.
- Existing frontend and bundled artwork hashes match the baseline; returning visitors retain their origin, settings, navigation and behavior.
- Both hosting arrangements, GET/HEAD image behavior, POST menu behavior, disk caching, and optional renderer support are verified.
- The final source tree contains no PHP source files; production image contains no PHP interpreter/Apache dependency; local startup, build, tests and deployment need no PHP.
- Existing `.php` URL names resolve directly through Express without redirects that could affect methods, cache behavior, or old clients.
- Typecheck, service/HTTP tests, browser checks and container smoke pass on the final integrated artifact; optional feature verification is recorded explicitly.
- Node runtime and packages are pinned, installation is reproducible, deployment docs are accurate, and rollout/rollback instructions are reviewable.
- The lead has reviewed subagent work, completed the coverage ledger, and separated any pre-existing issues from migration regressions.

**Current status and implementation prerequisites.** All three reviewing subagents accepted this document for their respective areas; their additional fixture requirements are incorporated above. No application code has been migrated, no dependencies installed, and no live deployment tested. PHP, Node, npm, and Docker were not available on the planning shell's PATH. Stage 0/1 must provide an appropriate isolated reference runtime and Node test/build environment before execution claims can be made. The actual deployed timezone, HTTP edge behavior, and any separately enabled rembg/cache configuration must be confirmed through permitted read-only inspection or the reference environment; these are evidence gates for implementation, not reasons to change user-facing behavior.
