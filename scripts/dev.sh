#!/usr/bin/env bash
# Starts the api (:8781), pay (:8782) and web (:5781) together.
# Press Ctrl-C to stop all three. Uses Docker for PHP when php is not installed.
set -euo pipefail
cd "$(dirname "$0")/.."

trap 'kill 0' EXIT

(cd api && go run ./cmd/flightboard-api) &

if command -v php >/dev/null 2>&1; then
  (cd pay && php -S 127.0.0.1:8782 public/index.php) &
else
  docker run --rm --init --name flightboard-pay -p 127.0.0.1:8782:8782 \
    -v "$PWD/pay":/app -w /app php:8.3-cli php -S 0.0.0.0:8782 public/index.php &
fi

(cd web && npm run dev) &

wait
