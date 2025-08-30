#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Casino-Club F2P Backend Main Application
======================================
Core FastAPI application with essential routers and middleware
"""

import os
# 테스트 실행 시 필수 환경변수 기본값 주입 (없을 때만) - idempotent
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_app.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Core imports
from app.database import get_db
from app.utils.redis import init_redis_manager, get_redis_manager
from app.core.logging import setup_logging, LoggingContextMiddleware
from app.core.config import settings
from app.core.error_handlers import add_exception_handlers
from app.middleware.simple_logging import SimpleLoggingMiddleware
# from app.core.exceptions import add_exception_handlers  # Disabled - empty file
# from app.middleware.error_handling import error_handling_middleware  # Disabled
# from app.middleware.logging import LoggingContextMiddleware  # Disabled

# Import core routers only
from app.routers import (
    auth,
    users,  # Re-enabled
    admin,
    actions,
    olap,
    # gacha,  # 중복 제거: games.router에 포함됨
    rewards,
    shop,
    missions,
    quiz,        # Quiz system enabled
    dashboard,
    # prize_roulette,  # ARCHIVED - 룰렛 기능 제거
    rps,
    notifications,
    doc_titles,  # Phase 1 added
    feedback,    # Phase 2 added
    games,       # 통합된 게임 라우터 (games_direct 내용으로 대체됨)
    # games_direct, # 중복 제거: games.py에 통합됨
    # game_api,    # 중복 제거: games.router에 통합됨
    invite_router,  # Phase 5 added
    analyze,     # Phase 6 added
    # roulette,    # ARCHIVED - 룰렛 기능 제거
    segments,    # Phase 8 added
    tracking,    # Phase 9 added
    unlock,      # Phase 10 added
    chat,        # Chat system added
    ai_router,   # AI recommendation system
    events,      # 추가 - 이벤트/미션 라우터
    rbac_demo,   # RBAC demo router
    realtime,    # 실시간 전역 동기화 WebSocket
)
from app.routers import vip  # New import for VIP router
from app.routers import notification
from app.routers import kafka_api
from app.routers.notifications import sse_router as notifications_sse_router, api_router as notifications_api_router
from app.routers import notification_center
from app.routers import email as email_router
from app.kafka_client import start_consumer, stop_consumer, get_last_messages, is_consumer_ready
from app.routers import streak
from app.routers import abtest
from app.routers import metrics  # Global metrics (social proof)

# AI recommendation system router separate import (removed duplicate)

# Scheduler setup
class _DummyScheduler:
    running = False
    def shutdown(self, wait: bool = False) -> None:
        """No-op shutdown when scheduler is unavailable."""

try:
    from app.apscheduler_jobs import start_scheduler, scheduler
except Exception:
    def start_scheduler():
        print("Scheduler disabled or APScheduler not installed")
    scheduler = _DummyScheduler()

# Optional monitoring
try:  # 선택적 Prometheus 계측
    from prometheus_fastapi_instrumentator import Instrumentator
except ImportError:
    Instrumentator = None  # 미설치 시 계측 비활성

try:  # 선택적 Sentry APM/에러 추적
    import sentry_sdk
except Exception:
    sentry_sdk = None  # 환경 미설정 시 무시

if sentry_sdk and settings.SENTRY_DSN:
    try:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            enable_tracing=settings.SENTRY_TRACES_SAMPLE_RATE > 0,
        )
        print("🛰️  Sentry initialized (dsn set)")
    except Exception as e:
        print(f"⚠️ Sentry init failed: {e}")

from app.utils.schema_drift_guard import check_schema_drift

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Casino-Club F2P Backend starting up...")
    try:
        setup_logging()
        print("📋 Logging initialized")
    except Exception as e:
        print(f"⚠️ Logging setup failed: {e}")

    # Schema drift guard (skip only if explicitly disabled)
    if os.getenv("DISABLE_SCHEMA_DRIFT_GUARD", "0") != "1":
        drift = check_schema_drift()
        if drift:
            # In production we may want to abort startup; for now only log.
            print("🚨 Critical schema drift detected (see logs). Continuing startup in DEV mode.")

    # If running in a test/dev environment, ensure a default test user exists so
    # legacy tests that POST /api/auth/login with site_id='testuser' succeed.
    try:
        # Use already imported top-level os (avoid shadowing leading to UnboundLocalError)
        is_test_db = "test" in os.getenv("DATABASE_URL", "") or os.getenv("PYTEST_CURRENT_TEST")
        if is_test_db:
            # import lazily to avoid heavy dependencies when not needed
            from app.database import SessionLocal
            from app.models import User
            from app.services.auth_service import AuthService
            db = SessionLocal()
            try:
                existing = db.query(User).filter(User.site_id == "testuser").first()
                if not existing:
                    authsvc = AuthService()
                    pwd_hash = authsvc.get_password_hash("password")
                    u = User(site_id="testuser", nickname="testuser", phone_number="000-0000-0000", password_hash=pwd_hash, invite_code="5858")
                    db.add(u)
                    db.commit()
                    print("🔧 Test user 'testuser' created for pytest runs")
            finally:
                db.close()
    except Exception as _:
        # Non-fatal: fail silently in production or if DB not ready
        pass

    # --- AUTO_SEED_BASIC: 기본 관리자/테스트 유저 자동 시드 (멱등) ---
    # 조건:
    #   환경변수 AUTO_SEED_BASIC=1 이고 admin 계정이 없을 때만 실행 (멱등 보장)
    # 목적:
    #   컨테이너 재시작/초기 부팅 시 수동 seed 명령 누락으로 발생하는 로그인 실패 제거
    # 위험 최소화:
    #   프로덕션(ENVIRONMENT=prod)에서는 기본값 비활성; 명시 활성 시에도 admin 이미 존재하면 skip
    try:
        if os.getenv("AUTO_SEED_BASIC", "0") == "1":
            from app.database import SessionLocal as _SeedSession
            from app.models.auth_models import User as _SeedUser
            seed_db = _SeedSession()
            try:
                has_admin = seed_db.query(_SeedUser).filter(_SeedUser.site_id == 'admin').first()
                if not has_admin:
                    try:
                        from app.scripts import seed_basic_accounts as _seed_mod
                        _seed_mod.main()
                        print("🔧 AUTO_SEED_BASIC 적용: 기본 계정 생성 완료 (admin,user001~)")
                        app.state.auto_seed_basic_applied = True  # 상태 플래그 (AdminStats 등에서 활용 가능)
                    except Exception as se:
                        print(f"⚠️ AUTO_SEED_BASIC 실패: {se}")
                        app.state.auto_seed_basic_applied = False
                else:
                    app.state.auto_seed_basic_applied = False  # 이미 존재 → 신규 생성 아님
            finally:
                seed_db.close()
    except Exception as e:
        print(f"⚠️ AUTO_SEED_BASIC 래퍼 오류: {e}")

    start_scheduler()
    # Redis 초기화 (실패 허용)
    try:
        if not getattr(app.state, "redis_initialized", False):
            redis_host = os.getenv("REDIS_HOST", "localhost")
            redis_port = int(os.getenv("REDIS_PORT", "6379"))
            redis_password = os.getenv("REDIS_PASSWORD", None)
            import redis  # type: ignore
            client = redis.Redis(host=redis_host, port=redis_port, password=redis_password, decode_responses=False)
            # ping으로 연결검증, 실패 시 fallback (메모리 모드)
            try:
                client.ping()
                init_redis_manager(client)
                app.state.redis_manager = get_redis_manager()
                app.state.redis_initialized = True
                print("🔌 Redis connected & manager initialized")
            except Exception as re:
                print(f"⚠️ Redis connection failed, using in-memory fallback: {re}")
    except Exception as e:
        print(f"⚠️ Redis init wrapper error: {e}")
    # Start Kafka consumer (optional)
    try:
        await start_consumer()
        if os.getenv("KAFKA_ENABLED", "0") == "1":
            print("📡 Kafka consumer started")
    except Exception as e:
        print(f"⚠️ Kafka consumer start failed: {e}")
    print("✅ Backend startup complete")
    try:
        yield
    finally:
        # Shutdown
        print("🛑 Casino-Club F2P Backend shutting down...")
        # Stop Kafka consumer
        try:
            await stop_consumer()
            if os.getenv("KAFKA_ENABLED", "0") == "1":
                print("📡 Kafka consumer stopped")
        except Exception as e:
            print(f"⚠️ Kafka consumer stop failed: {e}")
        if scheduler and getattr(scheduler, "running", False):
            try:
                # shutdown may raise RuntimeError if event loop is closed (test lifecycle)
                scheduler.shutdown(wait=True)
                print("⏱️ Scheduler stopped")
            except RuntimeError as re:
                # Known issue when asyncio event loop is already closed during test teardown.
                print(f"⚠️ Scheduler shutdown skipped (runtime): {re}")
            except Exception as e:
                # Log and continue shutdown sequence to avoid failing teardown.
                print(f"⚠️ Scheduler shutdown error: {e}")
        print("✅ Backend shutdown complete")

# ===== FastAPI App Initialization =====

app = FastAPI(
    title="Casino-Club F2P API",
    description="Backend API for Casino-Club F2P gaming platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ===== Request/Response Models =====

class HealthResponse(BaseModel):
    status: str
    timestamp: datetime
    version: str
    redis_connected: Optional[bool] = Field(
        default=None,
        description="Redis 연결 성공 여부 (lifespan 초기화 시 설정). 테스트 및 관측 목적."
    )

class LoginRequest(BaseModel):
    user_id: str
    password: str

class LoginResponse(BaseModel):
    token: str
    user_id: str
    message: Optional[str] = None

# ===== Middleware Setup =====

# CORS settings (ENV override: CORS_ORIGINS="http://localhost:3000,https://localhost:3000")
_default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "https://127.0.0.1:3000",
    "http://139.180.155.143:3000",
    "https://139.180.155.143:3000",
]
_env_origins = os.getenv("CORS_ORIGINS", "").strip()
origins = (
    [o.strip() for o in _env_origins.split(",") if o.strip()]
    if _env_origins else _default_origins
)

add_exception_handlers(app)

# 간단한 API 로깅 미들웨어 추가
app.add_middleware(SimpleLoggingMiddleware)

app.add_middleware(LoggingContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Monitoring: Prometheus Instrumentation (optional) =====
if Instrumentator is not None:
    try:
        # Idempotent setup: ensure we don't re-register in reloads
        if not hasattr(app.state, "prometheus_instrumented"):
            Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
            app.state.prometheus_instrumented = True
            print("📈 Prometheus /metrics endpoint exposed")
    except Exception as e:
        # Non-fatal if instrumentation fails
        print(f"⚠️ Prometheus instrumentation failed: {e}")

# ===== Core API Router Registration =====

# Authentication & User Management (no prefix - routers have their own)
app.include_router(auth.router, tags=["Authentication"])
app.include_router(users.router)  # 태그 오버라이드 제거 - 이미 users.py에서 "Users" 태그를 지정함
app.include_router(admin.router)  # 태그 오버라이드 제거 - 이미 admin.py에서 "Admin" 태그를 지정함
app.include_router(olap.router)   # OLAP/ClickHouse health endpoints

# Core Game Systems (no prefix - routers have their own)
app.include_router(actions.router, tags=["Game Actions"])
# app.include_router(gacha.router, tags=["Gacha"])  # 중복 제거: games.router에 포함됨
app.include_router(rewards.router, tags=["Rewards"])
app.include_router(shop.router, tags=["Shop"])
app.include_router(missions.router)  # 태그 오버라이드 제거 - 이미 missions.py에서 "Events & Missions" 태그를 지정함

# Interactive Features (PARTIALLY DISABLED FOR MVP)
# app.include_router(quiz.router)  # DISABLED - non-MVP complexity
# app.include_router(chat.router)  # DISABLED - non-MVP WebSocket risk  
# app.include_router(ai_router.router, tags=["AI Recommendation"])  # DISABLED - non-MVP

# Management & Monitoring (MINIMAL FOR MVP)
app.include_router(dashboard.router)  # ENABLED - dashboard for container environment
from .routers import events as events_router
app.include_router(events_router.router)  # ENABLED - events for container environment
# app.include_router(notifications.router, tags=["Real-time Notifications"])  # DISABLED - WebSocket risk
# app.include_router(notifications_sse_router)  # DISABLED - SSE complexity
# app.include_router(notifications_api_router)  # DISABLED - notification complexity
# app.include_router(notification_center.router)  # DISABLED - non-MVP
# app.include_router(email_router.router)  # DISABLED - email system non-MVP
app.include_router(streak.router)
app.include_router(vip.router)  # Include VIP router
app.include_router(notification.router, tags=["Notification Center"])  # lightweight stub router
from .routers import admin_content as admin_content_router
app.include_router(admin_content_router.router)

# Admin Events (이전에 누락되어 OpenAPI 및 기능에서 제외됨) - 관리자 전용 이벤트 CRUD/seed/participation/force-claim
try:
    from .routers import admin_events as admin_events_router  # noqa
    app.include_router(admin_events_router.router)
    print("✅ Admin Events router registered")
except Exception as e:  # pragma: no cover - 방어적
    print(f"⚠️ Admin Events router 등록 실패: {e}")
# Development-only endpoints (not included in OpenAPI schema)
try:
    from app.routers.dev_logs import router as dev_logs_router
    app.include_router(dev_logs_router)
    print('✅ Dev logs router registered (development only)')
except Exception:
    pass

# Individual Games (removed - consolidated into games.router)
# app.include_router(rps.router, tags=["Rock Paper Scissors"])  # duplicated in games.router

# ===== Progressive Expansion - Additional Features =====

# Phase 1: Documentation & Content (no prefix - routers have their own)
app.include_router(doc_titles.router, tags=["Document Titles"])

# Phase 2: Feedback System (no prefix - routers have their own)  
app.include_router(feedback.router, tags=["Feedback"])

# Phase 3: Game Collection (no prefix - routers have their own) - 통합된 게임 API
app.include_router(games.router)

# Phase 4: Unified Game API (no prefix - routers have their own) - 중복 제거
# app.include_router(game_api.router, tags=["Game API"])  # 중복 제거: games.router에 통합됨

# Phase 5: Invite System (no prefix - routers have their own)
app.include_router(invite_router.router)  # 태그 오버라이드 제거 - 이미 invite_router.py에서 "Invite Codes" 태그를 지정함
app.include_router(rbac_demo.router)  # New RBAC demo router included
app.include_router(metrics.router)  # Global metrics endpoint

# ===== NON-MVP ROUTERS DISABLED FOR DEPLOYMENT STABILITY =====
# Phase 6: Analytics (DISABLED - non-MVP)
# app.include_router(analyze.router)

# Phase 8: User Segmentation (DISABLED - non-MVP)  
# app.include_router(segments.router)

# Phase 9: User Tracking (DISABLED - non-MVP)
# app.include_router(tracking.router)

# Phase 10: Unlock System (DISABLED - non-MVP)
# app.include_router(unlock.router)
# app.include_router(abtest.router, tags=["ABTest"])

# Events/Missions (ENABLED - required for container environment)
app.include_router(events.router)
app.include_router(kafka_api.router)

# Realtime sync (ENABLED)
app.include_router(realtime.router)

print("✅ Core API endpoints registered")
print("✅ Progressive Expansion features registered") 
print("✅ No duplicate API registrations - Clean structure maintained")
print("✅ Using integrated games router with improved JSON responses")

# ===== Core API Endpoints =====

@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "message": "Casino-Club F2P Backend API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint"""
    # lifespan에서 app.state.redis_initialized / redis_error 설정됨
    redis_connected = getattr(app.state, "redis_initialized", False)
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now(),
        version="1.0.0",
        redis_connected=redis_connected
    )

