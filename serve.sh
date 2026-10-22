#!/usr/bin/env bash
# Serve the existing frontend and Express API at http://localhost:8080.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Node.js 24.22.1 and npm are required.' >&2
  exit 1
fi
if [[ "$(node -p 'process.versions.node')" != '24.22.1' ]]; then
  echo 'Use Node.js 24.22.1 (see .node-version).' >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then npm ci; fi
TASK_DATA="${AV_DATA_DIR:-$ROOT/avian/data}"
mkdir -p "$TASK_DATA"
if [[ ! -f "$TASK_DATA/ebird.json" ]]; then
  cp "$ROOT/avian/data/ebird.example.json" "$TASK_DATA/ebird.json"
  echo 'Created ebird.json from the example. Set its token or export EBIRD_API_KEY to load birds.' >&2
fi
export HOST="${HOST:-localhost}"
npm run build
exec node --env-file-if-exists="$ROOT/.env" dist/server/index.js
