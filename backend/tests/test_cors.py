import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)


@pytest.mark.parametrize("path,method,headers", [
    ("/api/v1/auth/login", "POST", "content-type"),
    ("/api/v1/auth/logout", "POST", "x-csrf-token"),
    ("/api/v1/admin/rsvps", "GET", "content-type"),
    ("/api/v1/admin/rsvps/00000000-0000-0000-0000-000000000000", "DELETE", "x-csrf-token"),
])
def test_github_pages_credentialed_preflight(path, method, headers):
    response = client.options(path, headers={
        "Origin": "https://mr-jabs.github.io",
        "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": headers,
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://mr-jabs.github.io"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_configured_development_origin_still_allowed():
    origin = get_settings().frontend_origin.rstrip("/")
    response = client.get("/api/health", headers={"Origin": origin})
    assert response.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize("origin", ["http://127.0.0.1:5173", "http://localhost:5173"])
def test_local_preview_origin_allowed_when_production_is_configured(origin, monkeypatch):
    monkeypatch.setattr(get_settings(), "frontend_origin", "https://mr-jabs.github.io")
    assert origin in get_settings().allowed_frontend_origins
    response = client.get("/api/health", headers={"Origin": origin})
    assert response.headers["access-control-allow-origin"] == origin


def test_untrusted_origin_is_not_allowed():
    response = client.options("/api/v1/auth/login", headers={
        "Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
