"""Create RSVP storage with party constraints and retry protection."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rsvps",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("relationship", sa.String(30), nullable=False),
        sa.Column("contact_number", sa.String(13), nullable=False),
        sa.Column("attendance", sa.String(20), nullable=False),
        sa.Column("adults", sa.SmallInteger(), nullable=False),
        sa.Column("kids", sa.SmallInteger(), nullable=False),
        sa.Column("message", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("event_id", "idempotency_key", name="uq_rsvp_event_submission"),
        sa.CheckConstraint("attendance IN ('attending', 'not_attending', 'maybe')", name="ck_rsvp_attendance"),
        sa.CheckConstraint("relationship IN ('family', 'friend', 'parents_friend', 'other')", name="ck_rsvp_relationship"),
        sa.CheckConstraint("adults BETWEEN 0 AND 20 AND kids BETWEEN 0 AND 20", name="ck_rsvp_counts"),
        sa.CheckConstraint("attendance != 'not_attending' OR (adults = 0 AND kids = 0)", name="ck_rsvp_declined_counts"),
        sa.CheckConstraint("attendance != 'attending' OR adults + kids > 0", name="ck_rsvp_attending_count"),
    )
    op.create_index("ix_rsvps_event_created", "rsvps", ["event_id", "created_at"])
    op.create_index("ix_rsvps_event_attendance", "rsvps", ["event_id", "attendance"])


def downgrade():
    op.drop_table("rsvps")
