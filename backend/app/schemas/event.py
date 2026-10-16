from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    title: str
    celebrant_name: str
    starts_at: datetime
    ends_at: datetime
    timezone: str
    venue_name: str
    venue_address: str
    maps_url: str
    reminders: list[str]
    rsvp_open: bool
