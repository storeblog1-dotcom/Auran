"""Add composite indexes for administrator user-content lookups."""

from alembic import op


revision = "20260729_admin_content_indexes"
down_revision = "20260729_signup_audit_backfill"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_posts_user_created_at",
        "posts",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_comments_user_created_at",
        "comments",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_comments_user_created_at", table_name="comments")
    op.drop_index("ix_posts_user_created_at", table_name="posts")
