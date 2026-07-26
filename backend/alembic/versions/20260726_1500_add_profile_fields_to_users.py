"""add profile fields to users"""

from alembic import op
import sqlalchemy as sa

revision = "20260726_profile_fields"
down_revision = "71ef6b4dbc54"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("age", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("gender", sa.String(length=30), nullable=True))
    op.add_column("users", sa.Column("sexual_orientation", sa.String(length=30), nullable=True))
    op.add_column("users", sa.Column("height", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("body_type", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "body_type")
    op.drop_column("users", "height")
    op.drop_column("users", "sexual_orientation")
    op.drop_column("users", "gender")
    op.drop_column("users", "age")
