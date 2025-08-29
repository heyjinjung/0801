"""user_rewards extended fields follow-up fix (no-op safe)

Revision ID: 20250828_add_user_rewards_ext_fix
Revises: 20250820_add_userreward_extended_fields
Create Date: 2025-08-28 12:00:00
"""
from __future__ import annotations
from typing import Sequence, Union

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


revision: str = '20250828_add_user_rewards_ext_fix'
down_revision: Union[str, None] = '20250820_add_userreward_extended_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
	# No-op: This revision exists to align heads and ensure consistency.
	pass


def downgrade() -> None:
	# No-op
	pass

