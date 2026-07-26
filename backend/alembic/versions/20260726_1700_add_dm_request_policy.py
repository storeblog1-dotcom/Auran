"""add direct-message request policy"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260726_dm_requests"
down_revision = "20260726_signup_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "allow_message_requests",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "chat_rooms",
        sa.Column(
            "request_status",
            sa.String(length=20),
            nullable=False,
            server_default="ACCEPTED",
        ),
    )
    op.add_column(
        "chat_rooms",
        sa.Column(
            "request_sender_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_chat_rooms_request_sender_id_users",
        "chat_rooms",
        "users",
        ["request_sender_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_chat_rooms_request_status"),
        "chat_rooms",
        ["request_status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_chat_rooms_request_sender_id"),
        "chat_rooms",
        ["request_sender_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_chat_rooms_request_sender_id"), table_name="chat_rooms")
    op.drop_index(op.f("ix_chat_rooms_request_status"), table_name="chat_rooms")
    op.drop_constraint(
        "fk_chat_rooms_request_sender_id_users",
        "chat_rooms",
        type_="foreignkey",
    )
    op.drop_column("chat_rooms", "request_sender_id")
    op.drop_column("chat_rooms", "request_status")
    op.drop_column("users", "allow_message_requests")
