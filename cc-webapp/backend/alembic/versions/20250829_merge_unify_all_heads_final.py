"""
Merge all remaining heads into a single lineage.

This is a no-op merge revision to restore a single-head policy after
recent parallel branches (rewards/shop merges, prior merge branches).
"""
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401

# revision identifiers, used by Alembic.
revision = '20250829_merge_unify_all_heads_final'
down_revision = (
    '20250828_merge_rewards_shop_heads',
    '5a13476a2b3f',
    'a8e9f1c2d3b4',
)
branch_labels = None
depends_on = None

def upgrade():
    # No-op merge
    pass


def downgrade():
    # This is a merge-only revision; downgrade is a no-op.
    pass
