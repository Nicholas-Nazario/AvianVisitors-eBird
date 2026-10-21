Agent C restart checkpoint — 2026-10-21

Owned files: `tests/fixtures/`, `tests/contract/`, `tests/browser/`, `docs/migration-parity.md`. Full evidence, scope and remaining gaps are in `docs/migration-parity.md`.

Completed: 57 independent PHP HTTP golden cases, runtime/query/date/number characterization, 18 synthetic PNGs (nine input/expected pairs) plus GD metadata, all845 unchanged public file hashes, response contract harness, public-file hash test, three browser scenarios run in three engines. No shared package/config implementation edits.

Last runs:

- `PATH=/private/tmp/node-v24.22.1-darwin-arm64/bin:$PATH npm test -- tests/contract`:58/58 passed (57 response tests plus public-file hash assertion), after lead fixed independently detected `query-array-sci` serialization. Golden expected outputs remain unchanged.
- `PATH=/private/tmp/node-v24.22.1-darwin-arm64/bin:$PATH npm run test:browser`:9 passed (Chromium, Firefox, WebKit). No browser job remains running.
- Earlier independent cache suite45/45 passed before thirteen new coercion/error cases were added.

Temporary capture reproducibility (outside final artifact):

- `/tmp/avian-reference-capture/avian/api/` has baseline source and adapted copies. `/tmp/avian-reference-capture/adapter.inc` is the approved time/transport/header adapter.
- `/tmp/avian-php-reference-runtime/capture.mjs` regenerates all57 sanitized HTTP fixtures and runtime/provenance metadata, using actual baseline PHP business code. Run from repository root with `/private/tmp/node-v24.22.1-darwin-arm64/bin/node /tmp/avian-php-reference-runtime/capture.mjs`.
- `/tmp/avian-php-reference-runtime/geometry.mjs` regenerates GD image input/output fixtures and America/New_York DST cases from the exact extracted baseline postprocessing block. Run similarly. It imports the repository's pinned Sharp solely to encode synthetic input pixels and decode output evidence; expected processing is PHP GD.
- Runtime package `/tmp/avian-php-reference-runtime/node_modules/@php-wasm/node`3.1.60 provides PHP8.3.33. Node runtime24.22.1. `loadNodeRuntime('8.3',{emscriptenOptions:{processId:1001}})` plus `createNodeFsMountHandler` is required. Runtime creates a loopback socket, requiring escalated execution in this sandbox. PHP CLI wrapper was unsuitable; direct API worked.
- `probe.mjs` established PHP version, unmodified default timezoneUTC, GD enabled.
- Baseline extraction: `git archive ef9ea289821051d85078d7d1bc94a8c0ce255a28 avian/api avian/data/ebird.example.json | tar -x -C /tmp/avian-reference-capture`.

After restart: run typecheck/final integrated checks as needed; run remaining browser scenarios only if continuing acceptance work. Preserve all current fixtures; never regenerate expected output from Express. Capture palette/tRNS transparency if required. Real deployment timezone and final-image/release evidence remain unresolved. No PHP source/runtime should be added to the final repository or normal suite.
