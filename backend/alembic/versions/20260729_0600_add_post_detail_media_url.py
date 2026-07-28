"""Add a separate detail-view image URL for post media."""

from alembic import op
import sqlalchemy as sa


revision = "20260729_detail_media"
down_revision = "20260729_withdrawal_grace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "post_media",
        sa.Column("detail_media_url", sa.String(length=500), nullable=True),
    )
    op.execute(
        "UPDATE post_media SET detail_media_url = media_url "
        "WHERE detail_media_url IS NULL"
    )


def downgrade() -> None:
    op.drop_column("post_media", "detail_media_url")
