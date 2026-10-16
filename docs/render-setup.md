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

The start script applies all Alembic migrations, seeds missing event data, and creates a missing organizer from the environment secret before running Uvicorn. Existing accounts, passwords, responses, and event settings are preserved. Startup stops if setup fails; inspect the Render log without copying secrets into chat.

An existing organizer password can be reset interactively with `python -m app.scripts.create_organizer --set-password` in the backend directory. Changing ORGANIZER_PASSWORD alone does not reset an existing account.

After deploying, `/api/v1/event` should return 200. A 200 from `/api/ready` only proves database connectivity, not that migrations have been applied. A freshly seeded event keeps RSVPs closed until explicitly opened with `python -m app.scripts.open_rsvp`.

The allowlist includes GitHub Pages and the localhost/127.0.0.1 Vite previews on port 5173. HTTPS deployment cookies use SameSite=None and Secure when SESSION_COOKIE_SECURE is true. Browser third-party-cookie restrictions may still affect sessions across GitHub Pages and Render; a shared-site hosting setup can avoid that browser restriction.
