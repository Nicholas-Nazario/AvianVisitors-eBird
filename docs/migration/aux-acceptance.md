# Auxiliary/image acceptance — 2026-10-21

No production changes. Scope: auxiliary tests, PNG processing and independent GD image captures. Original frontend/artwork and migration plan untouched.

## Independent PNG evidence

Retained isolated PHP WASM 8.3.33/GD runtime processed the exact original postprocessing block from baseline `ef9ea289821051d85078d7d1bc94a8c0ce255a28`. Capture script `/tmp/avian-php-reference-runtime/palette.mjs` uses only baseline business code for expected output; no Express output informed expectations. PHP source/runtime remains outside the final artifact and is unnecessary for ordinary tests.

Five additional synthetic input/expected pairs under `tests/fixtures/reference/gd/`, with provenance and SHA-256 hashes in `palette.json`:

| Case | Baseline result |
| --- | --- |
| Indexed PNG, fully transparent tRNS background | Tight crop 11×7 → 7×3 |
| Indexed PNG, partially transparent tRNS background (alpha 128) | Canvas retained 11×7; seven-bit alpha conversion |
| Indexed PNG, opaque background | Canvas retained 11×7 |
| Truecolor PNG with transparent-color tRNS chunk | Tight crop 11×7 → 7×3 |
| Entirely transparent indexed PNG | Canvas retained 11×7 |

These captures caught a migration regression: implementation previously kept all canvases intact. `server/images/process.ts` now distinguishes transparent-color PNG chunks from ordinary RGBA alpha and crops the former when a nontransparent bounding box exists. Existing RGBA geometry remains independently verified against the prior nine GD cases. All fourteen pairs compare decoded dimensions and every RGBA byte exactly; compressed PNG bytes are intentionally unrestricted.

## Executed checks

- `PATH=/private/tmp/node-v24.22.1-darwin-arm64/bin:$PATH npm test -- tests/auxiliary`: **8 passed, 1 optional test skipped**.
- `AV_REAL_REMBG=/private/tmp/avian-rembg-cli /private/tmp/node-v24.22.1-darwin-arm64/bin/node node_modules/vitest/vitest.mjs run tests/auxiliary/real-renderer.test.ts`: **1 passed** using rembg 2.0.86/u2netp/-ppm and actual HTTP generation → postprocessing → atomic cache → temporary-directory cleanup. Output 800×403 alpha PNG, cache bytes equal response.
- New in-flight subprocess check: waits until a real Node renderer process reports its PID and temporary directory exists, calls production `shutdownRenderers()`, verifies HTTP 500 renderer-failure response, empty cache directory, and nonexistent child PID. This demonstrates direct renderer termination and cleanup while route work is active.

Tests preserve exact existing/downloaded/output 1024-byte asymmetry, strict image-stage precedence, HEAD responses, missing/invalid/failed generation bodies, actual subprocess argument ordering, wiki hostname restrictions and field-presence differences, menu POST and Authorization passthrough.

## Limits

In-flight termination test exercises the production shutdown export and real route, not an OS signal sent to the complete container; final-container signal handling is lead-owned. No claim of arbitrary descendant-process cleanup or SIGTERM-resistant executable termination. Real renderer evidence uses synthetic pixels, not a broad corpus of photos; fourteen independent decoded PNG fixtures establish measured geometry/alpha behavior. No live Wikipedia/eBird call or production renderer availability/timezone check was performed here. Temporary equipped wrapper/runtime may disappear after reboot; normal test suite remains PHP/Python-free.
