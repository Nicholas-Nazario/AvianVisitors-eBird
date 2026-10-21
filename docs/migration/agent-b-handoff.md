# Auxiliary migration checkpoint

2026-10-21. Core reference gate accepted by lead before implementation. Production unchanged; PHP retained pending final acceptance.

Implemented files: `server/routes/wiki.ts`, `cutout.ts`, `menu.ts`; `server/images/common.ts`, `process.ts`, `renderer.ts`; `tests/auxiliary/routes.test.ts`, `real-renderer.test.ts`.

All-method routers preserve wiki field presence, validation/error cache behavior, Wikipedia hostname checks, menu stub, image precedence/size boundaries, HEAD, renderer error bodies, and optional subprocess generation. `shutdownRenderers()` export is integrated by lead into shutdown. Temporary output is under configured image cache and removed before sending responses; rename is atomic. Legacy generated cache read precedes configured new writes.

Verification: seven auxiliary regression tests pass. Full TypeScript typecheck passes. Nine independent PHP GD PNG captures match decoded pixels exactly, including resize: measured truecolor alpha PNG processing retains canvas instead of tight cropping. Seven-bit GD alpha and area resampling are implemented directly. Independent HTTP contract tests are Agent C's scope.

Real optional renderer integration passed with rembg 2.0.86, ONNX CPU, u2netp, -ppm: full HTTP route -> subprocess -> PNG postprocessing -> atomic cache -> cleanup. Used synthetic `tests/fixtures/reference/gd/alpha-resize-input.png` and produced expected 800x403 alpha PNG. No production renderer installation changed. uv's downloaded model cache is `/Users/nicholasnazario/.rembg/models/u2netp/u2netp.onnx` (~4.57MB).

To recreate temporary equipped-runtime wrapper:

```sh
cat > /private/tmp/avian-rembg-cli <<'WRAPPER'
#!/bin/sh
exec /opt/homebrew/bin/uv run --with 'rembg[cpu,cli]==2.0.86' rembg "$@"
WRAPPER
chmod 755 /private/tmp/avian-rembg-cli
AV_REAL_REMBG=/private/tmp/avian-rembg-cli /private/tmp/node-v24.22.1-darwin-arm64/bin/node node_modules/vitest/vitest.mjs run tests/auxiliary/real-renderer.test.ts
```

Offline suite deliberately skips real-renderer test unless `AV_REAL_REMBG` is set. Actual verified initial package resolve was unpinned rembg 2.0.86; wrapper above pins the same version. Installation recipe sent to Agent A for deployment documentation: optional Python venv plus `pip install 'rembg[cpu,cli]==2.0.86'`; point `AV_REMBG_PATH` at venv's rembg executable, provide writable model-cache home and prewarm/download model. Default deployment remains renderer-disabled.

Remaining: Agent C requested palette/tRNS PNG GD capture; current exact parity tests cover ordinary RGBA and actual rembg truecolor output. Broader real-photo visual parity and renderer termination while processing remain unverified. Filesystem failure branches beyond normal cleanup rely on shared Express error handling. No long-running commands or pending writes at this checkpoint.

Cross-review of Agent A found DST spring-gap mismatch; A fixed and tested it. Other route/cache/aggregation source mappings reviewed appeared consistent.
