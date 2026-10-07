#!/usr/bin/env bash
# Start the stack the end-to-end tests run against, on one origin like production:
#   API      Gunicorn on 127.0.0.1:8080 (migrated, catalog and demo data seeded)
#   Frontend the production build, served by `vite preview` on 127.0.0.1:4173, proxying /api
# Expects the backend environment (DATABASE_URL, REDIS_URL, secrets, payment settings) to be set.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
logs="${E2E_LOG_DIR:-$root/e2e-logs}"
mkdir -p "$logs"

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 60); do
    if curl -sf "$url" >/dev/null; then echo "$name is up"; return 0; fi
    sleep 1
  done
  echo "$name did not start; last log lines:" >&2
  tail -n 50 "$logs/$name.log" >&2
  return 1
}

cd "$root/backend"
flask db upgrade
flask seed catalog
flask seed demo --yes
# Product photos, when the run has them (docs/IMAGE_SOURCES.md); otherwise the kind drawings show.
if [ -d seed/images ] && [ -n "$(ls -A seed/images)" ]; then flask seed images; fi
gunicorn --bind 127.0.0.1:8080 --workers 2 --access-logfile - wsgi:app >"$logs/api.log" 2>&1 &
wait_for http://127.0.0.1:8080/api/v1/health/ready api

cd "$root/frontend"
npm run build
FORGE_API_ORIGIN=http://127.0.0.1:8080 npx vite preview --host 127.0.0.1 --strictPort >"$logs/web.log" 2>&1 &
wait_for http://127.0.0.1:4173/api/v1/health/live web
