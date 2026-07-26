"""add anonymous community board categories"""

import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260726_anonymous_categories"
down_revision = "20260726_community_boards"
branch_labels = None
depends_on = None


CHILD_BOARDS = [
    ("anonymous-worries", "고민상담", 1),
    ("anonymous-relationship", "연애/관계", 2),
    ("anonymous-daily", "일상", 3),
    ("anonymous-coming-out", "커밍아웃", 4),
]


def upgrade() -> None:
    bind = op.get_bind()
    anonymous_id = bind.execute(
        sa.text("SELECT id FROM community_boards WHERE slug = 'anonymous'")
    ).scalar_one_or_none()
    if anonymous_id is None:
        return

    boards = sa.table(
        "community_boards",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("slug", sa.String()),
        sa.column("parent_id", sa.Uuid()),
        sa.column("is_anonymous", sa.Boolean()),
        sa.column("is_active", sa.Boolean()),
        sa.column("sort_order", sa.Integer()),
    )
    for slug, name, sort_order in CHILD_BOARDS:
        exists = bind.execute(
            sa.text("SELECT 1 FROM community_boards WHERE slug = :slug"), {"slug": slug}
        ).scalar_one_or_none()
        if not exists:
            op.bulk_insert(
                boards,
                [{
                    "id": uuid.uuid4(),
                    "name": name,
                    "slug": slug,
                    "parent_id": anonymous_id,
                    "is_anonymous": True,
                    "is_active": True,
                    "sort_order": sort_order,
                }],
            )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM community_boards "
            "WHERE slug IN ('anonymous-worries', 'anonymous-relationship', 'anonymous-daily', 'anonymous-coming-out')"
        )
    )
