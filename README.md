# AvianVisitors

Live bird collage website powered by eBird observation data. Pared down from the BirdNET-Pi + microphone fork by [Teddy Warner](https://github.com/Twarner491/AvianVisitors).
Illustrations render from species data keyed by scientific name (`sci`).

## Local run

Install Node.js **24.22.1** and npm, then supply an [eBird API key](https://ebird.org/api/keygen):

```bash
npm ci
export EBIRD_API_KEY=your_key
./serve.sh
```

Open http://localhost:8080/. Existing `avian/data/ebird.json` configuration and
cache files remain supported. Alternatively copy `avian/data/ebird.example.json`
to `avian/data/ebird.json` and edit its token. Environment credentials are read
at startup and are never written into configuration by the launcher.

`PORT` defaults to `8080`; the local launcher binds `HOST=localhost`. Set
`HOST=0.0.0.0` when you intend to accept connections from other machines. `npm run dev` runs the TypeScript development server;
`npm run build && npm start` runs compiled JavaScript.

Hotspot mode accepts up to ten unique selections:
`?action=dashboard&mode=hotspot&regionCode[]=L123456&regionCode[]=L654321`.
The API sends one batched eBird request and preserves existing count semantics.

## Layout

```text
server/          # Express routes, eBird aggregation and image processing
tests/           # fixtures, contracts, focused API and browser checks
avian/frontend/  # unchanged collage UI
avian/assets/    # public illustrations and cutout fallbacks
avian/data/      # private configuration and disk caches
avian/scripts/   # independent Python artwork tools
serve.sh         # local Node launcher
```

eBird `sciName` → illustration slug (`Branta canadensis` → `branta-canadensis.png`).
`howMany` sums into collage weight `n`; `obsDt` becomes `last_observed`.

## API (`avian/api/birdnet-api.php`)

The collage frontend requests `dashboard` on page load, when the selected
location or mode changes, and whenever the selected refresh interval fires
(1m, 5m, 15m, or 1h). Changing the time window also requests `dashboard`
with the new `hours` value.

| Call | What it returns | What the UI uses it for |
|---|---|---|
| **`dashboard&hours=12&days=30`** | Nested `recent` species/hotspot data and `timeseries` daily/by-hour counts | All collage, atlas, and stats views. `hours` comes from the 1H / 3H / 6H / 12H / 24H / 7D / 30D picker. |
| **`hotspots`** | Nearby hotspot records (`hotspots`, `as_of`) | Populates the hotspot selector in the location menu. |
| **`species&sci=...`** | One species summary and up to 500 observations | Populates the species detail view. |
| **`nearby-species&speciesCode=...`** | Up to 100 recent hotspot observations for one species within the selected time window and radius | Populates the Atlas detail modal's nearby-observations table. Responses are cached in browser memory until the user refreshes them. |

In hotspot mode, `dashboard` and `species` requests require at least one
`regionCode`; invalid IDs or more than ten unique IDs return `400`. Duplicate
IDs are collapsed. If an upstream observation request fails, a still-available
stale cache is used; otherwise the request fails rather than returning partial
data. The `refresh=1` query parameter bypasses a fresh observation cache and
forces an upstream fetch.

## Hosting and verification

The Node container serves both the frontend and the existing API URLs on port
8080. The `.php` suffixes are compatibility URL names handled by Express.
The Fly app remains `avianvisitors-ebird` in `ewr`, with the same hostname,
HTTPS, health check and autoscaling configuration.

For a separate static frontend, create a complete publication directory:

```bash
node scripts/package-static.mjs
```

Set `static-site/config.js` to the existing backend URL using
`window.AV_API_BASE`, then publish **all of `static-site/`**, including its
`avian/assets/` tree. Keep the frontend origin unchanged to preserve returning
visitors' browser preferences. Set backend `AV_CORS_ORIGIN` to that frontend's
scheme and hostname when restricting CORS.

Run `npm run typecheck`, `npm test`, and `npm run test:browser` to verify changes.
See [runtime and release instructions](docs/runtime.md) for configuration,
Docker, static hosting, candidate smoke checks and rollback. Production cutover
requires a release instruction; building or testing a candidate does not deploy it.

## License

CC-BY-NC-SA-4.0 (inherited from BirdNET-Pi / Cornell attribution).
