from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy.orm import Session

from app.database import get_session
from app.schemas.rsvp import RsvpCreate, RsvpResponse
from app.services.rsvp_service import submit_rsvp

router = APIRouter(prefix="/api/v1", tags=["rsvp"])


@router.post("/rsvp", response_model=RsvpResponse, status_code=201)
def create_rsvp(
    payload: RsvpCreate,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    idempotency_key: Annotated[UUID, Header(alias="Idempotency-Key")],
):
    saved, created = submit_rsvp(session, payload, idempotency_key)
    response.status_code = 201 if created else 200
    response.headers["Cache-Control"] = "no-store"
    return saved
