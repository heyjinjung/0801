"""add_vip_points_column_to_users

Revision ID: 3d77179e36e1  
Revises: 20250820_add_userreward_extended_fields
Create Date: 2025-08-20 04:32:09.264733

Summary: 
- VIP 포인트 컬럼을 users 테이블에 추가
- 기본값 0, NOT NULL 제약조건 설정
- 기존 사용자들에게 자동으로 0 값 할당

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = '3d77179e36e1'
down_revision: Union[str, None] = '20250820_add_userreward_extended_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(insp: Inspector, table: str, col: str) -> bool:
    try:
        return col in {c['name'] for c in insp.get_columns(table)}
    except Exception:
        return False

def upgrade() -> None:
    """Add vip_points column to users table (idempotent)."""
    conn = op.get_bind()
    insp = Inspector.from_engine(conn)  # type: ignore

    if not _has_column(insp, 'users', 'vip_points'):
        op.add_column('users', sa.Column('vip_points', sa.Integer(), nullable=False, server_default='0'))
        conn.execute(sa.text("UPDATE users SET vip_points = 0 WHERE vip_points IS NULL"))
        # drop server_default to avoid future diffs
        with op.batch_alter_table('users') as batch:
            batch.alter_column('vip_points', server_default=None)
    # else: already present → no-op


def downgrade() -> None:
    """Remove vip_points column from users table."""
    try:
        op.drop_column('users', 'vip_points')
    except Exception:
        pass
