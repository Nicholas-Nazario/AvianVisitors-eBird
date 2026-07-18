#!/usr/bin/env bash
# Build the local web root and serve the collage at http://localhost:8080
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVE="$ROOT/.local-serve"
DATA="$ROOT/avian/data"
PORT="${PORT:-8080}"

if ! command -v php >/dev/null 2>&1; then
  echo "php is required (e.g. brew install php)" >&2
  exit 1
fi

mkdir -p "$SERVE" "$DATA"

if [[ ! -f "$DATA/ebird.json" ]]; then
  if [[ -n "${EBIRD_API_KEY:-}" ]]; then
    python3 - <<PY
import json, os
cfg = {
  "lat": 40.785091,
  "lng": -73.968285,
  "dist": 3,
  "hotspot": True,
  "back": 30,
  "token": os.environ["EBIRD_API_KEY"],
}
open("$DATA/ebird.json", "w").write(json.dumps(cfg, indent=2) + "\n")
print("wrote $DATA/ebird.json from EBIRD_API_KEY")
PY
  else
    cp "$DATA/ebird.example.json" "$DATA/ebird.json"
    echo "created $DATA/ebird.json — set \"token\" (or export EBIRD_API_KEY) before loading birds" >&2
  fi
fi

link() { ln -sfn "$1" "$2"; }
link "$ROOT/avian/frontend/index.html" "$SERVE/index.html"
link "$ROOT/avian/frontend/apt.js"     "$SERVE/apt.js"
link "$ROOT/avian/frontend/styles.css" "$SERVE/styles.css"
link "$ROOT/avian/frontend/dims.json"  "$SERVE/dims.json"
link "$ROOT/avian/frontend/masks.json" "$SERVE/masks.json"
link "$ROOT/avian/frontend/nest.webp"  "$SERVE/nest.webp"
link "$ROOT/avian/assets/favicon.png"  "$SERVE/favicon.png"
link "$ROOT/avian"                     "$SERVE/avian"

echo "serving http://localhost:$PORT  (Ctrl-C to stop)"
cd "$SERVE"
exec php -S "localhost:$PORT"
