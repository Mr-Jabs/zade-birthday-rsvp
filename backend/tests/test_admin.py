import csv
import hashlib
import io
from collections import Counter
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import engine, get_session
from app.main import app
from app.models import Event, Organizer, OrganizerSession, Rsvp
from app.services.auth_service import COOKIE_NAME, hash_password, verify_password


@pytest.fixture
def admin_context():
    with engine.connect() as connection:
        outer = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
        username = "test-organizer-" + uuid4().hex
        password = "test-only-strong-password"
        organizer = Organizer(username=username, password_hash=hash_password(password))
        session.add(organizer)
        event = session.scalar(select(Event).where(Event.slug == "zade-turns-two"))
        prefix = "Admin Test " + uuid4().hex
        records = [Rsvp(event_id=event.id, idempotency_key=uuid4(), name=f"{prefix} {index:02}", relationship="family", contact_number="+639171234567", attendance=status, adults=adults, kids=kids, message=message) for index, (status, adults, kids, message) in enumerate([
            ("attending", 2, 3, "Happy birthday!"), ("not_attending", 0, 0, ""), ("maybe", 1, 2, '=HYPERLINK("example", "test")'),
        ])]
        session.add_all(records)
        session.commit()
        def test_session():
            yield session
        app.dependency_overrides[get_session] = test_session
        try:
            with TestClient(app, headers={"Origin": "http://testserver"}) as client:
                yield client, session, organizer, password, prefix, records
        finally:
            app.dependency_overrides.clear()
            session.close()
            outer.rollback()


def login(context):
    client, _, organizer, password, _, _ = context
    result = client.post("/api/v1/auth/login", json={"username": organizer.username, "password": password})
    assert result.status_code == 200
    return result


@pytest.mark.parametrize("path", ["/admin/overview", "/admin/rsvps", "/admin/export.csv", "/admin/rsvps/" + str(uuid4()), "/auth/me"])
def test_private_endpoints_require_session(admin_context, path):
    client = admin_context[0]
    response = client.get("/api/v1" + path)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
    assert "contact_number" not in response.text


def test_password_hash_cookie_session_and_logout(admin_context):
    client, session, organizer, password, _, _ = admin_context
    assert password not in organizer.password_hash
    assert verify_password(password, organizer.password_hash)
    assert not verify_password("wrong", organizer.password_hash)
    response = login(admin_context)
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api" in cookie
    token = client.cookies.get(COOKIE_NAME)
    record = session.get(OrganizerSession, hashlib.sha256(token.encode()).hexdigest())
    assert record and record.token_hash != token
    me = client.get("/api/v1/auth/me").json()
    assert me["username"] == organizer.username
    assert client.post("/api/v1/auth/logout").status_code == 403
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": me["csrf_token"], "Origin": "https://untrusted.example"}).status_code == 403
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": me["csrf_token"]}).status_code == 204
    assert client.get("/api/v1/admin/overview", headers={"Cookie": f"{COOKIE_NAME}={token}"}).status_code == 401


def test_bad_credentials_and_durable_throttle(admin_context):
    client, _, organizer, _, _, _ = admin_context
    for _ in range(10):
        assert client.post("/api/v1/auth/login", json={"username": organizer.username, "password": "wrong"}).status_code == 401
    response = client.post("/api/v1/auth/login", json={"username": organizer.username, "password": "wrong"})
    assert response.status_code == 429
    assert response.headers["retry-after"] == "900"


def test_login_rejects_untrusted_origin(admin_context):
    client, _, organizer, password, _, _ = admin_context
    assert client.post("/api/v1/auth/login", json={"username": organizer.username, "password": password}, headers={"Origin": "https://untrusted.example"}).status_code == 403