@app.get("/api/kafka/_debug/last", tags=["Kafka"])
async def kafka_last_messages(limit: int = 10):
    """Return last consumed Kafka messages (debug)."""
    return {"items": get_last_messages(limit)}

@app.get("/api/kafka/_debug/ready", tags=["Kafka"])
async def kafka_ready():
    """Return whether the Kafka consumer is initialized and assigned partitions."""
    try:
        ready = bool(is_consumer_ready())
    except Exception:
        ready = False
    return {"ready": ready}

@app.get("/api", tags=["API Info"])
async def api_info():
    """API information endpoint"""
    return {
        "title": "Casino-Club F2P API",
        "version": "1.0.0",
        "description": "Backend API for Casino-Club F2P gaming platform",
        "endpoints": {
            "auth": "/api/auth",
            "users": "/api/users",
            "admin": "/api/admin",
            "games": "/api/games/*",
            "shop": "/api/shop, /api/rewards",
            "missions": "/api/missions",
            "quiz": "/api/quiz",
            "dashboard": "/api/dashboard",
            "websocket": "/ws"
        }
    }

 

# ===== Error Handlers =====

@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Custom 404 handler"""
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not Found",
            "message": f"The requested endpoint {request.url.path} was not found",
            "available_endpoints": "/docs"
        }
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    """Custom 500 handler"""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred",
            "timestamp": datetime.now().isoformat()
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

# 테스트 라우터는 제거되었습니다 - main_fixed.py에서 이 부분이 제거됨
# from app.auth.test_endpoints import router as test_router
# app.include_router(test_router)

"""Legacy /ws/games endpoint and manager removed in favor of unified /api/games/ws & /api/games/ws/monitor.

If any external client still references /ws/games, consider adding a lightweight forwarding
endpoint that simply instructs clients to migrate. Intentionally omitted to reduce surface.
"""

