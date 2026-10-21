# Agent A checkpoint

No writes pending. Safe to restart the session. Changes are uncommitted in the
shared workspace; no production action was taken.

Completed API files: `server/ebird/aggregate.ts`, `cache.ts`, `time.ts`,
`server/routes/birdnet.ts`, `tests/ebird/ebird.test.ts`. All four legacy actions,
validation/fetch precedence, object/array upstream shapes, count aggregation,
independent windows, exact species match and 500-row cap are implemented.
Disk cache preserves PHP MD5 filenames, five-decimal rounding, negative zero
and exponent encoding, 60-second exclusive freshness, refresh bypass, stale
HTTP/transport fallback, invalid-success rejection and atomic tolerant writes.
Dates use configured timezone, PHP offset timestamp format, calendar overflow,
first NY fold occurrence and forward-normalized spring gap. Shared `phpTrim`
replaces JavaScript Unicode trimming in inputs and aggregation.

Checks: 22 focused eBird tests passed, including 17 independent PHP response
captures and exact upstream URLs/headers/timeouts, before final `phpTrim`
substitution. Final global TypeScript check passes after that substitution.
`bash -n serve.sh` and `node --check scripts/package-static.mjs` pass. Reference fixtures remain untouched. Test listener
requires the approved elevated Vitest prefix due sandbox localhost EPERM.

Bounded cross-review of B: wiki/menu/image resolver mappings, fallbacks and
size thresholds match source. Flagged missing focused optional-generation
lifecycle tests and Unicode trim mismatch; B applied shared trim and reported
successful real `rembg[cpu,cli]==2.0.86` end-to-end integration. C independently
captures GD geometry/alpha behavior; B implements those measured semantics.

Completed packaging writes: `Dockerfile`, `fly.toml`, `serve.sh`,
`.dockerignore`, `.gitignore`, `README.md`, `docs/runtime.md`,
`scripts/package-static.mjs`. Docker uses exact Node 24.22.1 bookworm-slim,
production dependencies and compiled server only, selected public artwork,
nonroot UID1000, writable `/app/avian/data`, port8080 and root healthcheck.
Fly hostname/region/autoscaling/memory stay unchanged; internal port is8080.
Launcher copies the example configuration on first run without overwriting existing files, preserves environment credentials without writing them to disk, and defaults to HOST=localhost.
Static packaging includes all required artwork/loading/favicon and rejects
nonempty output. Runtime docs clarify UTC reference versus unverified deployed timezone and cover settings, both origins, optional renderer,
candidate verification and immutable-image rollback procedure.

Remaining checks: no container build/runtime inspection yet; Docker CLI exists
at `/opt/homebrew/bin/docker`, daemon availability unverified. Static packaging
script needs execution into an empty temporary directory, inspection and asset
path smoke checks. Launcher needs actual startup/termination check. No PHP
files were deleted by Agent A. No deployment was attempted.

Suggested next commands (Node prefix `/private/tmp/node-v24.22.1-darwin-arm64/bin`):

```sh
node --check scripts/package-static.mjs
npm run typecheck
npm test -- tests/ebird
node scripts/package-static.mjs /private/tmp/avian-static-check-UNIQUE
docker build -t avianvisitors:candidate .
docker run --rm -p 8080:8080 -e EBIRD_API_KEY avianvisitors:candidate
```

Do not publish or cut over production without the release instruction. Lead
owns final tests, coverage ledger, PHP removal, shared package scripts and
release acceptance. Full PHP natural-language `strtotime` syntax is broader
than the isolated calendar parser; captured eBird date/date-time/offset,
malformed and DST cases are covered. Escalate additional date forms if found.
