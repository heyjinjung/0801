"""cutover shop_transactions_shadow

Revision ID: be6edf74183a
Revises: 9043e151c7b9
Create Date: 2025-08-23 10:47:09.986647

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'be6edf74183a'
down_revision: Union[str, None] = '9043e151c7b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
