# Independent unchanged-client browser acceptance

Executed 2026-10-21 using pinned Playwright 1.64.1, Node 24.22.1 and installed Chromium, Firefox, WebKit. Scope: `tests/browser/returning-visitors.spec.ts`. No frontend/artwork or expected PHP captures changed.

The harness serves the real Express application and unchanged public files on ephemeral localhost ports. HTTP transport supplies synthetic upstream observations/Wikipedia/discovery; browser API endpoints are real Express requests. The overlap test gates and later releases an unchanged response fetched from Express; it never substitutes a fixture response for the route. A second origin exercises `AV_API_BASE`. Server clock is fixed to 2026-10-21T12:00:00Z and layout randomness fixed. Geolocation is deliberately supplied as deterministic success/permission-denied callbacks through the browser API, rather than an OS permission-dialog test.

Intermediate full run: `npm run test:browser`, **27 passed (27.1s)** across three engines. Additional targeted runs: unlimited-window/pose/resize/automatic-refresh **6/6 passed (7.8s)**; overlapping-window responses **3/3 passed (6.5s)**. Final full serial run: **36/36 passed (39.9s)**. `npm run typecheck` also passed. One earlier concurrent invocation collided in Playwright’s shared output directory (ENOENT during trace cleanup); the final serial run supersedes that tooling failure.

| Scenario | Assertions |
| --- | --- |
| Returning visitor | Populated collage, stats/hotspot content, three atlas cards, modal/wiki/eBird links and description, nearby null-count fixture, Escape, dark theme, saved atlas ordering/refresh interval after reload |
| Hosting/bookmarks | Separate real API origin through config.js, old single-hotspot migration, hotspot batch upstream request, nearby geographic lookup despite hotspot mode, scientific-name/about bookmarks |
| Mobile | 390×844 viewport, custom seven-day window, nearby data preserved and error displayed after refresh failure |
| Window/refresh controls | All 24h/7d/14d/30d presets save their hours; all 1m/5m/15m/1h preferences save milliseconds; countdown present; manual refresh triggers upstream and reenables button |
| Location | Geolocation success saves six-decimal coordinates; denial retains coordinates and reenables control; radius edit persists |
| Discovery/preferences | Real discovery endpoint, search/select/deselect/clear, exact saved hotspot object shape, search empty result |
| Empty observations | Fresh unique coordinate cache key, empty atlas and stats message, loader dismissed |
| Selection cap | Ten selections, eleventh marked disabled and cannot increase selection count, ten selections retained after reload |
| Navigation/artwork | Back/forward restores hash modal state; nonexistent scientific name returns unavailable artwork and retains description/working dismissal |
| Old window/resize/poses | Saved 1000000-hour unlimited selection migrates and saves 720 hours; collage remains populated after narrow then desktop resize; both real crow poses become available, select and load decoded images |
| Automatic refresh | Playwright clock advances 1m and observes a dashboard request; synthetic document.hidden/visibilitychange pauses requests for 2m and triggers immediate catch-up on return; loader settles |
| Overlapping requests | Delay a real Express 168h response while selecting 24h; release older response and assert crow count remains 4 (rather than the 168h total 5), selected window stays 24h, loader settles |

Remaining gaps: pixel/screenshot parity, full count-based collage geometry/silhouette hover/click, all graph values/top-ten/cross-highlights, native background-tab scheduling beyond the synthetic visibility event, full custom-window boundaries, native OS geolocation permission UI, an actual already-open production/PHP tab and cached old bundle, desktop/mobile both themes across every control. No live production or renderer is exercised by these tests. Existing frontend one-second request delay remains untouched. API fixture/contract and focused tests supply separate evidence; this report does not infer browser coverage from them.
