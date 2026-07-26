"""add is_private to users and create hashtags, follow_requests, user_blocks, post_reports tables

Revision ID: f2b95a62d890
Revises: e2a84b51c789
Create Date: 2026-07-24 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2b95a62d890'
down_revision: Union[str, None] = 'e2a84b51c789'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users.is_private
    op.add_column('users', sa.Column('is_private', sa.Boolean(), server_default='false', nullable=False))

    # 2. hashtags
    op.create_table(
        'hashtags',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_hashtags_id'), 'hashtags', ['id'], unique=False)
    op.create_index(op.f('ix_hashtags_name'), 'hashtags', ['name'], unique=True)

    # 3. post_hashtags
    op.create_table(
        'post_hashtags',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('post_id', sa.UUID(), nullable=False),
        sa.Column('hashtag_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['hashtag_id'], ['hashtags.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('post_id', 'hashtag_id', name='uq_post_hashtag')
    )
    op.create_index(op.f('ix_post_hashtags_id'), 'post_hashtags', ['id'], unique=False)
    op.create_index(op.f('ix_post_hashtags_post_id'), 'post_hashtags', ['post_id'], unique=False)
    op.create_index(op.f('ix_post_hashtags_hashtag_id'), 'post_hashtags', ['hashtag_id'], unique=False)

    # 4. follow_requests
    op.create_table(
        'follow_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('requester_id', sa.UUID(), nullable=False),
        sa.Column('target_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='PENDING', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('requester_id', 'target_id', name='uq_requester_target')
    )
    op.create_index(op.f('ix_follow_requests_id'), 'follow_requests', ['id'], unique=False)

    # 5. user_blocks
    op.create_table(
        'user_blocks',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('blocker_id', sa.UUID(), nullable=False),
        sa.Column('blocked_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['blocked_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['blocker_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('blocker_id', 'blocked_id', name='uq_blocker_blocked')
    )
    op.create_index(op.f('ix_user_blocks_id'), 'user_blocks', ['id'], unique=False)

    # 6. post_reports
    op.create_table(
        'post_reports',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('reporter_id', sa.UUID(), nullable=False),
        sa.Column('post_id', sa.UUID(), nullable=False),
        sa.Column('reason', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_post_reports_id'), 'post_reports', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_post_reports_id'), table_name='post_reports')
    op.drop_table('post_reports')

    op.drop_index(op.f('ix_user_blocks_id'), table_name='user_blocks')
    op.drop_table('user_blocks')

    op.drop_index(op.f('ix_follow_requests_id'), table_name='follow_requests')
    op.drop_table('follow_requests')

    op.drop_index(op.f('ix_post_hashtags_hashtag_id'), table_name='post_hashtags')
    op.drop_index(op.f('ix_post_hashtags_post_id'), table_name='post_hashtags')
    op.drop_index(op.f('ix_post_hashtags_id'), table_name='post_hashtags')
    op.drop_table('post_hashtags')

    op.drop_index(op.f('ix_hashtags_name'), table_name='hashtags')
    op.drop_index(op.f('ix_hashtags_id'), table_name='hashtags')
    op.drop_table('hashtags')

    op.drop_column('users', 'is_private')
