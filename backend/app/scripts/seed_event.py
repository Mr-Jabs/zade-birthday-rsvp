from datetime import datetime

from sqlalchemy import select

from app.database import SessionLocal
from app.models.event import Event


def seed_event():
    with SessionLocal.begin() as session:
        existing = session.scalar(select(Event).where(Event.slug == "zade-turns-two"))
        if existing:
            print("Event already exists; preserving its current values.")
            return
        session.add(Event(
            slug="zade-turns-two",
            title="Zade’s Monster Truck Birthday Bash!",
            celebrant_name="Zade",
            starts_at=datetime.fromisoformat("2026-10-25T15:00:00+08:00"),
            ends_at=datetime.fromisoformat("2026-10-25T19:00:00+08:00"),
            timezone="Asia/Manila",
            venue_name="PlayTown Kids Cafe",
            venue_address="San Juan City, Metro Manila",
            maps_url="https://www.google.com/maps/search/?api=1&query=PlayTown+Kids+Cafe+San+Juan+City",
            reminders=["Bring non-slip socks for the little racers so they’re ready to play!"],
            rsvp_open=False,
        ))
    print("Zade's event is ready.")


if __name__ == "__main__":
    seed_event()
