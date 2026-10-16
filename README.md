# Zade’s Monster Truck Birthday

Phases 1–7 of a mobile-first birthday RSVP app: public invitation, interactive RSVP, submission engine, organizer authentication, dashboard, and CSV export.

## What works

- Responsive welcome, event details, non-slip socks reminder, and closing invitation.
- Original SVG monster truck, checkered accents, photo placeholder, locally bundled fonts.
- Tailwind CSS 4 theme tokens plus reusable CSS component styles.
- Native modal with keyboard dismissal and focus return, in-page navigation, Google Maps link.
- Downloadable calendar invitation with the correct Philippine event times.
- FastAPI event API backed by PostgreSQL, Alembic migration, repeat-safe seed, health endpoints.
- Static invitation fallback with an explicit notice if the event API is unavailable.
- Three-step RSVP form with Back/Next navigation, validation, and in-memory draft preservation when the dialog is closed and reopened.
- Yes/No/Maybe attendance, party counters, a 200-character optional message, and a personalized saved confirmation.
- `POST /api/v1/rsvp` with server validation, Philippine mobile normalization, PostgreSQL constraints, and atomic retry protection.

The current local event is open for RSVPs. The private dashboard is at **http://127.0.0.1:5173/admin.html**; locally generated login credentials are in `.local/organizer-credentials.txt` (ignored by Git). See [organizer setup, security, and usage](docs/organizer-dashboard.md). A newly seeded event stays closed until you explicitly run `python -m app.scripts.open_rsvp` after applying migrations. The API always enforces the event’s `rsvp_open` flag.

## Stack and structure

```text
frontend/
  index.html                   Semantic, crawlable page shell
  admin.html                   Organizer login and private dashboard shell
  src/admin.js                 Auth, dashboard, live refresh, filtering, export
  src/styles/admin.css         Responsive organizer theme
  src/styles/tokens.css        Tailwind @theme and layout variables
  src/styles/theme.css         Responsive components and motion rules
  src/components/icons.js      Shared SVG icons
  src/api/client.js            Public event request and validation
  src/state/event.js           Offline invitation snapshot
  src/state/rsvp-store.js       Wizard state and per-payload retry keys
  src/components/rsvp-wizard.js Guest wizard and confirmation
  src/utils/rsvp-validation.js  Client-side RSVP rules
  src/api/rsvp-api.js           Submission transport and error handling
  src/utils/calendar.js        Calendar file generation
  public/assets/               Truck artwork, favicon, photo placeholder
  tests/                       Browser checks at four viewport sizes
backend/
  app/config.py                Environment configuration
  app/database.py              SQLAlchemy engine/session
  app/models/                  Event data model
  app/schemas/                 Public response contracts
  app/routes/                  Event API
  app/services/                RSVP persistence and idempotency rules
  app/scripts/                 Database creation and event seed
  migrations/                  Versioned PostgreSQL schema
  tests/                       PostgreSQL-backed API checks
docs/                          Theme and API notes
compose.yaml                   Optional PostgreSQL 18 development service
```

## Local development

Requires Node.js 20.19+ or 22.12+, pnpm, Python 3.11+, and PostgreSQL 18 (or Docker).

### 1. Configure environment and database

Copy `.env.example` to `.env` if no `.env` exists, and supply your development PostgreSQL credentials. Never commit `.env`.

For Docker, set `POSTGRES_PASSWORD` in `.env`, use matching credentials in `DATABASE_URL`, and run `docker compose up -d db`. The Compose service listens only on localhost port 5432. Values in `.env` are placeholders until you configure them.

For an existing PostgreSQL server, configure `DATABASE_URL` for that server. The development database creation script needs a role with permission to create databases; alternatively create the database yourself and skip that script.

**This workspace is already configured:** an isolated development cluster lives in `.local/postgres/data`, listens on `127.0.0.1:55432`, and uses a randomly generated local password in the ignored `.env`. It does not use the pre-existing PostgreSQL service. To restart this cluster on this Windows machine:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D D:/ZadeBirthday/.local/postgres/data -l D:/ZadeBirthday/.local/postgres/server.log -o '-h 127.0.0.1 -p 55432' -w start
```

To stop only this project’s cluster:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D D:/ZadeBirthday/.local/postgres/data -m fast -w stop
```

