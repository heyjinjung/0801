"""add rewards and user_rewards if missing (no-op)

This migration was originally checked in without required Alembic metadata, which
caused Alembic to fail during script discovery. It's now converted to a valid
no-op migration to preserve filename/reference while unblocking startup.
"""

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401

# revision identifiers, used by Alembic.
revision = "a8e9f1c2d3b4"
# Rebase onto the current head to avoid creating a parallel head branch.
down_revision = "c6a1b5e2e2b1"
branch_labels = None
depends_on = None


def upgrade():
	# No-op: original intent superseded by later migrations.
	pass


def downgrade():
	# No-op: nothing to revert.
	pass

