# Resume checkpoint — 2026-10-21 final local verification

Migration implementation and packaging are saved as **uncommitted working-tree changes**. No production deployment, remote candidate, registry push, secret change or rollback occurred. Local verification is complete for the enumerated matrix; release acceptance remains pending. Do not repeat the broad repository audit.

## Preserved baseline and completed changes

Baseline HEAD `ef9ea289821051d85078d7d1bc94a8c0ce255a28`. Original untracked `docs/express-migration-plan.md` remains unchanged; SHA256 `3a8726eab6d62f8d0486a88aa96f76211faad7f3fa2ef15ad3b14a06e9f1924c`. All845 frontend/artwork hashes match. Express5/strict TypeScript/Node24.22.1 implementation and Node-only packaging remain uncommitted. Compatibility .php URLs remain direct Express routes.

Five legacy PHP implementations were removed **after** replacement contracts/browser/PNG/container behavior passed. No PHP source remains in the repository or final application image. Normal build/tests have no PHP requirement. The optional rembg environment remains external.

Additional acceptance work fixed independently detected palette/tRNS cropping, added five PHP GD fixture pairs (fourteen total), verified renderer child termination/cleanup, added18 cache edge tests and one shared HEAD/method/CORS test, and expanded browser matrix to36. Agents finished; no writes pending. Lead reviewed additions and independently reran final integration.

## Final executed results

- macOS typecheck/build pass; offline suite **114 passed,1 opt-in renderer skipped**.
- Fresh Linux Node-only install/typecheck/build and same offline suite: **114 passed,1 skipped**. No PHP source/executable present.
- Independent contracts:57 PHP-generated response cases plus845 public hashes pass inside suite. Expectations not regenerated from Express.
- Browser: **36/36 passed** across Chromium/Firefox/WebKit; lead independently reran serially,38.4s.
- Lead actual rembg2.0.86/u2netp/-ppm integration **1/1 passed**,2.63s. Fourteen GD PNG pixel comparisons pass.
- Final PHP-free Docker build passes. Image `avianvisitors:candidate`, immutable **local** ID `sha256:e97410a339572e21f502a83b7d068c0656fe4f9016d480da96f8260bf7bd0937`, linux/arm64, node user1000, port8080, ~595MB uncompressed. This is not a registry digest.
- `node scripts/verify-container.mjs IMAGE`: **38/38 checks pass** against that local ID: entrypoint/root/assets/API/image GET/HEAD/menu POST/CORS/privacy/nonroot/cache writes/restart/cold outage/stale fallback/no PHP or Apache/production dependencies.
- `node scripts/verify-shutdown.mjs IMAGE`: production entrypoint SIGTERM during paused HTTP200 image response passes, exit0. Direct active renderer shutdown/cleanup separately passes route test.
- Docker healthcheck reached healthy; all disposable containers removed.
- Local launcher two starts: first-run config, preservation, localhost, no environment secret persistence/logs, SIGTERM pass.
- Static artifact `/private/tmp/avian-static-final-20261021`: all845 public hashes match; no implementation/private files.
- Read-only existing production root200/OPTIONS204 expected CORS; discovery122 records and `as_of=2026-10-21T23:32:02+00:00`. Compiled replacement live Wikipedia route200 with extract/title/allowed thumbnail.
- `git diff --check` passes. Frontend/artwork unchanged.

See verification.md, coverage.md, browser-acceptance.md, aux-acceptance.md and cache-acceptance.md for exact scopes/limits. Earlier handoffs/parity checkpoint paragraphs are historical, superseded by their final-update sections and these reports.

## Tooling

Official isolated runtime `/private/tmp/node-v24.22.1-darwin-arm64/bin`. If absent after reboot:

```sh
curl --fail https://nodejs.org/dist/v24.22.1/node-v24.22.1-darwin-arm64.tar.gz -o /private/tmp/avian-node.tar.gz
shasum -a 256 /private/tmp/avian-node.tar.gz
# Must equal 89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7 before extraction.
tar -xzf /private/tmp/avian-node.tar.gz -C /private/tmp
export PATH=/private/tmp/node-v24.22.1-darwin-arm64/bin:$PATH
npm ci
```

Browser engines remain in user Library cache. Docker/Colima installed via Homebrew. Colima stopped cleanly after final checks. Image retained locally; Colima may need `colima start --cpu 2 --memory 2 --disk 10` before rechecking it. No app intentionally left running after verification. Temporary independent PHP capture/runtime and equipped rembg wrapper are outside repository and may disappear; normal tests require neither. See B handoff for wrapper reconstruction.

## Outstanding release work — do not invent or execute production cutover

Concrete procedure: rollout-rollback.md. Baseline port80 configuration saved as rollback.fly.toml; Express uses8080. release-record.json records local results and leaves remote unknowns null.

Authenticated Fly access/release environment must provide previous pullable immutable image, actual platform/non-secret configuration/renderer/proxy inspection and a separately authorized candidate. Match image platform, record registry digest, then run remote real eBird/proxy/old-open-client/refresh and resource checks. Actual pre-cutover open tab, cached production bundle, native geolocation permission UI and exhaustive visual/graph/silhouette matrix remain unexecuted, explicitly recorded in coverage.md. Do not infer exhaustive parity or deployed completion from the passing functional matrix. Production release and rollback require the separate release instruction.
