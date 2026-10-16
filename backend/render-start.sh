#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Stop startup on migration/account errors rather than serving a broken login page.
python -m app.scripts.prepare_production
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}"
