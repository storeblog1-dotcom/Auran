"""create stories and story_views tables

Revision ID: c9e83f92d001
Revises: b8d92f81c902
Create Date: 2026-07-23 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9e83f92d001'
down_revision: Union[str, None] = 'b8d92f81c902'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'stories',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('media_url', sa.String(length=500), nullable=False),
        sa.Column('media_type', sa.String(length=20), server_default='image', nullable=False),
        sa.Column('caption', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stories_id'), 'stories', ['id'], unique=False)
    op.create_index(op.f('ix_stories_user_id'), 'stories', ['user_id'], unique=False)
    op.create_index(op.f('ix_stories_created_at'), 'stories', ['created_at'], unique=False)
    op.create_index(op.f('ix_stories_expires_at'), 'stories', ['expires_at'], unique=False)

    op.create_table(
        'story_views',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('story_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('viewed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('story_id', 'user_id', name='uq_story_user_view')
    )
    op.create_index(op.f('ix_story_views_id'), 'story_views', ['id'], unique=False)
    op.create_index(op.f('ix_story_views_story_id'), 'story_views', ['story_id'], unique=False)
    op.create_index(op.f('ix_story_views_user_id'), 'story_views', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_story_views_user_id'), table_name='story_views')
    op.drop_index(op.f('ix_story_views_story_id'), table_name='story_views')
    op.drop_index(op.f('ix_story_views_id'), table_name='story_views')
    op.drop_table('story_views')

    op.drop_index(op.f('ix_stories_expires_at'), table_name='stories')
    op.drop_index(op.f('ix_stories_created_at'), table_name='stories')
    op.drop_index(op.f('ix_stories_user_id'), table_name='stories')
    op.drop_index(op.f('ix_stories_id'), table_name='stories')
    op.drop_table('stories')
