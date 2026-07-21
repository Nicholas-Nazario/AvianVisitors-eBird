# AvianVisitors

Live bird collage website powered by eBird observation data. Pared down from the BirdNET-Pi + microphone fork by [Teddy Warner](https://github.com/Twarner491/AvianVisitors).
Illustrations render from species data keyed by scientific name (`sci`).

## Local run

Requires `php` (e.g. `brew install php`) and an [eBird API key](https://ebird.org/api/keygen).

```bash
# one-time: copy example config and put your token in "token"
cp avian/data/ebird.example.json avian/data/ebird.json

./serve.sh
```

Or: `EBIRD_API_KEY=... ./serve.sh` (writes `ebird.json` on first run).

Open http://localhost:8080/

Alias: `alias avian='/Users/nicholasnazario/src/AvianVisitors-eBird/serve.sh'`

Default query: Central Park area (`lat`/`lng`/`dist` in `avian/data/ebird.json`).

Hotspot mode accepts one or more repeated hotspot IDs, up to five:
`?action=dashboard&mode=hotspot&regionCode[]=L123456&regionCode[]=L654321`.
Duplicate IDs are collapsed. The API batches the selected hotspot IDs into one
eBird request, then combines observations before producing both dashboard
datasets. Species observations are summed; timeseries observation totals are
summed while each species counts once per day.

## Layout

```
avian/
├── frontend/     # collage UI
├── assets/       # illustrations + cutout fallbacks
├── api/          # cutout.php, birdnet-api.php (eBird), wiki.php
├── data/         # ebird.json (gitignored), cache
└── scripts/      # optional illustration generation
serve.sh
```

eBird `sciName` → illustration slug (`Branta canadensis` → `branta-canadensis.png`).
`howMany` sums into collage weight `n`; `obsDt` becomes `last_observed`.

## API (`avian/api/birdnet-api.php`)

The collage frontend requests `dashboard` on page load, when the selected
location or mode changes, and whenever the selected refresh interval fires
(1m, 5m, 15m, 1h, or 1d). Changing the time window also requests `dashboard`
with the new `hours` value.

| Call | What it returns | What the UI uses it for |
|---|---|---|
| **`dashboard&hours=12&days=30`** | Nested `recent` species/hotspot data and `timeseries` daily/by-hour counts | All collage, atlas, and stats views. `hours` comes from the 1H / 3H / 6H / 12H / 24H / 7D / 30D picker. |
| **`hotspots`** | Nearby hotspot records (`hotspots`, `as_of`) | Populates the hotspot selector in the location menu. |
| **`species&sci=...`** | One species summary and up to 500 observations | Populates the species detail view. |

In hotspot mode, `dashboard` and `species` requests require at least one
`regionCode`; invalid IDs or more than five unique IDs return `400`. Duplicate
IDs are collapsed. If an upstream observation request fails, a still-available
stale cache is used; otherwise the request fails rather than returning partial
data. The `refresh=1` query parameter bypasses a fresh observation cache and
forces an upstream fetch.

## Fly.io backend + GitHub Pages frontend

The repository includes a `Dockerfile` and `fly.toml`. The Fly app runs the
PHP API, while GitHub Pages serves the static frontend.

### Deploy the backend to Fly.io

Install and authenticate [`flyctl`](https://fly.io/docs/flyctl/install/), then
run these commands from the repository root:

```bash
fly launch --no-deploy
fly secrets set EBIRD_API_KEY=your_ebird_api_key
fly deploy
```

If the app already exists, `fly deploy` is sufficient. The Docker image
serves the PHP API on port 80. `EBIRD_API_KEY` is stored as a Fly secret, so
it must not be committed to `avian/data/ebird.json`.

After deployment, note the backend URL, such as:

```text
https://avianvisitors-ebird.fly.dev
```

### Deploy the frontend to GitHub Pages

Before publishing the frontend, edit `avian/frontend/config.js` and set
`window.AV_API_BASE` to the Fly backend URL:

```js
window.AV_API_BASE = 'https://avianvisitors-ebird.fly.dev';
```

Publish the contents of `avian/frontend/` as the GitHub Pages site. If using
GitHub Actions, configure the workflow to upload that directory as the Pages
artifact. If using the repository Pages branch, copy the contents of
`avian/frontend/` into the published directory.

The API allows cross-origin requests by default. To restrict access to the
GitHub Pages site, set the exact Pages origin as a Fly secret and redeploy:

```bash
fly secrets set AV_CORS_ORIGIN=https://your-user.github.io
```

For a project Pages site, include the repository path in the origin only when
configuring frontend URLs; the origin itself remains the scheme and hostname,
for example `https://your-user.github.io`.

## License

CC-BY-NC-SA-4.0 (inherited from BirdNET-Pi / Cornell attribution).
