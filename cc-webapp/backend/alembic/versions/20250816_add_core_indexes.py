"""add core composite & unique indexes

Revision ID: a1d3b6b5c9f0
Revises: f79d04ea1016
Create Date: 2025-08-16
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1d3b6b5c9f0'
down_revision = 'f79d04ea1016'
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)

    # Core composite indexes (idempotent)
    try:
        gs_indexes = {ix.get('name') for ix in inspector.get_indexes('game_sessions')} if inspector.has_table('game_sessions') else set()
    except Exception:
        gs_indexes = set()
    if inspector.has_table('game_sessions') and 'ix_game_sessions_user_created' not in gs_indexes:
        try:
            op.create_index('ix_game_sessions_user_created', 'game_sessions', ['user_id', 'created_at'], unique=False)
        except Exception:
            pass

    try:
        st_indexes = {ix.get('name') for ix in inspector.get_indexes('shop_transactions')} if inspector.has_table('shop_transactions') else set()
    except Exception:
        st_indexes = set()
    if inspector.has_table('shop_transactions') and 'ix_shop_transactions_user_created' not in st_indexes:
        try:
            op.create_index('ix_shop_transactions_user_created', 'shop_transactions', ['user_id', 'created_at'], unique=False)
        except Exception:
            pass

    # Unique constraints
    if inspector.has_table('user_rewards'):
        try:
            op.create_unique_constraint('uq_user_rewards_user_reward', 'user_rewards', ['user_id', 'reward_id'])
        except Exception:
            pass
    if inspector.has_table('mission_progress'):
        try:
            op.create_unique_constraint('uq_mission_progress_user_mission', 'mission_progress', ['user_id', 'mission_id'])
        except Exception:
            pass

    # Partial index (PostgreSQL only)
    if dialect == 'postgresql' and inspector.has_table('notifications'):
        op.execute("CREATE INDEX IF NOT EXISTS ix_notifications_user_unread ON notifications (user_id, created_at) WHERE is_read = false")

    # Chat / analytics
    if inspector.has_table('chat_messages'):
        op.create_index('ix_chat_messages_room_created', 'chat_messages', ['room_id', 'created_at'], unique=False)
    if inspector.has_table('analytics_events'):
        op.create_index('ix_analytics_events_date_user', 'analytics_events', ['event_date', 'user_id'], unique=False)


def downgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)

    if inspector.has_table('analytics_events'):
        try: op.drop_index('ix_analytics_events_date_user', table_name='analytics_events')
        except Exception: pass
    if inspector.has_table('chat_messages'):
        try: op.drop_index('ix_chat_messages_room_created', table_name='chat_messages')
        except Exception: pass
    if dialect == 'postgresql' and inspector.has_table('notifications'):
        op.execute("DROP INDEX IF EXISTS ix_notifications_user_unread")
    if inspector.has_table('mission_progress'):
        try: op.drop_constraint('uq_mission_progress_user_mission', 'mission_progress', type_='unique')
        except Exception: pass
    if inspector.has_table('user_rewards'):
        try: op.drop_constraint('uq_user_rewards_user_reward', 'user_rewards', type_='unique')
        except Exception: pass
    try: op.drop_index('ix_shop_transactions_user_created', table_name='shop_transactions')
    except Exception: pass
    try: op.drop_index('ix_game_sessions_user_created', table_name='game_sessions')
    except Exception: pass
