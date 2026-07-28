"""Add three-year immutable post and comment revision retention."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260729_content_retention"
down_revision = "20260729_admin_content_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audit_events", sa.Column("revision_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("audit_events", sa.Column("retention_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("audit_events", sa.Column("legal_hold", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE audit_events SET retention_until = created_at + interval '3 years'")
    op.alter_column("audit_events", "retention_until", nullable=False)
    op.create_index("ix_audit_events_revision_id", "audit_events", ["revision_id"])
    op.create_index("ix_audit_events_retention_until", "audit_events", ["retention_until"])

    op.create_table(
        "post_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("lifecycle_event", sa.String(20), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("display_number", sa.Integer()),
        sa.Column("title", sa.String(255)),
        sa.Column("board_type", sa.String(50)),
        sa.Column("board_id", postgresql.UUID(as_uuid=True)),
        sa.Column("board_name", sa.String(100)),
        sa.Column("caption", sa.Text()),
        sa.Column("location", sa.String(255)),
        sa.Column("visibility", sa.String(20), nullable=False),
        sa.Column("media_manifest", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("source_created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_ip", sa.String(45)),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("retention_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("legal_hold", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("post_id", "version", name="uq_post_revisions_post_version"),
    )
    op.create_index("ix_post_revisions_post_id", "post_revisions", ["post_id"])
    op.create_index("ix_post_revisions_user_id", "post_revisions", ["user_id"])
    op.create_index("ix_post_revisions_event_at", "post_revisions", ["event_at"])
    op.create_index("ix_post_revisions_retention_until", "post_revisions", ["retention_until"])
    op.create_index("ix_post_revisions_lifecycle_event", "post_revisions", ["lifecycle_event"])
    op.create_index(
        "ix_post_revisions_user_lifecycle_created",
        "post_revisions",
        ["user_id", "lifecycle_event", "source_created_at"],
    )
    op.create_index(
        "ix_post_revisions_post_event",
        "post_revisions",
        ["post_id", "event_at"],
    )

    op.create_table(
        "comment_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("comment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("lifecycle_event", sa.String(20), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_display_number", sa.Integer()),
        sa.Column("display_number", sa.Integer()),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True)),
        sa.Column("parent_display_number", sa.Integer()),
        sa.Column("reply_to_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("reply_to_display_name", sa.String(50)),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_ip", sa.String(45)),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("retention_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("legal_hold", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("comment_id", "version", name="uq_comment_revisions_comment_version"),
    )
    op.create_index("ix_comment_revisions_comment_id", "comment_revisions", ["comment_id"])
    op.create_index("ix_comment_revisions_post_id", "comment_revisions", ["post_id"])
    op.create_index("ix_comment_revisions_user_id", "comment_revisions", ["user_id"])
    op.create_index("ix_comment_revisions_event_at", "comment_revisions", ["event_at"])
    op.create_index("ix_comment_revisions_retention_until", "comment_revisions", ["retention_until"])
    op.create_index("ix_comment_revisions_lifecycle_event", "comment_revisions", ["lifecycle_event"])
    op.create_index(
        "ix_comment_revisions_user_lifecycle_created",
        "comment_revisions",
        ["user_id", "lifecycle_event", "source_created_at"],
    )
    op.create_index(
        "ix_comment_revisions_post_event",
        "comment_revisions",
        ["post_id", "event_at"],
    )

    op.execute(
        """
        INSERT INTO post_revisions (
            id, post_id, version, lifecycle_event, user_id, display_number,
            title, board_type, board_id, board_name, caption, location, visibility,
            media_manifest, source_created_at, source_updated_at, event_at,
            retention_until, legal_hold
        )
        SELECT
            gen_random_uuid(), p.id, 1, 'baseline', p.user_id, p.display_number,
            p.title, p.board_type, p.board_id, cb.name, p.caption, p.location, p.visibility,
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', pm.id::text,
                            'media_url', pm.media_url,
                            'media_type', pm.media_type,
                            'order', pm."order"
                        )
                        ORDER BY pm."order"
                    )
                    FROM post_media pm
                    WHERE pm.post_id = p.id
                ),
                '[]'::jsonb
            ),
            p.created_at, p.updated_at, now(), now() + interval '3 years', false
        FROM posts p
        LEFT JOIN community_boards cb ON cb.id = p.board_id
        """
    )
    op.execute(
        """
        INSERT INTO comment_revisions (
            id, comment_id, post_id, version, lifecycle_event, user_id,
            post_display_number, display_number, parent_id, parent_display_number,
            reply_to_user_id, reply_to_display_name, content, source_created_at,
            source_updated_at, event_at, retention_until, legal_hold
        )
        SELECT
            gen_random_uuid(), c.id, c.post_id, 1, 'baseline', c.user_id,
            p.display_number, c.display_number, c.parent_id, parent.display_number,
            c.reply_to_user_id, c.reply_to_display_name, c.content, c.created_at,
            c.updated_at, now(), now() + interval '3 years', false
        FROM comments c
        JOIN posts p ON p.id = c.post_id
        LEFT JOIN comments parent ON parent.id = c.parent_id
        """
    )


def downgrade() -> None:
    op.drop_table("comment_revisions")
    op.drop_table("post_revisions")
    op.drop_index("ix_audit_events_retention_until", table_name="audit_events")
    op.drop_index("ix_audit_events_revision_id", table_name="audit_events")
    op.drop_column("audit_events", "legal_hold")
    op.drop_column("audit_events", "retention_until")
    op.drop_column("audit_events", "revision_id")
