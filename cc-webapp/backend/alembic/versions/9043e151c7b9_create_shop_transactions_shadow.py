"""create shop_transactions_shadow

Revision ID: 9043e151c7b9
Revises: 9dbe94486d67
Create Date: 2025-08-23 04:50:43.703276

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9043e151c7b9'
down_revision: Union[str, None] = '9dbe94486d67'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
