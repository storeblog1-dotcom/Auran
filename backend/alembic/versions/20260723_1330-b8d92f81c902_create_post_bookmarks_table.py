"""create post_bookmarks table

Revision ID: b8d92f81c902
Revises: a7d92f81c901
Create Date: 2026-07-23 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d92f81c902'
down_revision: Union[str, None] = 'a7d92f81c901'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'post_bookmarks',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('post_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'post_id', name='uq_user_post_bookmark')
    )
    op.create_index(op.f('ix_post_bookmarks_id'), 'post_bookmarks', ['id'], unique=False)
    op.create_index(op.f('ix_post_bookmarks_post_id'), 'post_bookmarks', ['post_id'], unique=False)
    op.create_index(op.f('ix_post_bookmarks_user_id'), 'post_bookmarks', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_post_bookmarks_user_id'), table_name='post_bookmarks')
    op.drop_index(op.f('ix_post_bookmarks_post_id'), table_name='post_bookmarks')
    op.drop_index(op.f('ix_post_bookmarks_id'), table_name='post_bookmarks')
    op.drop_table('post_bookmarks')
