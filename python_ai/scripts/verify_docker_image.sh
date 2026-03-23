#!/usr/bin/env bash
# Smoke-test the production Docker image locally: build, run, GET /health.
# Run from anywhere; uses repo root (parent of python_ai/) as build context.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
IMAGE="${IMAGE:-stock-trader-api}"
PORT="${PORT:-8010}"

echo "==> Building ${IMAGE} from repo root..."
docker build -f python_ai/Dockerfile -t "${IMAGE}" .

echo "==> Starting container (port ${PORT} -> 8080)..."
CID="$(docker run -d -p "${PORT}:8080" -e PORT=8080 "${IMAGE}")"
cleanup() {
  docker rm -f "${CID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sfS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "==> GET /health"
curl -sfS "http://127.0.0.1:${PORT}/health"
echo ""
echo "OK: /health responded."