### 2. Backend

From the project root:

```powershell
python -m venv .venv
python -m pip --python .venv/Scripts/python.exe install -r backend/requirements-dev.lock.txt -e ./backend
cd backend
../.venv/Scripts/python.exe -m app.scripts.create_database
../.venv/Scripts/python.exe -m alembic upgrade head
../.venv/Scripts/python.exe -m app.scripts.seed_event
../.venv/Scripts/python.exe -m app.scripts.open_rsvp
../.venv/Scripts/python.exe -m app.scripts.create_organizer
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

If your Windows Python cannot bootstrap pip during `venv`, create the environment with `python -m venv --without-pip .venv`; the global pip `--python` command above can still install into it. The current workspace’s environment is already installed.

The event seed does not overwrite an existing event. Backend settings load the root `.env` regardless of the working directory.

### 3. Frontend

In a second terminal:

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173**. Vite forwards `/api` requests to FastAPI on port 8000. API docs: **http://127.0.0.1:8000/docs**.

If pnpm is not on PATH in the Codex runtime, use:

```powershell
& 'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' dev
```

## Verification

With PostgreSQL migrated and seeded:

```powershell
cd backend
../.venv/Scripts/python.exe -m pytest -q
../.venv/Scripts/python.exe -m alembic check
```

With FastAPI running:

```powershell
cd frontend
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser checks cover widths 320, 390, 820, and 1440, styled layout and horizontal overflow, validation, Back/close/reopen value preservation, all attendance statuses, saved confirmations, lost-response retries, server errors, pending-state protection, closed events, Maps, and calendar UTC times. Screenshots are written to `.local/screenshots`.

Browser integration tests create synthetic responses whose names start with `E2E Race Crew `. To remove only the recorded synthetic rows after a run, from the project root:

```powershell
.venv/Scripts/python.exe backend/tests/cleanup_browser.py
```

Cleanup requires both the exact recorded response UUID and the test-name prefix; other guest responses are preserved. Backend tests use PostgreSQL transactions and roll back their own records.

## Event and asset configuration

Event: Sunday, October 25, 2026, 3:00–7:00 PM, `Asia/Manila`; PlayTown Kids Cafe, San Juan City.

- Database event data is authoritative when available. Keep the static invitation copy in `index.html` and the fallback snapshot in `src/state/event.js` aligned if the event changes.
- Confirm the exact venue address and Google Maps pin before sharing; the current link is a venue search.
- Replace the monogram in `.photo-slot` in `index.html` with the approved photo and an appropriate alt description. The hero currently uses an explicit placeholder, not a real photo of Zade.
- Theme values are in `frontend/src/styles/tokens.css`. See `docs/design-system.md`.
- Production hosting must forward `/api` to FastAPI; the Vite development proxy is not a production reverse proxy. Serve built frontend files from `frontend/dist` and use HTTPS for a public deployment.

## RSVP behavior

- Contact numbers accept `09…`, `639…`, or `+639…` formats with spaces/dashes and are stored as `+639…`.
- Adults and kids each allow whole numbers from 0–20; an attending party needs at least one person.
- Declined responses always store zero adults and kids. Maybe counts are tentative and may be zero.
- Messages allow 200 Unicode code points, with a live counter and matching server rules.
- Drafts and retry keys stay in page memory, not local storage. Back navigation and closing/reopening preserve them; refreshing starts over. After success, reopening shows the saved confirmation instead of a new submission.
- Retries with the same normalized payload reuse an `Idempotency-Key`. The database uniqueness constraint prevents simultaneous retries from creating duplicate records. This protects retries within the current page session; it does not merge intentionally separate submissions or survive page refreshes.
- If a request fails, the form keeps its data and shows an error. Confirmation appears only after a valid successful API response.

## Organizer dashboard

Password login, revocable 12-hour sessions, automatically refreshed KPIs, separate confirmed/tentative headcounts, guest search/filter/pagination/details, message and statistics views, and full or filtered CSV downloads are implemented. The guest-list and export APIs require authentication; no public guest-list read route exists.

The production build includes both HTML entry points. This project has been verified locally; deployment remains a separate step.
