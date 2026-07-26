"""add visibility to posts table

Revision ID: a1b2c3d4e5f6
Revises: f2b95a62d890
Create Date: 2026-07-24 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f2b95a62d890'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('posts', sa.Column('visibility', sa.String(length=20), server_default='public', nullable=False))


def downgrade() -> None:
    op.drop_column('posts', 'visibility')
