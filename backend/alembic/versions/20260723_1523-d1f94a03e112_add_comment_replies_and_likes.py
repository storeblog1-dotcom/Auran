"""add parent_id to comments and create comment_likes table

Revision ID: d1f94a03e112
Revises: c9e83f92d001
Create Date: 2026-07-23 15:23:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1f94a03e112'
down_revision: Union[str, None] = 'c9e83f92d001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # comments 테이블에 parent_id 컬럼 추가 (대댓글 지원)
    op.add_column(
        'comments',
        sa.Column('parent_id', sa.UUID(), nullable=True)
    )
    op.create_foreign_key(
        'fk_comments_parent_id',
        'comments', 'comments',
        ['parent_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_index(op.f('ix_comments_parent_id'), 'comments', ['parent_id'], unique=False)

    # comment_likes 테이블 생성
    op.create_table(
        'comment_likes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('comment_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['comment_id'], ['comments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'comment_id', name='uq_user_comment_like')
    )
    op.create_index(op.f('ix_comment_likes_id'), 'comment_likes', ['id'], unique=False)
    op.create_index(op.f('ix_comment_likes_user_id'), 'comment_likes', ['user_id'], unique=False)
    op.create_index(op.f('ix_comment_likes_comment_id'), 'comment_likes', ['comment_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_comment_likes_comment_id'), table_name='comment_likes')
    op.drop_index(op.f('ix_comment_likes_user_id'), table_name='comment_likes')
    op.drop_index(op.f('ix_comment_likes_id'), table_name='comment_likes')
    op.drop_table('comment_likes')

    op.drop_index(op.f('ix_comments_parent_id'), table_name='comments')
    op.drop_constraint('fk_comments_parent_id', 'comments', type_='foreignkey')
    op.drop_column('comments', 'parent_id')
