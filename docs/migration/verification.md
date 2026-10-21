# Implementation verification report — 2026-10-21

Status: local backend migration verified; remote release acceptance pending. No production deployment, registry push, remote candidate, secret modification or rollback executed. Baseline `ef9ea289821051d85078d7d1bc94a8c0ce255a28`. Original migration plan unchanged; frontend/artwork unchanged.

## Final integrated evidence

| Check | Executed result |
| --- | --- |
| Node | Official 24.22.1 darwin-arm64 runtime, verified download checksum in checkpoint |
| Typecheck/build | `npm run typecheck`, `npm run build` passed after PHP removal |
| Offline service/HTTP/hash suite | 114 passed / 1 optional renderer skipped after PHP removal, including added HEAD/all-method/CORS check |
| Independent baseline contracts | 57 unchanged PHP response captures + 845-file hash assertion pass within suite |
| Browser | Latest combined run:70 passed,2 explicit browser-denial skips (2.0m); includes all36 original checks,34 added checks and72 exact screenshot comparisons |
| Optional equipped renderer | Real rembg 2.0.86/u2netp/-ppm HTTP→subprocess→PNG→atomic cache passed separately; lead independent final rerun 1/1 passed (2.63s) |
| GD PNG parity | 14 independent PHP GD fixtures match decoded geometry/pixels exactly; palette/tRNS regression found and fixed |
| Subprocess cleanup | Actual in-flight child PID terminated through production shutdown export; request finishes and temporary files removed |
| Clean Linux install | Fresh node:24.22.1-bookworm-slim container, selected PHP-free source/tests/public assets only, npm ci/typecheck/build: pass; 114 passed / 1 optional skipped |
| Final runtime build | `docker build -t avianvisitors:candidate .` passed from PHP-free tree |
| Container smoke | `node scripts/verify-container.mjs sha256:e97410a339572e21f502a83b7d068c0656fe4f9016d480da96f8260bf7bd0937`: 38 checks passed after PHP removal |
| Docker healthcheck | Final image reached Docker healthy state; disposable container stopped and removed |
| Active-response shutdown | `node scripts/verify-shutdown.mjs` with same immutable local image: PASS while HTTP200 image response paused; entrypoint exits0 |
| Static packaging | package-static.mjs to empty /private/tmp output; all845 public hashes matched; no PHP/TS/config/package manifest exposed |
| Launcher | Two starts using isolated AV_DATA_DIR/port: localhost root200, first-run example config, second-run hash retained, environment secret absent from file/logs, SIGTERM exit0 |
| Privacy/source removal | No *.php source remains; public/source/cache/dotfile URLs404; image has no PHP/Apache or private ebird.json |
| Formatting/preservation | git diff --check passes; original plan SHA256 3a8726eab6d62f8d0486a88aa96f76211faad7f3fa2ef15ad3b14a06e9f1924c |

Container checks use the real compiled production entrypoint, selected static assets, real filesystem and network-disabled cold upstream failure. A second disposable container injects only synthetic transport/clock into compiled createApp to verify all four actions, aggregation, warm disk cache and process restart. Test fixture bootstrap is copied into that disposable container; it is absent from the production image. Final image is **linux/arm64**, local ID `sha256:e97410a339572e21f502a83b7d068c0656fe4f9016d480da96f8260bf7bd0937`, approximately595MB uncompressed. This ID is not an immutable registry deployment digest. Node base pull resolved manifest `sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205`; package/Node versions pinned. Match the production machine platform and record the accepted registry digest before release.

## Live read-only supplements

Public existing production root returned200. OPTIONS birdnet returned204 with `*`, `GET, OPTIONS`, `Content-Type`; header identified PHP8.3.32. Discovery returned122 records and `as_of=2026-10-21T23:32:02+00:00`, supporting UTC compatibility. No production configuration was changed or secret read. Replacement compiled Express wiki route called actual Wikipedia and returned200 with string extract/title and a thumb.wikimedia.org thumbnail. These observations supplement fixtures; they do not establish every deployed runtime setting or authenticated live replacement eBird observation behavior.

## Review and limits

Lead read all handoffs, reviewed shared config/query/transport/app/index and packaging, inspected added cache/browser/renderer tests and PNG fix, independently reran integration. Test expectations remain PHP-derived. PHP deletion occurred only after independent contracts, image fixtures, browser evidence and rebuilt-container replacement checks; five deleted files were birdnet-api.php, bootstrap.php, cutout.php, wiki.php and menu.php. Compatibility URL strings remain direct Express routes.

coverage.md and additional-acceptance.md enumerate the remaining OS/remote gates; the follow-up closes the scoped visual/functional/open-client gaps. The optional renderer remains omitted from default production image as before; actual deployed renderer/proxy configuration remains unknown. Arbitrary PHP natural-language date grammar is broader than the captured eBird calendar formats. No unexplained failure is hidden as a pass. A focused/full Playwright collision produced artifact-directory ENOENT during agent development; the final serial run passed and is the recorded result.

rollout-rollback.md, rollback.fly.toml and release-record.json prepare the release. Authenticated previous digest availability, platform/config inspection, remote candidate, real proxy/credential/live-old-tab checks, registry image digest and cutover/rollback observations remain release gates. Rollback must restore baseline port80 as well as old image; Express uses8080. Do not mark deployed migration complete until authorized release observations pass.


## Follow-up checks after PR creation

Added remaining-features.spec.ts and additional-acceptance.md. All72 cold/refreshed screenshot-pair comparisons pass against independent PHP response data; visual-comparisons.json records each browser/viewport/theme and the separate existing mobile Chromium cold/refresh distinction. Typecheck passes. Actual production HTML/JS/CSS hashes match baseline, and an already-open production-loaded client passed browser-only handover to local Express in all three engines. Controlled forwarded-mode proxy tests exercise real401 and Authorization-bearing menuPOST requests. No application/frontend/artwork changes, runtime image changes or production writes. The existing114 offline and38 container results remain applicable; these were not rerun solely for browser-test additions.

Final combined browser run:70 passed,2 explicit skips, zero failures (2.0m); see additional-acceptance.md. Native OS permission/background behavior, actual remote proxy/renderer/platform and credentialed eBird/candidate/immutable rollback-image checks remain gates. No local eBird key/configuration or Fly authentication was available.
