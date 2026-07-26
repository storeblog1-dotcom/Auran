"""add signup identity and privacy fields"""

from alembic import op
import sqlalchemy as sa

revision = "20260726_signup_identity"
down_revision = "20260726_profile_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nickname", sa.String(length=50), nullable=True))
    op.create_index(op.f("ix_users_nickname"), "users", ["nickname"], unique=True)
    op.add_column("users", sa.Column("sexual_orientations", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("profile_visibility", sa.String(length=20), nullable=False, server_default="mutual_followers"))


def downgrade() -> None:
    op.drop_column("users", "profile_visibility")
    op.drop_column("users", "sexual_orientations")
    op.drop_index(op.f("ix_users_nickname"), table_name="users")
    op.drop_column("users", "nickname")
