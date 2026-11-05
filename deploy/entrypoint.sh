#!/bin/sh
set -eu
case "${1:-web}" in
  web)
    if [ "${VISTA360_DEMO_MODE:-false}" = 'true' ]; then
      exec python -m app.demo
    fi
    exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips '*'
    ;;
  worker)
    exec python -m app.processing.worker
    ;;
  migrate)
    exec python -m alembic upgrade head
    ;;
  *)
    echo 'Uso: web | worker | migrate' >&2
    exit 2
    ;;
esac
