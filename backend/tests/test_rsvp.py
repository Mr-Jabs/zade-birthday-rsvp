from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import engine, get_session
from app.main import app
from app.models import Event, Rsvp


@pytest.fixture
def rsvp_client():
    # Real PostgreSQL, isolated transaction: route commits release only savepoints.
    with engine.connect() as connection:
        outer = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
        event = session.scalar(select(Event).where(Event.slug == "zade-turns-two"))
        event.rsvp_open = True
        session.commit()

        def test_session():
            yield session

        app.dependency_overrides[get_session] = test_session
        try:
            with TestClient(app) as client:
                yield client, session, event
        finally:
            app.dependency_overrides.clear()
            session.close()
            outer.rollback()


def payload(**changes):
    return {
        "name": "  Test Race Crew  ", "relationship": "family", "contact_number": "0917 123 4567",
        "attendance": "attending", "adults": 2, "kids": 1, "message": "Happy birthday, Zade! 🎉", **changes,
    }


def send(client, body, key=None):
    return client.post("/api/v1/rsvp", json=body, headers={"Idempotency-Key": str(key or uuid4())})


def test_saves_normalized_rsvp_without_exposing_contact(rsvp_client):
    client, session, _ = rsvp_client
    result = send(client, payload())
    assert result.status_code == 201
    body = result.json()
    assert body["name"] == "Test Race Crew"
    assert body["adults"] == 2 and body["kids"] == 1
    assert "contact_number" not in body and "idempotency_key" not in body
    saved = session.get(Rsvp, body["id"])
    assert saved.contact_number == "+639171234567"
    assert saved.message.endswith("🎉")


@pytest.mark.parametrize("attendance,adults,kids", [("not_attending", 0, 0), ("maybe", 2, 1)])
def test_attendance_semantics(rsvp_client, attendance, adults, kids):
    client, _, _ = rsvp_client
    result = send(client, payload(attendance=attendance))
    assert result.status_code == 201
    assert (result.json()["adults"], result.json()["kids"]) == (adults, kids)


def test_retry_and_key_conflict(rsvp_client):
    client, session, _ = rsvp_client
    key = uuid4()
    first = send(client, payload(), key)
    replay = send(client, payload(contact_number="+63 917 123 4567"), key)
    assert first.status_code == 201 and replay.status_code == 200
    assert first.json() == replay.json()
    assert session.scalar(select(func.count()).select_from(Rsvp).where(Rsvp.idempotency_key == key)) == 1
    conflict = send(client, payload(kids=2), key)
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "SUBMISSION_KEY_CONFLICT"


@pytest.mark.parametrize("changes,field", [
    ({"name": " "}, "name"), ({"contact_number": "not a phone"}, "contact_number"),
    ({"relationship": "unknown"}, "relationship"), ({"attendance": "yes"}, "attendance"),
    ({"adults": -1}, "adults"), ({"kids": 21}, "kids"),
    ({"kids": 1.5}, "kids"), ({"adults": True}, "adults"),
    ({"adults": 0, "kids": 0}, "party"), ({"message": "🎉" * 201}, "message"),
    ({"message": "hello\x00"}, "message"),
])
def test_invalid_payload_cannot_be_saved(rsvp_client, changes, field):
    client, session, _ = rsvp_client
    before = session.scalar(select(func.count()).select_from(Rsvp))
    result = send(client, payload(**changes))
    assert result.status_code == 400
    assert field in result.json()["error"]["fields"]
    assert session.scalar(select(func.count()).select_from(Rsvp)) == before


def test_unicode_message_boundary(rsvp_client):
    client, _, _ = rsvp_client
    result = send(client, payload(message="🎉" * 200))
    assert result.status_code == 201
    assert len(result.json()["message"]) == 200


def test_closed_event_rejects_new_responses_but_recovers_saved_response(rsvp_client):
    client, session, event = rsvp_client
    key = uuid4()
    saved = send(client, payload(), key)
    event.rsvp_open = False
    session.commit()
    assert send(client, payload(), key).json() == saved.json()
    rejected = send(client, payload())
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "RSVP_CLOSED"


def test_requires_valid_submission_key(rsvp_client):
    client, _, _ = rsvp_client
    assert client.post("/api/v1/rsvp", json=payload()).status_code == 400
    assert client.post("/api/v1/rsvp", json=payload(), headers={"Idempotency-Key": "invalid"}).status_code == 400


def test_public_cannot_read_responses(rsvp_client):
    client, _, _ = rsvp_client
    assert client.get("/api/v1/rsvp").status_code == 405
