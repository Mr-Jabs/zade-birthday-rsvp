# Event and RSVP API

## GET /api/v1/event

Reads the seeded `zade-turns-two` event from PostgreSQL. Returns `id`, `slug`, `title`, `celebrant_name`, `starts_at`, `ends_at`, `timezone`, `venue_name`, `venue_address`, `maps_url`, `reminders`, and `rsvp_open`.

Times are timezone-aware ISO 8601 values. PostgreSQL may return them in UTC; clients must format using the `timezone` field (`Asia/Manila`).

`rsvp_open` controls new submissions. A fresh seed starts closed; run `python -m app.scripts.open_rsvp` when ready. The current local event is open. A missing event returns 404. A failed database operation returns 503 with a public error message and no connection details.

```json
{
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "We couldn’t reach the party desk. Please try again shortly."
  }
}
```

## Health

- `GET /api/health`: application liveness; does not query the database.
- `GET /api/ready`: executes `SELECT 1`; returns database connectivity or 503.
- Readiness indicates connectivity, not whether event configuration exists; check `/api/v1/event` after setup.

## Storage

`events` has a UUID primary key, a unique indexed slug, timezone-aware timestamps, JSONB reminders, a closed-by-default RSVP flag, and an end-after-start check constraint. Migrations manage schema changes; seeding inserts only if the event does not already exist.

## POST /api/v1/rsvp

Requires `Content-Type: application/json` and a UUID `Idempotency-Key` header. The event is resolved by its configured slug on the server.

```json
{
  "name": "Juan Dela Cruz",
  "relationship": "family",
  "contact_number": "0917 123 4567",
  "attendance": "attending",
  "adults": 2,
  "kids": 1,
  "message": "Happy birthday, Zade!"
}
```

Rules:

- `name`: trimmed, 2–100 characters; control characters rejected.
- `relationship`: `family`, `friend`, `parents_friend`, or `other`.
- `contact_number`: Philippine mobile number, normalized to `+639…`.
- `attendance`: `attending`, `not_attending`, or `maybe`.
- `adults`, `kids`: strict integers, 0–20 each. Booleans and fractional values are rejected.
- Attending requires at least one person. Declined counts are normalized to zero. Maybe allows zero tentative counts.
- `message`: optional, defaults to empty; trimmed, up to 200 Unicode code points; control characters rejected except line breaks and tabs. Stored as text and rendered through text-safe DOM APIs.
- Unknown JSON fields are rejected.

Returns 201 for a new record, 200 for a replay of the same normalized payload/key. Both return `id`, `name`, `attendance`, `adults`, `kids`, `message`, and `created_at` with `Cache-Control: no-store`. Contact number and retry key are not returned.

Failures:

- 400 `VALIDATION_ERROR`: structured `fields` errors such as `name`, `contact_number`, `adults`, or `party` for cross-field counts.
- 409 `RSVP_CLOSED`: new submissions are disabled.
- 409 `SUBMISSION_KEY_CONFLICT`: the same key was used with different normalized data.
- 503 `DATABASE_UNAVAILABLE`: retry using the same key and payload.

A unique database constraint on `(event_id, idempotency_key)` and PostgreSQL `ON CONFLICT` resolve racing retries. Replaying an existing response remains possible after the event closes. A new key represents a separate response; contact numbers are not unique because family members may share them.

The `rsvps` table has UUID identifiers, an event foreign key, attendance/relationship/count check constraints, and event/date and event/status indexes. There is no public guest-list read route. Protected organizer endpoints, session authentication, and CSV export are documented in [organizer-dashboard.md](organizer-dashboard.md).
