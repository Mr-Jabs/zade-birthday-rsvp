from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Rsvp(Base):
    __tablename__ = "rsvps"
    __table_args__ = (
        UniqueConstraint("event_id", "idempotency_key", name="uq_rsvp_event_submission"),
        CheckConstraint("attendance IN ('attending', 'not_attending', 'maybe')", name="ck_rsvp_attendance"),
        CheckConstraint("relationship IN ('family', 'friend', 'parents_friend', 'other')", name="ck_rsvp_relationship"),
        CheckConstraint("adults BETWEEN 0 AND 20 AND kids BETWEEN 0 AND 20", name="ck_rsvp_counts"),
        CheckConstraint("attendance != 'not_attending' OR (adults = 0 AND kids = 0)", name="ck_rsvp_declined_counts"),
        CheckConstraint("attendance != 'attending' OR adults + kids > 0", name="ck_rsvp_attending_count"),
        Index("ix_rsvps_event_created", "event_id", "created_at"),
        Index("ix_rsvps_event_attendance", "event_id", "attendance"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("events.id", ondelete="RESTRICT"))
    idempotency_key: Mapped[UUID] = mapped_column()
    name: Mapped[str] = mapped_column(String(100))
    relationship: Mapped[str] = mapped_column(String(30))
    contact_number: Mapped[str] = mapped_column(String(13))
    attendance: Mapped[str] = mapped_column(String(20))
    adults: Mapped[int] = mapped_column(SmallInteger)
    kids: Mapped[int] = mapped_column(SmallInteger)
    message: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
