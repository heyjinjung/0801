"""merge unify a8e9f1c2d3b4 and c6a1b5e2e2b1

Revision ID: 5a13476a2b3f
Revises: 20250828_add_user_rewards_ext_fix
Create Date: 2025-08-28 09:33:31.731298

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5a13476a2b3f'
down_revision: Union[str, None] = '20250828_add_user_rewards_ext_fix'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
