"""merge rewards/shop heads (no-op)

Revision ID: 20250828_merge_rewards_shop_heads
Revises: 20250828_add_user_rewards_ext_fix, 20250820_add_userreward_extended_fields
Create Date: 2025-08-28 12:05:00
"""
from __future__ import annotations
from typing import Sequence, Union

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


revision: str = '20250828_merge_rewards_shop_heads'
down_revision: Union[str, None] = (
	'20250828_add_user_rewards_ext_fix',
	'20250820_add_userreward_extended_fields',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
	# Merge-only revision; no schema changes
	pass


def downgrade() -> None:
	# No-op
	pass

