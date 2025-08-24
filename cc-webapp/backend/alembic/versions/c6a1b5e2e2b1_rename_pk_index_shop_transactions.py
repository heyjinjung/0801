"""rename pk index on shop_transactions (no-op placeholder)

Revision ID: c6a1b5e2e2b1
Revises: be6edf74183a
Create Date: 2025-08-23

This revision was created to fix an empty migration file that caused Alembic to fail
with "Could not determine revision id from filename". It performs no schema changes.

If a primary key index rename is needed in the future for shop_transactions, implement
the logic here with proper guards and cross-dialect safety.
"""
from typing import Sequence, Union

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = "c6a1b5e2e2b1"
down_revision: Union[str, None] = "be6edf74183a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:  # pragma: no cover
	# No-op: placeholder to restore migration graph health.
	pass


def downgrade() -> None:  # pragma: no cover
	# No-op downgrade corresponding to no-op upgrade.
	pass

