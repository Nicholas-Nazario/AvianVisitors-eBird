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
`?action=recent&mode=hotspot&regionCode[]=L123456&regionCode[]=L654321`.
Duplicate IDs are collapsed. The API fetches and caches each hotspot separately,
then combines observations before producing its normal `stats`, `recent`,
`species`, and `timeseries` response shapes. Species observations are summed;
timeseries observation totals are summed while each species counts once per day.

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

The collage frontend polls these about every 30s (and when you change the time window). All reshape eBird data.

| Call | What it returns | What the UI uses it for |
|---|---|---|
| **`recent&hours=12`** | Species observed in that window (`sci`, `com`, `n`, `last_observed`) | Collage tiles, atlas cards + stats “top species” / timeline. `hours` comes from the 1H / 3H / 6H / 12H / 24H / 7D / 30D picker. |
| **`timeseries&days=30`** | Daily + by-hour counts | Stats charts (observations over days / hours of day). |
| **`stats`** | Totals / today / last hour / week | “By Period” summary numbers. |

Hotspot requests with no ID, an invalid ID, or more than five submitted IDs
return `400`. If an upstream hotspot request fails, a still-available stale
cache is used; otherwise the combined request fails rather than returning
partial data.

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
