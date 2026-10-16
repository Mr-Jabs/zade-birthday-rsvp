"""Apply migrations and prepare event/account data before starting the web server."""
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Organizer
from app.scripts.seed_event import seed_event
from app.services.auth_service import hash_password


def ensure_organizer(session, username, password):
    username = username.strip().lower()
    if not username or len(username) > 80:
        raise RuntimeError("ORGANIZER_USERNAME must contain 1–80 characters.")
    existing = session.scalar(select(Organizer).where(Organizer.username == username))
    if existing:
        print("Organizer account already exists; password preserved.")
        return existing
    if not password or not 12 <= len(password) <= 256:
        raise RuntimeError("Set ORGANIZER_PASSWORD to a secret of 12–256 characters in Render before the first start.")
    organizer = Organizer(username=username, password_hash=hash_password(password))
    session.add(organizer)
    session.flush()
    print("Organizer account created from the deployment secret.")
    return organizer


def main():
    backend = Path(__file__).resolve().parents[2]
    command.upgrade(Config(str(backend / "alembic.ini")), "head")
    seed_event()  # Idempotent: preserves an existing event and its RSVP-open setting.
    with SessionLocal.begin() as session:
        ensure_organizer(session, os.environ.get("ORGANIZER_USERNAME", "organizer"), os.environ.get("ORGANIZER_PASSWORD"))
    print("Database migrations and organizer setup complete.")


if __name__ == "__main__":
    main()
