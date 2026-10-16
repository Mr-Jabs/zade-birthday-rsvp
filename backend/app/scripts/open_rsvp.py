"""Open the seeded event in the database selected by DATABASE_URL."""
from sqlalchemy import text

from app.database import engine

OPEN_RSVP_SQL = "UPDATE events SET rsvp_open = true WHERE slug = 'zade-turns-two';"
VERIFY_RSVP_SQL = "SELECT rsvp_open FROM events WHERE slug = 'zade-turns-two'"


def open_rsvp():
    with engine.begin() as connection:
        result = connection.execute(text(OPEN_RSVP_SQL))
        if result.rowcount != 1:
            raise RuntimeError("Seed the event before opening RSVPs.")
    # Read after committing, so successful startup confirms persisted availability.
    with engine.connect() as connection:
        if connection.scalar(text(VERIFY_RSVP_SQL)) is not True:
            raise RuntimeError("RSVP availability verification failed after committing the update.")
    print("RSVPs are now open for Zade's birthday. Verified rsvp_open=true after commit.")


if __name__ == "__main__":
    open_rsvp()
