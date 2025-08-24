"""add achievements tables

Revision ID: 20250816_add_achievements_tables
Revises: a1d3b6b5c9f0
Create Date: 2025-08-16
"""
from __future__ import annotations
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20250816_add_achievements_tables'

down_revision: Union[str, None] = 'a1d3b6b5c9f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if 'achievements' not in insp.get_table_names():
        op.create_table(
            'achievements',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('code', sa.String(length=64), nullable=False),
            sa.Column('title', sa.String(length=120), nullable=False),
            sa.Column('description', sa.String(length=255)),
            sa.Column('condition', sa.JSON(), nullable=False),
            sa.Column('reward_coins', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('reward_gems', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('icon', sa.String(length=80)),
            sa.Column('badge_color', sa.String(length=32)),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.UniqueConstraint('code', name='uq_achievements_code')
        )
    try:
        indexes = {ix.get('name') for ix in insp.get_indexes('achievements')} if 'achievements' in insp.get_table_names() else set()
    except Exception:
        indexes = set()
    if 'achievements' in insp.get_table_names() and 'ix_achievements_code' not in indexes:
        try: op.create_index('ix_achievements_code', 'achievements', ['code'])
        except Exception: pass
    if 'achievements' in insp.get_table_names() and 'ix_achievements_active' not in indexes:
        try: op.create_index('ix_achievements_active', 'achievements', ['is_active'])
        except Exception: pass

    if 'user_achievements' not in insp.get_table_names():
        op.create_table(
            'user_achievements',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('achievement_id', sa.Integer(), nullable=False),
            sa.Column('unlocked_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('progress_value', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('is_unlocked', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_user_achievements_user_id', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['achievement_id'], ['achievements.id'], name='fk_user_achievements_achievement_id', ondelete='CASCADE'),
            sa.UniqueConstraint('user_id', 'achievement_id', name='uq_user_achievement_user_achievement')
        )
    try:
        ua_indexes = {ix.get('name') for ix in insp.get_indexes('user_achievements')} if 'user_achievements' in insp.get_table_names() else set()
    except Exception:
        ua_indexes = set()
    if 'user_achievements' in insp.get_table_names() and 'ix_user_achievements_user' not in ua_indexes:
        try: op.create_index('ix_user_achievements_user', 'user_achievements', ['user_id'])
        except Exception: pass
    if 'user_achievements' in insp.get_table_names() and 'ix_user_achievements_unlocked' not in ua_indexes:
        try: op.create_index('ix_user_achievements_unlocked', 'user_achievements', ['is_unlocked'])
        except Exception: pass

def downgrade() -> None:
    op.drop_index('ix_user_achievements_unlocked', table_name='user_achievements')
    op.drop_index('ix_user_achievements_user', table_name='user_achievements')
    op.drop_table('user_achievements')
    op.drop_index('ix_achievements_active', table_name='achievements')
    op.drop_index('ix_achievements_code', table_name='achievements')
    op.drop_table('achievements')
