from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models.event import Event
from app.schemas.event import EventResponse

router = APIRouter(prefix="/api/v1", tags=["event"])


@router.get("/event", response_model=EventResponse)
def get_event(session: Annotated[Session, Depends(get_session)]):
    event = session.scalar(select(Event).where(Event.slug == "zade-turns-two"))
    if event is None:
        raise HTTPException(status_code=404, detail="Event has not been configured yet.")
    return event
