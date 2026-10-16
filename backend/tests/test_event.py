from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_event_is_loaded_from_postgres():
    response = client.get("/api/v1/event")
    assert response.status_code == 200
    event = response.json()
    assert event["slug"] == "zade-turns-two"
    assert event["timezone"] == "Asia/Manila"
    assert event["starts_at"].startswith("2026-10-25")
    assert event["venue_name"] == "PlayTown Kids Cafe"
    assert isinstance(event["rsvp_open"], bool)


def test_database_readiness():
    assert client.get("/api/ready").json() == {"status": "ready", "database": "connected"}


def test_no_guest_collection_is_public():
    response = client.get("/api/v1/admin/rsvps")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_REQUIRED"
