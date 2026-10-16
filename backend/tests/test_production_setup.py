from uuid import uuid4

import pytest

from app.scripts.prepare_production import ensure_organizer
from app.services.auth_service import verify_password
from test_admin import admin_context


def test_production_bootstrap_creates_case_normalized_account(admin_context):
    session = admin_context[1]
    username = "BOOTSTRAP-" + uuid4().hex
    account = ensure_organizer(session, username, "test-only-bootstrap-password")
    assert account.username == username.lower()
    assert verify_password("test-only-bootstrap-password", account.password_hash)


def test_production_bootstrap_preserves_existing_password(admin_context):
    _, session, account, _, _, _ = admin_context
    before = account.password_hash
    assert ensure_organizer(session, account.username.upper(), "different-test-password").id == account.id
    assert account.password_hash == before


def test_production_bootstrap_requires_secret_for_new_account(admin_context):
    with pytest.raises(RuntimeError, match="ORGANIZER_PASSWORD"):
        ensure_organizer(admin_context[1], "bootstrap-" + uuid4().hex, None)
