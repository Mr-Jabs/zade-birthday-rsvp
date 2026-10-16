from uuid import uuid4

from app.models import Rsvp
from test_admin import admin_context, login  # Reuse the real-PostgreSQL rollback fixture.


def test_delete_requires_authentication_and_csrf(admin_context):
    client, session, _, _, _, records = admin_context
    path = f"/api/v1/admin/rsvps/{records[0].id}"
    assert client.delete(path).status_code == 401
    csrf = login(admin_context).json()["csrf_token"]
    assert client.delete(path).status_code == 403
    assert client.delete(path, headers={"X-CSRF-Token": "invalid"}).status_code == 403
    assert client.delete(path, headers={"X-CSRF-Token": csrf, "Origin": "https://untrusted.example"}).status_code == 403
    assert session.get(Rsvp, records[0].id) is not None


def test_delete_removes_only_selected_response_and_updates_totals_and_export(admin_context):
    client, session, _, _, prefix, records = admin_context
    csrf = login(admin_context).json()["csrf_token"]
    before = client.get("/api/v1/admin/overview").json()
    record_id = records[0].id
    response = client.delete(f"/api/v1/admin/rsvps/{record_id}", headers={"X-CSRF-Token": csrf})
    assert response.status_code == 204 and response.content == b""
    assert response.headers["cache-control"] == "no-store"
    assert session.get(Rsvp, record_id) is None
    assert session.get(Rsvp, records[1].id) is not None
    after = client.get("/api/v1/admin/overview").json()
    assert after["total_responses"] == before["total_responses"] - 1
    assert after["attending"] == before["attending"] - 1
    assert after["confirmed_guests"] == before["confirmed_guests"] - 5
    assert after["confirmed_kids"] == before["confirmed_kids"] - 3
    assert client.get(f"/api/v1/admin/rsvps/{record_id}").status_code == 404
    assert records[0].name not in client.get("/api/v1/admin/export.csv", params={"search": prefix}).text
    assert client.delete(f"/api/v1/admin/rsvps/{record_id}", headers={"X-CSRF-Token": csrf}).status_code == 404
    assert client.delete(f"/api/v1/admin/rsvps/{uuid4()}", headers={"X-CSRF-Token": csrf}).status_code == 404
