"""Global Metrics Router

Read-only global platform metrics (social proof) with short Redis cache.

Endpoint:
  GET /api/metrics/global -> GlobalMetricsResponse

Cache Key: metrics:global:v1  (TTL=5s)

Notes:
- Only aggregates non-personal, platform-wide counts.
- Designed to be inexpensive & safe for public display.
- Extend carefully: keep payload small (<2KB) for frequent polling/SSE.
"""
from __future__ import annotations
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
import asyncio
from pydantic import BaseModel, Field
from sqlalchemy import select, func, text
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import os
import typing as t

from app.database import get_db
from app.utils.redis import RedisManager
from app.models.auth_models import UserSession
from app.models import UserAction, UserReward

router = APIRouter(prefix="/api/metrics", tags=["Metrics"])

CACHE_KEY = "metrics:global:v1"
CACHE_TTL_SECONDS = 5

class GlobalMetricsResponse(BaseModel):
    online_users: int = Field(ge=0)
    spins_last_hour: int = Field(ge=0)
    big_wins_last_hour: int = Field(ge=0)
    generated_at: datetime

@router.get("/global", response_model=GlobalMetricsResponse, summary="글로벌 플랫폼 메트릭 조회")
def get_global_metrics(db: Session = Depends(get_db)) -> GlobalMetricsResponse:
    rm: RedisManager | None = None
    try:
        rm = RedisManager()
    except Exception:
        rm = None

    # Try cache first
    if rm:
        cached = rm.get_cached_data(CACHE_KEY)
        if isinstance(cached, dict) and all(k in cached for k in ("online_users","spins_last_hour","big_wins_last_hour","generated_at")):
            try:
                # generated_at string -> datetime (if stored as iso)
                ga = cached["generated_at"]
                if isinstance(ga, str):
                    from datetime import datetime as _dt
                    cached["generated_at"] = _dt.fromisoformat(ga)
                return GlobalMetricsResponse(**cached)
            except Exception:
                pass  # fall through to recompute

    now = datetime.utcnow()
    one_hour_ago = now - timedelta(hours=1)

    # online users: sessions active within last 5 minutes (last_used_at or last_seen field)
    online_q = select(func.count(func.distinct(UserSession.user_id))).where(
        (UserSession.last_used_at != None) & (UserSession.last_used_at > now - timedelta(minutes=5))
    )
    online_users = db.execute(online_q).scalar() or 0

    # spins_last_hour: count of UserAction where action_type='SLOT_SPIN' in last hour
    spins_q = select(func.count()).select_from(UserAction).where(
        (UserAction.action_type == 'SLOT_SPIN') & (UserAction.created_at > one_hour_ago)
    )
    spins_last_hour = db.execute(spins_q).scalar() or 0

    # big_wins_last_hour: rewards above threshold in last hour (configurable)
    # NOTE: UserReward does not have 'created_at' or 'amount_gold'. Use 'claimed_at' and 'gold_amount'.
    threshold = int(os.getenv("BIG_WIN_THRESHOLD_GOLD", "1000"))
    big_wins_q = select(func.count()).select_from(UserReward).where(
        (UserReward.claimed_at > one_hour_ago) & (UserReward.gold_amount != None) & (UserReward.gold_amount > threshold)
    )
    big_wins_last_hour = db.execute(big_wins_q).scalar() or 0

    resp = GlobalMetricsResponse(
        online_users=int(online_users),
        spins_last_hour=int(spins_last_hour),
        big_wins_last_hour=int(big_wins_last_hour),
        generated_at=now,
    )

    # Cache best-effort
    if rm:
        try:
            rm.set_cached_data(CACHE_KEY, resp.model_dump(), ttl=CACHE_TTL_SECONDS)
        except Exception:
            pass
    return resp


@router.get("/stream", summary="글로벌 메트릭 SSE 스트림", include_in_schema=True)
async def stream_global_metrics(interval: int = 5, db: Session = Depends(get_db)):
    """Server-Sent Events (text/event-stream)

    - interval: seconds between emissions (min 2 / max 30 enforced)
    - event: "metrics"
    """
    interval = max(2, min(interval, 30))

    async def event_gen():  # pragma: no cover (stream tested indirectly)
        while True:
            try:
                # 재사용 위해 동일 함수 호출 (DB 세션 재사용)
                data = get_global_metrics(db)
                import json
                yield f"event: metrics\n" + f"data: {json.dumps(data.model_dump(), default=str)}\n\n"
            except Exception as e:
                yield f"event: error\n" + f"data: {str(e)}\n\n"
            await asyncio.sleep(interval)
    return StreamingResponse(event_gen(), media_type="text/event-stream")
