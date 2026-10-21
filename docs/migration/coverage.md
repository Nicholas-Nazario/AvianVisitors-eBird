# Migration coverage ledger — 2026-10-21 final local review

Baseline `ef9ea289821051d85078d7d1bc94a8c0ce255a28`. Original plan preserved (SHA256 `3a8726eab6d62f8d0486a88aa96f76211faad7f3fa2ef15ad3b14a06e9f1924c`). No production changes. Local implementation acceptance is separate from remote release acceptance.

| Requirement | Owner | Executed evidence | Disposition |
| --- | --- | --- | --- |
| Independent baseline/query/time/number contracts | C / Lead | 57 PHP-generated HTTP captures + runtime/provenance JSON; 58 contract/hash assertions | Pass for captured supported inputs; arbitrary natural-language dates and nested warning text remain outside measured eBird contract |
| Configuration/token precedence/query arrays/CORS | Lead | foundation, hosting and reference tests; live legacy OPTIONS | Pass; proxy-managed credentials are not application authentication |
| Four actions, counts/order/date windows/validation/errors | A / C / Lead | 22 eBird tests; independent HTTP cases; compiled-image actions | Pass for fixture matrix, including 500-row detail and nearby slice |
| Cache TTL/forced refresh/stale/invalid-success/legacy keys | A / C | independent seeded PHP filenames + focused eBird cases | Pass |
| Malformed caches/write failures/restart/concurrency/isolation | A / Lead | 18 added cache checks; compiled-image restart and outage | Pass; writes atomic, no request coalescing introduced |
| Upstream deadlines including stalled bodies | Lead | real HTTP partial-body test; endpoint timeout arguments | Pass; shortened 50ms deadline tests same mechanism |
| Wiki fields/hosts/fallback/methods | B / C / Lead | auxiliary/reference/HEAD tests; live Node→Wikipedia summary | Pass; live response had extract and Wikimedia thumbnail |
| Menu GET/POST/HEAD/PUT, Authorization-bearing request, OPTIONS | B / C / Lead | auxiliary/reference/hosting tests | Pass locally, including controlled401/wrong-password/unlock browser flow; actual deployed proxy remains remote gate |
| Images precedence/poses/strict sizes/GET/HEAD/bytes/errors | B / C / Lead | auxiliary precedence/size tests; hosting HEAD; browser poses; container asset | Pass |
| Optional generation/PNG crop/resize/alpha | B / Lead | real rembg 2.0.86 integration; 14 independent GD pixel fixtures | Pass; tRNS regression fixed; broad photographic corpus not claimed |
| Renderer termination/temp cleanup | B / Lead | actual child PID termination during route work; no temp files; full entrypoint signal smoke | Pass for direct child; arbitrary resistant descendants not claimed |
| Unchanged frontend/artwork | C / Lead | 845 SHA256 checks; static artifact independently checked | Pass; no frontend/artwork edits |
| Returning visitor/browser matrix | C / Lead | 70 passed,2 explicit skips; expanded functional/permission/proxy/open-client checks plus72 screenshot pairs; see additional-acceptance.md | Pass for enumerated assertions; remaining OS/remote gates retained below |
| Same-origin and separate-origin hosting | A / C / Lead | real Express browser origins/config.js; public/private hosting tests; static artifact hashes | Pass locally; existing production origin preserved |
| Local launcher/first-run config/secret handling | A / Lead | two isolated starts, config hash unchanged second run, secret absent from logs/file, localhost and SIGTERM | Pass |
| Node-only build/runtime/Fly port/user/cache/privacy | A / Lead | final Docker build + 38 checks, image linux/arm64, uid1000, port8080; inspected Fly diff | Pass locally; production platform must be recorded before registry release |
| Clean PHP-free installation/build/tests | Lead | fresh Node Linux container with only selected source/tests/assets; npm ci, typecheck, build, offline suite; no PHP executable/source | Pass; browser engines tested on macOS, not inside slim image |
| PHP removal | Lead | five files deleted after replacement/image evidence; file search empty; artifact has no PHP/Apache | Complete locally |
| Cross review/integration | A / B / C / Lead | saved cross-review handoffs; lead inspected added tests/fix/shared code and reran integrated checks | Complete for local implementation |
| Production timezone/live edge | Lead | public legacy hotspot `as_of=2026-10-21T23:32:02+00:00`, root200 and OPTIONS204 expected CORS | Observed UTC compatibility; authenticated config/renderer inspection pending |
| Rollout/rollback | A / Lead | rollout-rollback.md, baseline port80 rollback.fly.toml, release-record.json | Procedure complete; remote digest/platform/candidate/cutover/rollback execution pending |

## Explicit release gates and remaining measurements

Remote candidate deployment and production cutover were not executed. Authenticated Fly access is needed to record/pull the previous immutable image, confirm actual runtime/renderer/proxy/platform configuration and test the candidate with real server-managed credentials. Those missing values remain null in the release record. No claim of deploy readiness or deployed completion.

Follow-up checks in additional-acceptance.md now cover zero-tolerance pixels for three views in both themes/viewport sizes across three engines, custom-window boundaries, graph counts/order/top-ten/mobile scrolling/cross-highlights, collage count sizing/silhouette pointer interaction, actual browser geolocation grants (Chromium denial), a controlled Basic Auth proxy, and an already-open production-loaded client through browser-only API handover. The screenshot corpus is deliberately finite; it does not establish every possible data/layout combination. Native macOS permission dialogs and real background-window scheduling remain unexecuted, as do actual remote proxy/candidate configuration and post-cutover behavior. No authenticated live replacement eBird observation fetch was possible without a release environment/token. No frontend/artwork bytes changed.

See verification.md for final commands/results, migration-parity.md for independent provenance, and the three *-acceptance.md reports for exact test scope. An unexecuted row is never inferred passing from another row.
