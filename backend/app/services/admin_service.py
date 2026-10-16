import csv
import io
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.models import Event, Rsvp


def event_id(session: Session):
    value = session.scalar(select(Event.id).where(Event.slug == "zade-turns-two"))
    if value is None:
        raise HTTPException(404, detail="Event has not been configured yet.")
    return value


def filtered_query(event, search="", status="all", messages_only=False):
    query = select(Rsvp).where(Rsvp.event_id == event)
    if search.strip():
        escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.where(or_(Rsvp.name.ilike(pattern, escape="\\"), Rsvp.contact_number.ilike(pattern, escape="\\")))
    if status != "all":
        query = query.where(Rsvp.attendance == status)
    if messages_only:
        query = query.where(Rsvp.message != "")
    return query


def ordered(query, sort):
    if sort == "name":
        return query.order_by(func.lower(Rsvp.name), Rsvp.id)
    if sort == "oldest":
        return query.order_by(Rsvp.created_at, Rsvp.id)
    return query.order_by(Rsvp.created_at.desc(), Rsvp.id)


def overview(session: Session):
    def count(status):
        return func.count().filter(Rsvp.attendance == status)

    def total(column, status):
        return func.coalesce(func.sum(case((Rsvp.attendance == status, column), else_=0)), 0)

    row = session.execute(select(
        count("attending").label("attending"), count("not_attending").label("not_attending"),
        count("maybe").label("maybe"), func.count().label("total_responses"),
        total(Rsvp.adults, "attending").label("confirmed_adults"), total(Rsvp.kids, "attending").label("confirmed_kids"),
        total(Rsvp.adults, "maybe").label("tentative_adults"), total(Rsvp.kids, "maybe").label("tentative_kids"),
    ).where(Rsvp.event_id == event_id(session))).mappings().one()
    result = dict(row)
    result["confirmed_guests"] = result["confirmed_adults"] + result["confirmed_kids"]
    result["tentative_guests"] = result["tentative_adults"] + result["tentative_kids"]
    result["updated_at"] = datetime.now(ZoneInfo("Asia/Manila")).isoformat()
    return result


def csv_cell(value):
    text = str(value)
    # Neutralize formulas even when preceded by whitespace, and preserve phone numbers as text.
    if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n")):
        return "'" + text
    return text


def export_csv(records):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["Name", "Relationship", "Contact Number", "Attendance", "Adults", "Kids", "Message", "Submitted At (PHT)"])
    relationships = {"family": "Family", "friend": "Friend", "parents_friend": "Parent's friend", "other": "Other"}
    labels = {"attending": "Attending", "not_attending": "Not attending", "maybe": "Maybe"}
    for record in records:
        writer.writerow([csv_cell(value) for value in [
            record.name, relationships[record.relationship], record.contact_number, labels[record.attendance],
            record.adults, record.kids, record.message, record.created_at.astimezone(ZoneInfo("Asia/Manila")).isoformat(),
        ]])
    return "\ufeff" + output.getvalue()
