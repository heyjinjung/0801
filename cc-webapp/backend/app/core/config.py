import os
from pydantic_settings import BaseSettings
from pydantic import ConfigDict

class Settings(BaseSettings):
    """Application Settings"""
    # Basic API Settings
    API_V1_STR: str = "/api"
    PROJECT_NAME: str = "Casino-Club F2P Backend"

    # Database Settings
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "cc_postgres")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "cc_user")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "cc_password")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "cc_webapp")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    SQLALCHEMY_DATABASE_URI: str = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}:{POSTGRES_PORT}/{POSTGRES_DB}"

    # Redis Settings
    REDIS_HOST: str = os.getenv("REDIS_HOST", "cc_redis")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    REDIS_PASSWORD: str = os.getenv("REDIS_PASSWORD", "redis_password")
    # Redis TTL tunables (seconds)
    IDEMPOTENCY_TTL_SECONDS: int = int(os.getenv("IDEMPOTENCY_TTL_SECONDS", str(60 * 10)))  # default 10 minutes
    LIMITED_HOLD_TTL_SECONDS: int = int(os.getenv("LIMITED_HOLD_TTL_SECONDS", "120"))  # default 120s
    # Admin gold grant TTLs / rate limit
    ADMIN_GOLD_GRANT_LOCK_TTL_SECONDS: int = int(os.getenv("ADMIN_GOLD_GRANT_LOCK_TTL_SECONDS", "30"))
    ADMIN_GOLD_GRANT_RESULT_TTL_SECONDS: int = int(os.getenv("ADMIN_GOLD_GRANT_RESULT_TTL_SECONDS", str(60*60*24)))  # 24h
    ADMIN_GOLD_GRANT_RATE_LIMIT_PER_MIN: int = int(os.getenv("ADMIN_GOLD_GRANT_RATE_LIMIT_PER_MIN", "30"))  # per admin per minute

    # JWT Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", "secret_key_for_development_only")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    # Default invite code (runtime generated if not provided). For MVP we allow a single shared code.
    # To override: set ENV DEFAULT_INVITE_CODE. Length 10, upper alnum.
    DEFAULT_INVITE_CODE: str = os.getenv("DEFAULT_INVITE_CODE", "")
    # Invite code enforcement: when True, ONLY codes present in DB (or UNLIMITED_INVITE_CODE) are accepted.
    ENFORCE_DB_INVITE_CODES: bool = os.getenv("ENFORCE_DB_INVITE_CODES", "0") == "1"
    # A single unlimited code (legacy 5858). If blank, unlimited code disabled.
    UNLIMITED_INVITE_CODE: str = os.getenv("UNLIMITED_INVITE_CODE", "5858")

    # Payments / Webhook
    PAYMENT_WEBHOOK_SECRET: str = os.getenv("PAYMENT_WEBHOOK_SECRET", "dev-webhook-secret")

    # App Settings
    DEBUG: bool = os.getenv("DEBUG", "0") == "1"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Kafka Settings
    # Prefer uppercase attribute for clarity, keep lowercase alias for backward-compat
    KAFKA_ENABLED: bool = False
    KAFKA_BOOTSTRAP_SERVERS: str = "cc_kafka_local:9092"
    # Some modules reference a lowercase variant; provide it as an optional alias.
    kafka_bootstrap_servers: str = ""
    KAFKA_ACTIONS_TOPIC: str = "cc_user_actions"
    KAFKA_REWARDS_TOPIC: str = "cc_rewards"
    KAFKA_PURCHASES_TOPIC: str = "buy_package"  # topic used by limited buy analytics
    KAFKA_DLQ_TOPIC: str = "cc_olap_dlq"
    # Optional comma-separated list of topics used by debug endpoints; may be empty
    KAFKA_TOPICS: str = ""

    # ClickHouse Settings
    CLICKHOUSE_ENABLED: bool = False
    CLICKHOUSE_URL: str = "http://cc_clickhouse_local:8123"
    CLICKHOUSE_DATABASE: str = "cc_olap"
    CLICKHOUSE_USER: str = "default"
    CLICKHOUSE_PASSWORD: str = ""
    OLAP_BATCH_SIZE: int = 500
    OLAP_FLUSH_SECONDS: int = 2

    # Web Push (VAPID) — optional
    VAPID_PUBLIC_KEY: str = os.getenv("VAPID_PUBLIC_KEY", "")
    VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "")

    # Web Push (VAPID)
    VAPID_PUBLIC_KEY: str = os.getenv("VAPID_PUBLIC_KEY", "")
    VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "")

    # Email (SMTP) Settings
    SMTP_HOST: str = os.getenv("SMTP_HOST", "mailpit")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "1025"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@casino-club.local")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Casino Club")

    # Game Settings
    DAILY_SLOT_SPINS: int = 30
    DAILY_CRASH_PLAYS: int = 15
    DAILY_RPS_PLAYS: int = 3
    DAILY_GACHA_PULLS: int = 3

    # VIP Settings
    VIP_DAILY_SLOT_SPINS: int = 50
    VIP_DAILY_CRASH_PLAYS: int = 30
    VIP_DAILY_RPS_PLAYS: int = 5
    VIP_DAILY_GACHA_PULLS: int = 5

    # Feature Flags (미구현 기능 토글)
    ADULT_CONTENT_ENABLED: bool = False
    VIP_CONTENT_ENABLED: bool = False
    # Legacy WS fallback toggle: when False, /api/games/ws rejects connections (monitor-only)
    ENABLE_LEGACY_GAMES_WS: bool = True

    # Security: key rotation version (propagated to JWT 'kid' header)
    KEY_ROTATION_VERSION: str = os.getenv("KEY_ROTATION_VERSION", "v1")

    # Observability / APM
    SENTRY_DSN: str | None = os.getenv("SENTRY_DSN")
    SENTRY_TRACES_SAMPLE_RATE: float = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0"))  # 0.0 (off) ~ 1.0

    # Slot configuration (symbol weights as JSON-like string env or default mapping)
    SLOT_SYMBOL_WEIGHTS: dict = {
        "🍒": 30,
        "🍋": 25,
        "🍊": 20,
        "🍇": 15,
        "💎": 8,
        "7️⃣": 2,
    }

    # Pydantic v2 style 설정 (class Config 제거)
    model_config = ConfigDict(case_sensitive=True, extra='ignore')

# Create global settings object
settings = Settings()

# Post-init dynamic generation for DEFAULT_INVITE_CODE if absent
if not settings.DEFAULT_INVITE_CODE:
    import secrets, string, logging
    alphabet = string.ascii_uppercase + string.digits
    generated = ''.join(secrets.choice(alphabet) for _ in range(10))
    settings.DEFAULT_INVITE_CODE = generated  # type: ignore[attr-defined]
    logging.getLogger(__name__).info("[BOOT] Generated DEFAULT_INVITE_CODE (ephemeral): %s", generated)
    logging.getLogger(__name__).warning(
        "DEFAULT_INVITE_CODE not supplied via environment. A random code was generated for this process only. Set env DEFAULT_INVITE_CODE to pin it.")
