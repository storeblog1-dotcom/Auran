"""Add immutable administrator-facing content numbers and backfill existing rows."""
from alembic import op
import sqlalchemy as sa

revision = "20260729_content_display_numbers"
down_revision = "20260728_audit_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("display_number", sa.Integer(), nullable=True))
    op.create_index("ix_posts_display_number", "posts", ["display_number"], unique=True)
    op.add_column("comments", sa.Column("display_number", sa.Integer(), nullable=True))
    op.execute("CREATE SEQUENCE post_display_number_seq")
    op.execute("CREATE SEQUENCE comment_display_number_seq")
    op.execute("UPDATE posts SET display_number = nextval('post_display_number_seq') WHERE display_number IS NULL")
    op.execute("UPDATE comments SET display_number = nextval('comment_display_number_seq') WHERE display_number IS NULL")
    op.execute("ALTER TABLE posts ALTER COLUMN display_number SET DEFAULT nextval('post_display_number_seq')")
    op.execute("ALTER TABLE comments ALTER COLUMN display_number SET DEFAULT nextval('comment_display_number_seq')")
    op.alter_column("posts", "display_number", nullable=False)
    op.alter_column("comments", "display_number", nullable=False)


def downgrade() -> None:
    op.drop_index("ix_posts_display_number", table_name="posts")
    op.drop_column("posts", "display_number")
    op.drop_column("comments", "display_number")
    op.execute("DROP SEQUENCE comment_display_number_seq")
    op.execute("DROP SEQUENCE post_display_number_seq")
