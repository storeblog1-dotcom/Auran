"""add verified YouTube metadata to posts

Revision ID: 20260730_verified_youtube
Revises: 20260730_direct_message_v2
"""

from alembic import op
import sqlalchemy as sa


revision = "20260730_verified_youtube"
down_revision = "20260730_direct_message_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("youtube_url", sa.String(length=255), nullable=True))
    op.add_column("posts", sa.Column("youtube_video_id", sa.String(length=11), nullable=True))
    op.add_column("posts", sa.Column("youtube_title", sa.String(length=500), nullable=True))
    op.add_column("posts", sa.Column("youtube_thumbnail_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("posts", "youtube_thumbnail_url")
    op.drop_column("posts", "youtube_title")
    op.drop_column("posts", "youtube_video_id")
    op.drop_column("posts", "youtube_url")
