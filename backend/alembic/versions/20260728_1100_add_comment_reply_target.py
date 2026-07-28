"""Persist the user targeted by a comment reply."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260728_comment_reply_target"
down_revision = "20260728_nickname_backfill"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "comments",
        sa.Column("reply_to_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "comments", sa.Column("reply_to_display_name", sa.String(length=50), nullable=True)
    )
    op.create_foreign_key(
        "fk_comments_reply_to_user_id_users",
        "comments",
        "users",
        ["reply_to_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_comments_reply_to_user_id", "comments", ["reply_to_user_id"], unique=False
    )
    op.execute(
        sa.text(
            "UPDATE comments AS child "
            "SET reply_to_user_id = parent.user_id, "
            "reply_to_display_name = COALESCE(target.nickname, target.username) "
            "FROM comments AS parent JOIN users AS target ON target.id = parent.user_id "
            "WHERE child.parent_id = parent.id "
            "AND child.reply_to_user_id IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_comments_reply_to_user_id", table_name="comments")
    op.drop_constraint(
        "fk_comments_reply_to_user_id_users", "comments", type_="foreignkey"
    )
    op.drop_column("comments", "reply_to_user_id")
    op.drop_column("comments", "reply_to_display_name")
