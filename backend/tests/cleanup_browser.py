"""Remove only known synthetic browser submissions recorded by the E2E suite."""
import json
from pathlib import Path
from uuid import UUID

from sqlalchemy import delete

from app.database import SessionLocal
from app.models import Rsvp


def cleanup():
    directory = Path(__file__).resolve().parents[2] / ".local" / "e2e-rsvps"
    count = 0
    for manifest in directory.glob("*.json"):
        response_id = UUID(json.loads(manifest.read_text())["id"])
        with SessionLocal.begin() as session:
            result = session.execute(delete(Rsvp).where(
                Rsvp.id == response_id, Rsvp.name.startswith("E2E Race Crew "),
            ))
            count += result.rowcount
        manifest.unlink()
    print(f"Removed {count} synthetic browser responses; other RSVPs preserved.")


if __name__ == "__main__":
    cleanup()
