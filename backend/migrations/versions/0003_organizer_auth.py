"""Private organizer accounts, revocable sessions, and durable login throttling."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("organizers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("username", sa.String(80), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(256), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table("organizer_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("organizer_id", sa.Uuid(), sa.ForeignKey("organizers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_organizer_sessions_organizer_id", "organizer_sessions", ["organizer_id"])
    op.create_index("ix_organizer_sessions_expires_at", "organizer_sessions", ["expires_at"])
    op.create_table("login_throttles",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("login_throttles")
    op.drop_table("organizer_sessions")
    op.drop_table("organizers")
