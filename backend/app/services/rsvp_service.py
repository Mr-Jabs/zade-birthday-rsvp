from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Event, Rsvp
from app.schemas.rsvp import RsvpCreate


def _check_replay(existing: Rsvp, payload: RsvpCreate):
    if any(getattr(existing, key) != value for key, value in payload.model_dump().items()):
        raise HTTPException(status_code=409, detail={
            "code": "SUBMISSION_KEY_CONFLICT",
            "message": "This submission key was already used for different details. Please reopen the invitation and try again.",
        })
    return existing, False


def submit_rsvp(session: Session, payload: RsvpCreate, key: UUID):
    event = session.scalar(select(Event).where(Event.slug == "zade-turns-two"))
    if event is None:
        raise HTTPException(status_code=404, detail="Event has not been configured yet.")
    lookup = select(Rsvp).where(Rsvp.event_id == event.id, Rsvp.idempotency_key == key)
    existing = session.scalar(lookup)
    if existing:
        return _check_replay(existing, payload)
    if not event.rsvp_open:
        raise HTTPException(status_code=409, detail={
            "code": "RSVP_CLOSED",
            "message": "RSVPs are currently closed. Your details have not been submitted.",
        })

    # A database uniqueness constraint resolves simultaneous retries atomically.
    statement = insert(Rsvp).values(
        id=uuid4(), event_id=event.id, idempotency_key=key, **payload.model_dump(),
    ).on_conflict_do_nothing(constraint="uq_rsvp_event_submission").returning(Rsvp)
    saved = session.scalar(statement)
    if saved is None:
        saved = session.scalar(lookup)
        result = _check_replay(saved, payload)
    else:
        result = saved, True
    session.commit()
    return result
