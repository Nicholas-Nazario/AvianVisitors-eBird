# AvianVisitors

Live bird collage website — pared down from the BirdNET-Pi + microphone fork.
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
`howMany` sums into collage weight `n`; `obsDt` becomes `last_seen`.

## API (`avian/api/birdnet-api.php`)

The collage frontend polls these about every 30s (and when you change the time window). All reshape eBird data.

| Call | What it returns | What the UI uses it for |
|---|---|---|
| **`recent&hours=12`** | Species seen in that window (`sci`, `com`, `n`, `last_seen`) | Collage tiles + stats “top species” / timeline. `hours` comes from the 1H / 12H / 24H / 7D / ALL picker. |
| **`timeseries&days=30`** | Daily + by-hour counts | Stats charts (detections over days / hours of day). |
| **`firstseen&limit=10`** | Newest species by first observation | “First Detections” list on stats. |
| **`stats`** | Totals / today / last hour / week | “By Period” summary numbers. |
| **`lifelist`** | Every species in the pulled eBird set, with all-time-ish counts | Atlas cards and all-time counts in the detail modal. |

## License

CC-BY-NC-SA-4.0 (inherited from BirdNET-Pi / Cornell attribution).
