# Additional browser acceptance — 2026-10-21

Follow-up on PR #9, proceeding from simple functional assertions to visual, permission and open-client integration. No application/frontend/artwork code, production configuration or deployment was changed. New checks live in `tests/browser/remaining-features.spec.ts` and exercise real Express routes with synthetic upstream transport. Independent expected response data remains the PHP-captured `dashboard-mixed.json`.

## Added functional checks

- Custom windows: zero/negative input clamps to one day, 1/30-day boundaries work,31 clamps to30,2.9 truncates to2, blank input restores previous selection without a request, focused-input Escape closes, and custom48h survives reload.
- Stats: exact top-species counts4/2/1, chronological graph order, quantity ticks0–4 and encoded positions, hotspot order/rows, <0.1/23.1km and missing-distance labels. Pointer hover synchronizes graph/list highlighting; clicking opens the matching atlas modal.
- Larger data:40 synthetic species verify the top ten40…31, desktop truncation to the available graph width and chronological order, then all40 mobile columns with horizontal overflow.
- Collage: crow area exceeds chickadee, which exceeds robin, matching4/2/1 counts. Real mouse movement finds the crow silhouette, shows its name/count4, and clicking opens the crow modal.
- Native browser API permission grant: Chromium, Firefox and WebKit use their actual geolocation implementation with browser-granted permission and provider coordinates; saved coordinates and UI are asserted. No navigator override in this check. Chromium additionally denies permission through Browser.setPermission and verifies error/unchanged location. Explicit denial remains skipped in Firefox/WebKit; native macOS permission dialogs are not exercised.
- Controlled Basic Auth proxy: a real HTTP wrapper returns401 for absent/wrong Authorization, then forwards the correct menuPOST to Express. The unchanged client submits both passwords, displays the wrong-password error and unlocks on success. The test switches the page's existing body mode from av-local to av-forwarded, as described by baseline CSS; it does not edit a source file or claim to inspect the deployed proxy.

## Visual comparisons and handover

At1280×900 and390×844 in light/dark themes, each engine renders the independent PHP golden dashboard response and the actual replacement response. Browser date/randomness are fixed; the reference dashboard is replayed only on the oracle side. All candidate API requests execute replacement Express handlers. Each of the collage, stats and atlas views is compared by decoded RGBA bytes with zero pixel tolerance.

Cold renders use separate fresh browser contexts. Refreshed renders compare a reference refresh against an Express refresh in the same original document. A marker and unchanged URL prove this handover does not reload the client. Each visual scenario checks six image comparisons: three cold and three refreshed. Twelve engine/viewport/theme scenarios therefore supply72 screenshot-pair comparisons. PNG screenshots and visual-comparison.json are written under ignored test-results directories for inspection.

An initial cold-reference versus refreshed-candidate comparison caught mobile Chromium atlas image-layout differences. The same cold-to-refreshed difference reproduces with only the PHP golden response, before any candidate handover. It is an existing lazy/cached-image rendering distinction. Tests now compare cold with cold and refreshed with refreshed; they do not relax pixel tolerance or alter the frontend. The per-scenario JSON retains the oracle cold/refresh changed-pixel count so the distinction remains visible.

## Actual production-loaded client

`AV_LIVE_CLIENT=1` enables an opt-in read-only browser test. It first loads the existing production page normally. Only afterward, browser request routing relays that page's API calls to the local replacement. Manual refresh produces expected fixture counts; species modal/wiki data and saved dark theme still work. A document marker and script-resource count prove apt.js is not reloaded. Browser origin stays the production origin. This tests an actually open production-loaded client while production itself remains unchanged; it is not a remote candidate deployment or an authenticated live replacement eBird call.

Separate read-only downloads confirmed the deployed HTML/JS/CSS exactly match the repository baseline:

| File | Production SHA256, matching baseline |
| --- | --- |
| apt.js | 11b928cb44f4bf6e3a5fa723082fa7cb6d839632218777cf06d3633f139835ee |
| index.html | 83963203b526917d88738e626d644a8b40a3297ec5e82e7514a872e109ec5b78 |
| styles.css | abe06238c4998daa07065d7575f3fae52af6356b77e00871bf5a9446f83e96c4 |

## Remaining external gates

Actual macOS geolocation permission dialogs, native background-tab timer throttling and exhaustive interaction/visual combinations remain unexecuted. Headless Chromium/Firefox/WebKit reported document.hidden=false even after opening/foregrounding another page; Chromium minimization also left it false. Existing synthetic visibility-event tests cover application pause/catch-up logic, but those probes cannot establish OS window scheduling behavior.

No Fly CLI/authentication, Fly token, local eBird token/configuration or environment eBird key was available. Thus real replacement eBird upstream access, actual proxy/renderer/platform configuration, previous immutable image availability and a remotely deployed candidate remain release gates. No credentials were printed or committed. Public reads and browser-only interception changed no production resource.

## Final executed result

`PATH=/private/tmp/node-v24.22.1-darwin-arm64/bin:$PATH npm run typecheck`: passed.

`AV_LIVE_CLIENT=1 npm run test:browser`: **70 passed,2 explicitly skipped, zero failures (2.0m)**. All36 prior browser checks pass plus34 added checks. Skips are explicit browser-level denial in Firefox/WebKit; Chromium denial passes, and prior deterministic denial callbacks still cover all three engines. All72 screenshot-pair comparisons pass with zero changed pixels in equivalent cold/refreshed states. `visual-comparisons.json` records the final run; the measured oracle cold/refresh atlas difference is19026 pixels in mobile Chromium light mode and18517 in dark mode.

The default browser command omits live production reads unless AV_LIVE_CLIENT=1 is set; those three opt-in cases then skip. Early test-authoring failures involved selectors/focus, drawer-close targeting, unequal cold/refresh image state and an overly strict proxy attempt count. WebKit natively repeats some401 challenges; the final assertion checks the required unauthorized GET → unauthorized POST → authorized POST phases while allowing consecutive challenge retries. The final combined run supersedes those harness failures. No product code was changed to make the checks pass.

Original migration-plan SHA256 remains3a8726eab6d62f8d0486a88aa96f76211faad7f3fa2ef15ad3b14a06e9f1924c; all845 public hashes were independently rechecked and match.
