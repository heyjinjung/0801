"""Add rewards and user_rewards tables if missing

Revision ID: a8e9f1c2d3b4
Revises: c6a1b5e2e2b1
Create Date: 2025-08-27 13:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8e9f1c2d3b4'
down_revision: Union[str, None] = 'c6a1b5e2e2b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Create rewards table if not exists
    if not insp.has_table('rewards'):
        op.create_table(
            'rewards',
            sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('reward_type', sa.String(length=50), nullable=False),
            sa.Column('value', sa.Float(), server_default=sa.text('0'), nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        )

    # Create user_rewards table if not exists
    if not insp.has_table('user_rewards'):
        op.create_table(
            'user_rewards',
            sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('reward_id', sa.Integer(), nullable=True),
            sa.Column('claimed_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_used', sa.Boolean(), server_default=sa.text('false'), nullable=False),
            sa.Column('used_at', sa.DateTime(), nullable=True),
            sa.Column('reward_type', sa.String(length=50), nullable=True),
            sa.Column('gold_amount', sa.Integer(), nullable=True),
            sa.Column('xp_amount', sa.Integer(), nullable=True),
            sa.Column('reward_metadata', sa.JSON(), nullable=True),
            sa.Column('idempotency_key', sa.String(length=120), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['reward_id'], ['rewards.id'], ondelete='SET NULL'),
            sa.UniqueConstraint('idempotency_key', name='uq_user_rewards_idempotency_key'),
        )
        op.create_index(op.f('ix_user_rewards_claimed_at'), 'user_rewards', ['claimed_at'], unique=False)
        op.create_index(op.f('ix_user_rewards_reward_type'), 'user_rewards', ['reward_type'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Drop user_rewards first due to FK
    if insp.has_table('user_rewards'):
        op.drop_index(op.f('ix_user_rewards_reward_type'), table_name='user_rewards')
        op.drop_index(op.f('ix_user_rewards_claimed_at'), table_name='user_rewards')
        # Unique constraint dropped automatically with table
        op.drop_table('user_rewards')

    if insp.has_table('rewards'):
        op.drop_table('rewards')
