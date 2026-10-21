# Runtime and release

AvianVisitors runs on Node.js 24.22.1 and Express 5. The frontend and public API
paths remain unchanged. `/avian/api/birdnet-api.php`, `wiki.php`, `cutout.php`,
and `menu.php` are Express route names.

## Local development and configuration

Install the exact Node version in `.node-version`, run `npm ci`, then
`EBIRD_API_KEY=your_key ./serve.sh`. The launcher builds and starts the server.
`npm run dev` watches server source. The independent artwork scripts retain
their own Python environment; they are outside the web runtime.

| Setting | Default and behavior |
| --- | --- |
| `EBIRD_API_KEY` | Overrides the token from `avian/data/ebird.json` when nonempty. Keep server-side. |
| `AV_DATA_DIR` | `avian/data` under the working directory; writable JSON configuration and eBird caches. |
| `HOST`, `PORT` | Server/container: `0.0.0.0`, `8080`; local launcher: `localhost`, `8080`. |
| `TZ` | `UTC`, matching the isolated reference runtime; public legacy timestamps were independently observed at +00:00 on 2026-10-21; authenticated runtime inspection remains a release check. Observation wall times use this timezone. |
| `AV_CORS_ORIGIN` | `*`; restrict to the frontend origin, with no URL path, when needed. |
| `AV_USER_AGENT` | Existing AvianVisitors identifier for Wikipedia requests. |
| `AV_IMAGE_CACHE_DIR` | `<data directory>/cutouts`, for newly generated images. |
| `AV_LEGACY_IMAGE_CACHE_DIR` | `../BirdSongs/Extracted/cutouts`, relative to the repository, read before the new cache. |
| `AV_REMBG_PATH` | `/usr/local/bin/rembg-cli`; optional executable. |

Existing `ebird.json` latitude, longitude, radius, hotspot flag, lookback and
token settings remain valid. Keep existing `ebird-cache-*.json` and
`ebird-hotspots-*.json` files when upgrading: legacy names and formats remain
readable, including stale fallback during upstream failures. Cache writes are
atomic and the observation/discovery lifetime remains 60 seconds. The private
data directory is never served as static content.

The container omits the optional renderer, preserving the existing default.
Bundled and cached images work without it. For a custom installation, provision
the existing rembg wrapper at `AV_REMBG_PATH`, its `u2netp` model and a writable
image cache. The wrapper receives `i -m u2netp -ppm INPUT OUTPUT` as separate
arguments. Requests use the existing timeout and image-response behavior.

The verified optional renderer is `rembg[cpu,cli]==2.0.86`. Install it in a
separate Python environment, set `AV_REMBG_PATH` to that environment's `bin/rembg`,
and provide a writable model directory under the service user's home. The
`u2netp` model downloads on first use; prewarm it before serving requests.
The integration check is
`AV_REAL_REMBG=/absolute/path/to/rembg npm test -- tests/auxiliary/real-renderer.test.ts`.
This optional environment is separate from the default Node container.

## Same-origin container

```sh
docker build -t avianvisitors:candidate .
docker run --rm -p 8080:8080 -e EBIRD_API_KEY avianvisitors:candidate
```

The final image contains compiled server code, production npm dependencies,
selected frontend files and public artwork. It runs as the unprivileged `node`
user and listens on port 8080. Writable state lives in `/app/avian/data`.
No volume is introduced by this migration. Keep private configuration outside
public artwork and frontend directories.

`fly.toml` keeps the existing app, hostname, region, HTTPS, root health check,
512 MB machine and autostop/autostart settings. The internal service port is
8080. The current deployment has no persistent volume configured; its caches
are temporary across machine replacement, as before. No production deployment
is performed by local build or test commands.

## Separate frontend origin

Run `node scripts/package-static.mjs [EMPTY_OUTPUT_DIRECTORY]`; the default is
`static-site/`. The script rejects a populated output directory. It copies the
frontend files plus favicon and required `avian/assets/illustrations`,
`cutouts`, and `loading-animation-cutouts` trees. It excludes server code,
configuration, caches, reference images and artwork tooling.

Set the generated `config.js` `window.AV_API_BASE` to the existing backend
hostname, then publish the complete output directory to the existing Pages or
static host. Leave the frontend source unchanged. Preserve the exact frontend
origin and project URL path so browser localStorage and bookmarks continue to
work. For a project Pages site, the CORS origin is still just scheme and host.

## Candidate verification and production release

Before publishing a replacement, run:

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run test:browser
```

Build and inspect the final container. Check that it runs as a nonroot user,
contains no interpreter/source from the removed runtime, contains no local
`ebird.json`, tokens, fixtures or private caches, and does not serve
`/avian/data/ebird.json`, source files, or dotfiles. Exercise a restart and
SIGTERM during idle and active requests. An optional-renderer installation
must additionally run the real renderer test path documented in its test file.

Launch the candidate on a separate hostname using the existing server-side
secret mechanism. Smoke-check `/`, `/avian/frontend/index.html`, frontend
configuration, favicon, illustrated poses, loading artwork and all four API
actions. Test missing-token/error CORS responses and OPTIONS. Open a browser
with saved preferences, change location/time windows, select multiple hotspots,
open species/Atlas detail, and verify images and counts. Repeat with the static
frontend using `AV_API_BASE` against the candidate. Record the candidate image
digest, baseline commit, test evidence and remaining limitations.

Before cutover, record the currently deployed immutable image reference and
configuration/secrets, and verify that this reference is available for rollback.
Preserve production frontend and backend hostnames. Execute deployment only
under a release instruction, using the accepted candidate digest. Verify health,
API counts, image availability, CORS and returning-user preferences immediately
afterward. If those checks fail, redeploy the recorded previous image and its
matching configuration; recheck the same URLs. The older emergency rollback
artifact is separate from the new Node-only application image.

Concrete release commands, baseline port-80 rollback configuration and the unpopulated remote release record are in [rollout-rollback.md](migration/rollout-rollback.md). Local image verification: `node scripts/verify-container.mjs IMAGE` and `node scripts/verify-shutdown.mjs IMAGE`; both are local-only.
