"""Explicitly open this event once the submission engine is installed."""
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Event


def open_rsvp():
    with SessionLocal.begin() as session:
        event = session.scalar(select(Event).where(Event.slug == "zade-turns-two"))
        if event is None:
            raise RuntimeError("Seed the event before opening RSVPs.")
        event.rsvp_open = True
    print("RSVPs are now open for Zade's birthday.")


if __name__ == "__main__":
    open_rsvp()
