"""Add a seven-day withdrawal grace period and 365-day retention cap."""

from alembic import op
import sqlalchemy as sa


revision = "20260729_withdrawal_grace"
down_revision = "20260729_content_retention"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "withdrawn_accounts",
        "withdrawn_at",
        new_column_name="requested_at",
    )
    op.add_column(
        "withdrawn_accounts",
        sa.Column("cancelable_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "withdrawn_accounts",
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "withdrawn_accounts",
        sa.Column(
            "legal_hold",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "withdrawn_accounts",
        sa.Column("personal_data_purged_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        UPDATE withdrawn_accounts
        SET cancelable_until = requested_at,
            finalized_at = requested_at,
            retention_until = LEAST(
                retention_until,
                requested_at + interval '365 days'
            )
        """
    )
    op.alter_column("withdrawn_accounts", "cancelable_until", nullable=False)
    op.create_index(
        "ix_withdrawn_accounts_cancelable_until",
        "withdrawn_accounts",
        ["cancelable_until"],
    )
    op.create_index(
        "ix_withdrawn_accounts_retention_until",
        "withdrawn_accounts",
        ["retention_until"],
    )

    op.execute(
        """
        UPDATE audit_events
        SET retention_until = LEAST(
            retention_until,
            created_at + interval '365 days'
        )
        """
    )
    op.execute(
        """
        UPDATE post_revisions
        SET retention_until = LEAST(
            retention_until,
            event_at + interval '365 days'
        )
        """
    )
    op.execute(
        """
        UPDATE comment_revisions
        SET retention_until = LEAST(
            retention_until,
            event_at + interval '365 days'
        )
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_withdrawn_accounts_retention_until",
        table_name="withdrawn_accounts",
    )
    op.drop_index(
        "ix_withdrawn_accounts_cancelable_until",
        table_name="withdrawn_accounts",
    )
    op.drop_column("withdrawn_accounts", "personal_data_purged_at")
    op.drop_column("withdrawn_accounts", "legal_hold")
    op.drop_column("withdrawn_accounts", "finalized_at")
    op.drop_column("withdrawn_accounts", "cancelable_until")
    op.alter_column(
        "withdrawn_accounts",
        "requested_at",
        new_column_name="withdrawn_at",
    )
