"""add default child board for each community board

Revision ID: 20260729_default_boards
Revises: 20260729_reports
"""

import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260729_default_boards"
down_revision = "20260729_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "community_boards",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    bind = op.get_bind()
    parents = bind.execute(
        sa.text("SELECT id, slug, is_anonymous FROM community_boards WHERE parent_id IS NULL")
    ).mappings().all()

    for parent in parents:
        common_id = bind.execute(
            sa.text(
                "SELECT id FROM community_boards "
                "WHERE parent_id = :parent_id AND name = '공통' "
                "ORDER BY sort_order, created_at LIMIT 1"
            ),
            {"parent_id": parent["id"]},
        ).scalar_one_or_none()
        if common_id is None:
            common_id = uuid.uuid4()
            common_slug = f"{parent['slug'][:64]}-common-{str(parent['id']).replace('-', '')[:8]}"
            bind.execute(
                sa.text(
                    "INSERT INTO community_boards "
                    "(id, name, slug, parent_id, is_anonymous, is_default, is_active, sort_order) "
                    "VALUES (:id, '공통', :slug, :parent_id, :is_anonymous, true, true, 0)"
                ),
                {
                    "id": common_id,
                    "slug": common_slug,
                    "parent_id": parent["id"],
                    "is_anonymous": parent["is_anonymous"],
                },
            )
        else:
            bind.execute(
                sa.text("UPDATE community_boards SET is_default = true, is_active = true WHERE id = :id"),
                {"id": common_id},
            )
        # Posts previously stored on the top-level board become common posts.
        bind.execute(
            sa.text("UPDATE posts SET board_id = :common_id WHERE board_id = :parent_id"),
            {"common_id": common_id, "parent_id": parent["id"]},
        )

    op.alter_column("community_boards", "is_default", server_default=None)


def downgrade() -> None:
    op.drop_column("community_boards", "is_default")
