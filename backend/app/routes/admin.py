from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import ConfigDict
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Rsvp
from app.schemas.rsvp import RsvpResponse
from app.services.admin_service import event_id, export_csv, filtered_query, ordered, overview
from app.services.auth_service import require_csrf, require_session

router = APIRouter(prefix="/api/v1/admin", tags=["organizer dashboard"], dependencies=[Depends(require_session)])
Status = Literal["all", "attending", "not_attending", "maybe"]
Sort = Literal["newest", "oldest", "name"]


class GuestResponse(RsvpResponse):
    model_config = ConfigDict(from_attributes=True)
    relationship: str
    contact_number: str


@router.get("/overview")
def get_overview(session: Annotated[Session, Depends(get_session)]):
    return overview(session)


@router.get("/rsvps")
def guests(
    session: Annotated[Session, Depends(get_session)], search: str = Query("", max_length=100),
    status: Status = "all", sort: Sort = "newest", messages_only: bool = False,
    limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
):
    query = filtered_query(event_id(session), search, status, messages_only)
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    records = session.scalars(ordered(query, sort).limit(limit).offset(offset)).all()
    return {"items": [GuestResponse.model_validate(row) for row in records], "total": total, "limit": limit, "offset": offset}


@router.get("/rsvps/{response_id}", response_model=GuestResponse)
def guest(response_id: UUID, session: Annotated[Session, Depends(get_session)]):
    record = session.scalar(select(Rsvp).where(Rsvp.id == response_id, Rsvp.event_id == event_id(session)))
    if record is None:
        raise HTTPException(404, detail="This guest response could not be found.")
    return record


@router.delete("/rsvps/{response_id}", status_code=204, dependencies=[Depends(require_csrf)])
def delete_guest(response_id: UUID, session: Annotated[Session, Depends(get_session)]):
    removed = session.scalar(delete(Rsvp).where(
        Rsvp.id == response_id, Rsvp.event_id == event_id(session),
    ).returning(Rsvp.id))
    if removed is None:
        raise HTTPException(404, detail="This guest response has already been removed or could not be found.")
    session.commit()
    return Response(status_code=204)


@router.get("/export.csv")
def export(
    session: Annotated[Session, Depends(get_session)], search: str = Query("", max_length=100),
    status: Status = "all", sort: Sort = "newest", messages_only: bool = False,
):
    query = ordered(filtered_query(event_id(session), search, status, messages_only), sort)
    return Response(export_csv(session.scalars(query)), media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": 'attachment; filename="zade-birthday-guests.csv"', "Cache-Control": "no-store",
    })
