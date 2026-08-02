"""add direct conversation read state

Revision ID: 20260802_direct_read_state
Revises: 20260730_verified_youtube
"""

from alembic import op
import sqlalchemy as sa


revision = "20260802_direct_read_state"
down_revision = "20260730_verified_youtube"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "direct_conversation_members",
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_direct_messages_conversation_created_at",
        "direct_messages",
        ["conversation_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_direct_messages_conversation_created_at",
        table_name="direct_messages",
    )
    op.drop_column("direct_conversation_members", "last_read_at")
