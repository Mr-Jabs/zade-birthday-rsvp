# Render backend startup and organizer login

The frontend uses the Render API, so a local organizer account does not automatically exist in production.

Configure the existing Render web service:

- Root Directory: `backend`
- Build Command: `pip install .`
- Start Command: `bash render-start.sh`

Environment variables:

```text
DATABASE_URL=<your Render PostgreSQL SQLAlchemy connection URL>
FRONTEND_ORIGIN=https://mr-jabs.github.io
SESSION_COOKIE_SECURE=true
ORGANIZER_USERNAME=organizer
ORGANIZER_PASSWORD=<set the intended password as a Render secret>
```

Use the existing working DATABASE_URL. Do not commit the password, connection URL, or `.env`. If configuring a fresh PostgreSQL connection, the installed SQLAlchemy driver is psycopg, so the driver form is `postgresql+psycopg://…`.

The start script applies all Alembic migrations, seeds missing event data, creates a missing organizer from the environment secret, and runs `python -m app.scripts.open_rsvp` before starting Uvicorn. Existing accounts, passwords, and responses are preserved. Every successful startup sets the event’s `rsvp_open` flag to true. Startup stops if setup or opening RSVPs fails; inspect the Render log without copying secrets into chat.

An existing organizer password can be reset interactively with `python -m app.scripts.create_organizer --set-password` in the backend directory. Changing ORGANIZER_PASSWORD alone does not reset an existing account.

After deploying, `/api/v1/event` should return 200 with `rsvp_open: true`. A 200 from `/api/ready` only proves database connectivity, not that migrations have been applied. The seed command alone still defaults a new event to closed; the start script now opens it automatically afterward.

The allowlist includes GitHub Pages and the localhost/127.0.0.1 Vite previews on port 5173. HTTPS deployment cookies use SameSite=None and Secure when SESSION_COOKIE_SECURE is true. Browser third-party-cookie restrictions may still affect sessions across GitHub Pages and Render; a shared-site hosting setup can avoid that browser restriction.

FastAPI also opens RSVPs during application startup, including direct Uvicorn launches. This intentionally reopens this event on each restart. It requires the seeded event and migrations to exist first; a failure prevents the server from accepting traffic. Guests recheck availability when they click RSVP, and event responses use `Cache-Control: no-store`.

`open_rsvp` executes `UPDATE events SET rsvp_open = true WHERE slug = 'zade-turns-two';` against the application's effective `DATABASE_URL`, commits, then verifies `rsvp_open=true` using a new connection. A missing event or failed verification stops startup. Render's process environment takes precedence over local `.env` configuration; running this locally with a localhost database URL changes only the local database.

If the live event still reports `rsvp_open: false` after a source update, check the deployed commit in Render (a GitHub push alone does not prove that deployment succeeded). Deploy the latest commit and confirm the deployment becomes **Live** and its startup logs include `RSVPs are now open for Zade's birthday.` Then check `https://zade-birthday-api.onrender.com/api/v1/event` for `rsvp_open: true`. If it remains false, inspect the service's deployed branch, commit, and database configuration. With a Render shell available, run `python -m app.scripts.open_rsvp` from the backend directory to open the event in that service's database immediately.
