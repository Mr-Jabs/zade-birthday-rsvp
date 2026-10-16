#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Stop startup on migration/account errors rather than serving a broken login page.
python -m app.scripts.prepare_production
# Execute the explicit UPDATE against DATABASE_URL and verify it after commit.
python -m app.scripts.open_rsvp
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}"
