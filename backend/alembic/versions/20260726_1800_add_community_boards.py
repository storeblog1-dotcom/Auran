"""add community boards and notices"""

import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260726_community_boards"
down_revision = "20260726_dm_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "community_boards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("community_boards.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("is_anonymous", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_community_boards_slug", "community_boards", ["slug"])
    op.create_index("ix_community_boards_parent_id", "community_boards", ["parent_id"])
    op.create_table(
        "community_notices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("board_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("community_boards.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("posts", sa.Column("board_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("community_boards.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_posts_board_id", "posts", ["board_id"])
    anonymous_id, info_id = uuid.uuid4(), uuid.uuid4()
    boards = sa.table("community_boards", sa.column("id", postgresql.UUID(as_uuid=True)), sa.column("name", sa.String), sa.column("slug", sa.String), sa.column("is_anonymous", sa.Boolean), sa.column("is_active", sa.Boolean), sa.column("sort_order", sa.Integer))
    op.bulk_insert(boards, [
        {"id": anonymous_id, "name": "익명게시판", "slug": "anonymous", "is_anonymous": True, "is_active": True, "sort_order": 0},
        {"id": info_id, "name": "정보게시판", "slug": "info", "is_anonymous": False, "is_active": True, "sort_order": 1},
    ])
    op.execute(sa.text("UPDATE posts SET board_id = :board_id WHERE board_type = 'anonymous'").bindparams(board_id=anonymous_id))
    op.execute(sa.text("UPDATE posts SET board_id = :board_id WHERE board_type = 'info'").bindparams(board_id=info_id))


def downgrade() -> None:
    op.drop_index("ix_posts_board_id", table_name="posts")
    op.drop_column("posts", "board_id")
    op.drop_table("community_notices")
    op.drop_index("ix_community_boards_parent_id", table_name="community_boards")
    op.drop_index("ix_community_boards_slug", table_name="community_boards")
    op.drop_table("community_boards")
