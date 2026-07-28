"""Add immutable account and post audit records."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260728_audit_events"
down_revision = "20260728_comment_reply_target"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(40), nullable=False), sa.Column("target_type", sa.String(40)),
        sa.Column("target_id", sa.String(64)), sa.Column("ip_address", sa.String(45)), sa.Column("snapshot", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False))
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])
    op.create_index("ix_audit_events_user_id", "audit_events", ["user_id"])
    op.create_table("withdrawn_accounts",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("retention_until", sa.DateTime(timezone=True), nullable=False))


def downgrade() -> None:
    op.drop_table("withdrawn_accounts")
    op.drop_index("ix_audit_events_user_id", table_name="audit_events")
    op.drop_index("ix_audit_events_created_at", table_name="audit_events")
    op.drop_table("audit_events")
