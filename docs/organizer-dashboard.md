# Organizer dashboard

Open `http://127.0.0.1:5173/admin.html`. All data is protected on the backend; the HTML page itself is only a public login shell.

## Account setup

The local organizer account has already been created. Its username and generated password are in `.local/organizer-credentials.txt`, outside the public frontend and ignored by Git. No password is embedded in HTML, JavaScript, or committed configuration.

On a new installation, after migrating the database:

```powershell
cd backend
../.venv/Scripts/python.exe -m app.scripts.create_organizer
```

The command preserves an existing account. To set a custom password or reset the account password, use the hidden prompt:

```powershell
../.venv/Scripts/python.exe -m app.scripts.create_organizer --set-password
```

Use 12–256 characters. Resetting revokes that organizer’s sessions. The generated credentials file is only the initial bootstrap record; if you reset the password manually, its old password is no longer valid. There is no public registration or password-reset endpoint.

## Authentication

- Passwords use salted scrypt (`N=131072`, `r=8`, `p=1`), following [OWASP’s scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). The initial development hash format upgrades on successful login.
- Login creates a random, 12-hour session. PostgreSQL stores only its SHA-256 token hash; session tokens are never stored in local storage.
- The session cookie is HTTP-only, SameSite Strict, and scoped to `/api`. Set `SESSION_COOKIE_SECURE=true` when serving the app through HTTPS. Local HTTP development uses `false`.
- Login checks the Origin header. Logout additionally requires the session’s `X-CSRF-Token`. Cookie removal and database revocation happen together.
- Expired sessions and inactive accounts cannot access organizer APIs. Logout clears private data from the interface.
- Database-backed throttling allows 10 login attempts per source IP in a 15-minute window; a successful login clears that source’s failure window. Do not trust arbitrary forwarded-IP headers. Deployments behind a trusted reverse proxy should configure the ASGI server’s trusted proxy settings deliberately.
- Admin and authentication responses use `Cache-Control: no-store`.

## Views and headcounts

- **Overview:** attending, declined, maybe, and total **response** counts, recent responses, confirmed adult/kid/total headcounts, and a separate tentative headcount.
- **Guest list:** search name/contact, attendance filtering, newest/oldest/name sorting, 25-row server pagination, individual response details.
- **Delete:** each table row has a Delete action. A confirmation identifies the guest and defaults focus to Keep response. Confirmed deletion permanently removes that RSVP and message, then refreshes the list and headcounts. Failed requests retain the dialog for retry. The API requires a valid session, trusted origin, and CSRF token.
- **Messages:** nonempty birthday messages with the same search/filter controls. User text is rendered through DOM text APIs, including strings that resemble HTML.
- **Statistics:** attendance percentages plus confirmed and tentative adult/kid totals.

Every signed-in view refreshes from PostgreSQL every 15 seconds while the tab is visible. Refresh fetches immediately. Returning to the tab refreshes too. These are polling updates, not a WebSocket feed. Counts remain global to the event even while the table is filtered.

## CSV

**Export CSV** in the header/sidebar always downloads the full guest list across all pages. **Export this view** downloads every row matching the current guest/message filters, across all pages.

Columns: name, relationship, contact number, attendance, adults, kids, message, and submission time in PHT. CSV includes a UTF-8 BOM for Excel, standard quoting for commas/newlines, and apostrophe prefixes for possible spreadsheet formulas and international phone numbers. Downloads require a valid organizer session.

## Routes

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | Trusted origin, username/password |
| GET | `/api/v1/auth/me` | Session |
| POST | `/api/v1/auth/logout` | Session + trusted origin + CSRF |
| GET | `/api/v1/admin/overview` | Session |
| GET | `/api/v1/admin/rsvps` | Session |
| GET | `/api/v1/admin/rsvps/{uuid}` | Session |
| DELETE | `/api/v1/admin/rsvps/{uuid}` | Session + trusted origin + CSRF |
| GET | `/api/v1/admin/export.csv` | Session |

List and export accept `search`, `status=all|attending|not_attending|maybe`, `sort=newest|oldest|name`, and `messages_only`. The list additionally accepts `limit` (1–100) and `offset`. Invalid credentials/session return 401, origin/CSRF failures return 403, and throttling returns 429 with `Retry-After`.

## Testing

Backend integration tests use real PostgreSQL transactions and roll back their synthetic accounts/responses. Browser tests read the locally generated credentials file directly without logging its contents, and exercise live polling, navigation, filters, details, text escaping, CSV downloads, reload persistence, logout, and session expiry at four screen sizes. Browser-generated guest records are recorded for the existing cleanup script:

```powershell
.venv/Scripts/python.exe backend/tests/cleanup_browser.py
```

Both frontend entry points (`index.html`, `admin.html`) are included in the Vite production build. Configure production hosting to serve `admin.html` and proxy `/api` to FastAPI under the same HTTPS origin. This implementation has been verified locally; production deployment is not part of this change.
