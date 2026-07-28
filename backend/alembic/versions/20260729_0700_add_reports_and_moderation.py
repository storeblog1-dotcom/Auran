"""Add durable reporting, user hiding and moderation state."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260729_reports"
down_revision = "20260729_detail_media"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("moderation_hidden", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("comments", sa.Column("moderation_hidden", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_index("ix_posts_moderation_hidden", "posts", ["moderation_hidden"])
    op.create_index("ix_comments_moderation_hidden", "comments", ["moderation_hidden"])

    op.create_table(
        "reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("reporter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reason_code", sa.String(40), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), server_default="received", nullable=False),
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("reporter_ip", sa.String(45), nullable=True),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resolution_action", sa.String(40), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retention_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("legal_hold", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.UniqueConstraint("reporter_id", "target_type", "target_id", name="uq_reports_reporter_target"),
    )
    for column in ("reporter_id", "target_type", "target_id", "target_user_id", "reason_code", "status", "reviewer_id", "created_at", "retention_until"):
        op.create_index(f"ix_reports_{column}", "reports", [column])

    op.create_table(
        "hidden_content",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "target_type", "target_id", name="uq_hidden_content_user_target"),
    )
    op.create_index("ix_hidden_content_user_id", "hidden_content", ["user_id"])
    op.create_index("ix_hidden_content_target_id", "hidden_content", ["target_id"])

    op.execute(
        """
        INSERT INTO reports (
            id, reporter_id, target_type, target_id, target_user_id, reason_code,
            detail, status, priority, snapshot, created_at, updated_at,
            retention_until, legal_hold
        )
        SELECT pr.id, pr.reporter_id, 'post', pr.post_id, p.user_id, 'other',
               pr.reason, 'received', 0,
               jsonb_build_object(
                 'legacy', true, 'post_id', pr.post_id,
                 'display_number', p.display_number, 'title', p.title,
                 'caption', p.caption, 'board_type', p.board_type,
                 'author_id', p.user_id
               ),
               pr.created_at, pr.created_at,
               pr.created_at + interval '365 days', false
        FROM post_reports pr
        LEFT JOIN posts p ON p.id = pr.post_id
        ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("hidden_content")
    op.drop_table("reports")
    op.drop_index("ix_comments_moderation_hidden", table_name="comments")
    op.drop_index("ix_posts_moderation_hidden", table_name="posts")
    op.drop_column("comments", "moderation_hidden")
    op.drop_column("posts", "moderation_hidden")