def test_expired_and_inactive_accounts_lose_access(admin_context):
    client, session, organizer, _, _, _ = admin_context
    login(admin_context)
    token = client.cookies.get(COOKIE_NAME)
    record = session.get(OrganizerSession, hashlib.sha256(token.encode()).hexdigest())
    record.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    session.commit()
    assert client.get("/api/v1/admin/export.csv").status_code == 401
    login(admin_context)
    organizer.is_active = False
    session.commit()
    assert client.get("/api/v1/admin/rsvps").status_code == 401


def test_secure_cookie_configuration(admin_context, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "session_cookie_secure", True)
    assert "Secure" in login(admin_context).headers["set-cookie"]


def test_metrics_distinguish_responses_confirmed_and_tentative_people(admin_context):
    client, session, _, _, _, records = admin_context
    login(admin_context)
    data = client.get("/api/v1/admin/overview").json()
    all_records = session.scalars(select(Rsvp).where(Rsvp.event_id == records[0].event_id)).all()
    counts = Counter(row.attendance for row in all_records)
    assert data["total_responses"] == len(all_records)
    assert data["attending"] == counts["attending"]
    assert data["not_attending"] == counts["not_attending"]
    assert data["maybe"] == counts["maybe"]
    assert data["confirmed_kids"] == sum(row.kids for row in all_records if row.attendance == "attending")
    assert data["confirmed_guests"] == sum(row.adults + row.kids for row in all_records if row.attendance == "attending")
    assert data["tentative_guests"] == sum(row.adults + row.kids for row in all_records if row.attendance == "maybe")


def test_search_filters_details_and_literal_wildcards(admin_context):
    client, session, _, _, prefix, records = admin_context
    login(admin_context)
    data = client.get("/api/v1/admin/rsvps", params={"search": prefix, "status": "maybe"}).json()
    assert data["total"] == 1 and data["items"][0]["id"] == str(records[2].id)
    detail = client.get(f"/api/v1/admin/rsvps/{records[0].id}").json()
    assert detail["contact_number"] == "+639171234567"
    assert detail["message"] == "Happy birthday!"
    assert "idempotency_key" not in detail
    assert client.get("/api/v1/admin/rsvps", params={"search": prefix, "messages_only": True}).json()["total"] == 2
    records[0].name += " 100%"
    session.commit()
    result = client.get("/api/v1/admin/rsvps", params={"search": "%"}).json()
    assert any(row["id"] == str(records[0].id) for row in result["items"])
    assert all("%" in row["name"] or "%" in row["contact_number"] for row in result["items"])
    assert client.get(f"/api/v1/admin/rsvps/{uuid4()}").status_code == 404


def test_export_all_pages_filtering_escaping_and_formula_protection(admin_context):
    client, session, _, _, prefix, records = admin_context
    for index in range(28):
        session.add(Rsvp(event_id=records[0].event_id, idempotency_key=uuid4(), name=f"{prefix} extra {index}", relationship="friend", contact_number="+639171234567", attendance="attending", adults=1, kids=0, message='A comma, a quote " and\na newline'))
    records[0].message = '  =HYPERLINK("untrusted")'
    session.commit()
    login(admin_context)
    listing = client.get("/api/v1/admin/rsvps", params={"search": prefix, "limit": 25}).json()
    assert len(listing["items"]) == 25 and listing["total"] == 31
    response = client.get("/api/v1/admin/export.csv", params={"search": prefix})
    assert response.status_code == 200
    assert response.text.startswith("\ufeff")
    assert "attachment" in response.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(response.text.lstrip("\ufeff"))))
    assert len(rows) == 31
    assert all(row["Contact Number"] == "'+639171234567" for row in rows)
    assert any(row["Message"].startswith("'  =") for row in rows)
    assert any(row["Message"] == 'A comma, a quote " and\na newline' for row in rows)
    filtered = client.get("/api/v1/admin/export.csv", params={"search": prefix, "status": "maybe"})
    assert len(list(csv.DictReader(io.StringIO(filtered.text.lstrip("\ufeff"))))) == 1
    assert all(row["Submitted At (PHT)"].endswith("+08:00") for row in rows)
