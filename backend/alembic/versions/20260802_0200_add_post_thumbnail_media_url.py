"""add post thumbnail media url

Revision ID: 20260802_post_thumbnail
Revises: 20260802_direct_read_state
"""

from alembic import op
import sqlalchemy as sa


revision = "20260802_post_thumbnail"
down_revision = "20260802_direct_read_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "post_media",
        sa.Column("thumbnail_media_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("post_media", "thumbnail_media_url")
