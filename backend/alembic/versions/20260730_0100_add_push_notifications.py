"""add Expo push tokens and delivery tracking

Revision ID: 20260730_push_notifications
Revises: 20260729_default_boards
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260730_push_notifications"
down_revision = "20260729_default_boards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expo_push_token", sa.String(length=255), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("app_version", sa.String(length=32), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("expo_push_token"),
        sa.UniqueConstraint(
            "user_id",
            "device_id",
            name="uq_push_token_user_device",
        ),
    )
    op.create_index("ix_push_tokens_user_id", "push_tokens", ["user_id"])
    op.create_index(
        "ix_push_tokens_expo_push_token",
        "push_tokens",
        ["expo_push_token"],
        unique=True,
    )
    op.create_index("ix_push_tokens_is_active", "push_tokens", ["is_active"])

    op.create_table(
        "push_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("push_token_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("notification_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("expo_ticket_id", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.String(length=24),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            ["notifications.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["push_token_id"],
            ["push_tokens.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("expo_ticket_id"),
    )
    op.create_index(
        "ix_push_deliveries_push_token_id",
        "push_deliveries",
        ["push_token_id"],
    )
    op.create_index(
        "ix_push_deliveries_notification_id",
        "push_deliveries",
        ["notification_id"],
    )
    op.create_index(
        "ix_push_deliveries_expo_ticket_id",
        "push_deliveries",
        ["expo_ticket_id"],
        unique=True,
    )
    op.create_index(
        "ix_push_deliveries_status",
        "push_deliveries",
        ["status"],
    )
    op.create_index(
        "ix_push_deliveries_created_at",
        "push_deliveries",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_table("push_deliveries")
    op.drop_table("push_tokens")
