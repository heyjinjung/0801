"""Game Collection API Endpoints (Updated & Unified)"""
import logging
import json as _json
from fastapi import APIRouter, Depends, HTTPException, Response, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
import random
import json
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from ..database import get_db
from ..dependencies import get_current_user, get_current_admin_user as get_current_admin
from ..models.auth_models import User
from ..models.game_models import Game, UserAction, GameSession as GameSessionModel
from ..services.simple_user_service import SimpleUserService
from ..services.game_service import GameService
from ..services.history_service import log_game_history
from ..services.achievement_service import AchievementService
from pydantic import BaseModel, ConfigDict

def _lazy_broadcast_game_session_event():
    try:
        from app import main  # type: ignore
        return getattr(main, "broadcast_game_session_event", None)
    except Exception:  # pragma: no cover
        async def _noop(_):
            return None
        return _noop
from ..schemas.game_schemas import (
    GameListResponse, GameDetailResponse,
    GameSessionStart, GameSessionEnd,
    SlotSpinRequest, SlotSpinResponse,
    RPSPlayRequest, RPSPlayResponse,
    GachaPullRequest, GachaPullResponse,
    CrashBetRequest, CrashBetResponse,
    GameStats, ProfileGameStats, Achievement, GameSession, GameLeaderboard
)
from app import models
from sqlalchemy import text, func
from ..utils.redis import update_streak_counter
from ..core.config import settings
try:  # Kafka optional import
    from app.messaging.kafka import get_kafka_producer  # type: ignore
except Exception:  # pragma: no cover
    def get_kafka_producer():  # type: ignore
        return None

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/games", tags=["Games"])
# Legacy WS usage counter (Prometheus optional)
try:
    from prometheus_client import Counter  # type: ignore
    _legacy_ws_conn_total = Counter(
        'ws_legacy_games_connections_total',
        'Total connections attempted to legacy /api/games/ws'
    )
    # 보강: 결과 라벨 분리 카운터 (역호환을 위해 별도 메트릭명 사용)
    _legacy_ws_conn_by_result = Counter(
        'ws_legacy_games_connections_by_result_total',
        'Legacy /api/games/ws connections by result (accepted|rejected)',
        ['result']
    )
except Exception:  # pragma: no cover
    _legacy_ws_conn_total = None  # type: ignore
    _legacy_ws_conn_by_result = None  # type: ignore

# ---------------------------------------------------------------------------
# 표준 사용자 액션 로깅 헬퍼
# 통일된 envelope: {"v":1, "type":action_type, "ts": iso8601, "data": <payload dict>}
# data 내부는 각 게임/행동별 스키마 (bet_amount, win_amount 등). 문자열 저장 (Text 컬럼) 최종 직렬화.
def _log_user_action(db: Session, *, user_id: int, action_type: str, data: Dict[str, Any]) -> None:
    try:
        envelope = {
            "v": 1,
            "type": action_type,
            "ts": datetime.utcnow().isoformat() + "Z",
            "data": data,
        }
        ua = UserAction(user_id=user_id, action_type=action_type, action_data=_json.dumps(envelope, ensure_ascii=False))
        db.add(ua)
        db.commit()
        # Kafka publish (best-effort)
        try:
            producer = get_kafka_producer()
            if producer:
                topic = getattr(settings, "KAFKA_USER_ACTION_TOPIC", "topic_user_actions")
                producer.produce(topic, _json.dumps(envelope, ensure_ascii=False).encode("utf-8"))  # type: ignore
        except Exception as ke:  # pragma: no cover
            logger.debug(f"kafka publish skipped: {ke}")
    except Exception as e:  # 실패 허용 (게임 진행 차단 X)
        try:
            db.rollback()
        except Exception:
            pass
        logger.warning(f"user_action log failed action_type={action_type}: {e}")

# ---------------------------------------------------------------------------
# 공통 피드백 헬퍼
# code 네이밍 규칙: <domain>.<event>[.<qualifier>]  / severity: info|success|warning|loss
# animation 은 프론트에서 선택적 매핑 (특수 연출)
def _build_feedback(
    *,
    domain: str,
    event: str,
    qualifier: Optional[str] = None,
    message: str,
    severity: Optional[str] = None,
    animation: Optional[str] = None,
    streak: Optional[int] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    code_parts = [domain, event]
    if qualifier:
        code_parts.append(qualifier)
    code = ".".join(code_parts)
    sev = severity or ("success" if event in ("win", "jackpot") else ("loss" if event in ("lose", "bet") else "info"))
    payload: Dict[str, Any] = {
        "code": code,
        "severity": sev,
        "message": message,
    }
    if animation:
        payload["animation"] = animation
    if streak is not None:
        payload["streak"] = streak
    if extra:
        payload["meta"] = extra
    return payload

# ----------------------------- GameHistory 조회 스키마 (간단 내장) -----------------------------

class GameHistoryItem(BaseModel):
    id: int
    user_id: int
    game_type: str
    action_type: str
    delta_coin: int
    delta_gem: int
    created_at: datetime
    result_meta: Optional[Dict[str, Any]] = None
    model_config = ConfigDict(from_attributes=True)

class GameHistoryListResponse(BaseModel):
    total: int
    items: List[GameHistoryItem]
    limit: int
    offset: int


class AchievementProgressItem(BaseModel):
    code: str
    title: str
    description: Optional[str]
    icon: Optional[str]
    badge_color: Optional[str]
    reward_coins: int
    reward_gold: int
    progress: int
    threshold: Optional[int]
    unlocked: bool

class AchievementProgressResponse(BaseModel):
    items: List[AchievementProgressItem]


@router.get("/achievements", response_model=AchievementProgressResponse)
def list_achievements(db: Session = Depends(get_db)):
    svc = AchievementService(db)
    # 공개 목록: progress 제외하고 unlocked 항상 False 로 표시 (보안 단순화)
    data = []
    for a in svc.list_active():
        cond = a.condition if isinstance(a.condition, dict) else {}
        data.append(AchievementProgressItem(
            code=a.code,
            title=a.title,
            description=a.description,
            icon=a.icon,
            badge_color=a.badge_color,
            reward_coins=a.reward_coins,
            reward_gold=0,
            progress=0,
            threshold=cond.get("threshold"),
            unlocked=False,
        ))
    return {"items": data}


@router.get("/achievements/my", response_model=AchievementProgressResponse)
def my_achievements(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    svc = AchievementService(db)
    items = [AchievementProgressItem(**row) for row in svc.user_progress(current_user.id)]
    return {"items": items}

# ----------------------------- GameHistory 기반 통계 스키마 -----------------------------
class GameTypeStats(BaseModel):
    game_type: str
    play_count: int
    net_coin: int
    net_gem: int
    wins: int
    losses: int
    last_played_at: Optional[datetime]

class ProfileAggregateStats(BaseModel):
    user_id: int
    total_play_count: int
    total_net_coin: int
    total_net_gem: int
    distinct_game_types: int
    favorite_game_type: Optional[str]
    recent_game_types: List[str]
    last_played_at: Optional[datetime]

# ----------------------------- Follow API 스키마 -----------------------------
class FollowActionResponse(BaseModel):
    success: bool
    following: bool
    target_user_id: int
    follower_count: int
    following_count: int

class FollowListItem(BaseModel):
    user_id: int
    nickname: str
    followed_at: datetime

class FollowListResponse(BaseModel):
    total: int
    items: List[FollowListItem]

# ----------------------------- Game Session API -----------------------------
class GameSessionStartResponse(BaseModel):
    session_id: str
    status: str
    started_at: datetime
    game_type: str
    bet_amount: int

class GameSessionEndResponse(BaseModel):
    session_id: str
    status: str
    duration: Optional[int]
    total_bet: int
    total_win: int
    game_type: str
    # 추가: result_data 요약 노출 (선택)
    result_data: Optional[Dict[str, Any]] = None

# ----------------------------- Stats Models -----------------------------
class GameBasicStatsItem(BaseModel):
    game_type: str
    total_hands: int
    wins: int
    win_rate: float
    total_bet: int
    total_win: int
    net: int
    roi: float

class GameBasicStatsResponse(BaseModel):
    items: List[GameBasicStatsItem]

# ----------------------------- Realtime WebSocket Endpoints -----------------------------
@router.websocket("/ws")
async def user_game_ws(
    websocket: WebSocket,
    token: Optional[str] = None,
):
    # Feature flag: optionally disable legacy endpoint entirely
    if not settings.ENABLE_LEGACY_GAMES_WS:
        try:
            if _legacy_ws_conn_total:
                _legacy_ws_conn_total.inc()
            if _legacy_ws_conn_by_result:
                _legacy_ws_conn_by_result.labels(result='rejected').inc()
        except Exception:
            pass
        # Accept then close with policy violation to surface deprecation clearly
        await websocket.accept()
        await websocket.close(code=4403)
        # Log a structured warning for monitoring
        logger.warning("legacy_ws_rejected: path=/api/games/ws enabled=%s", settings.ENABLE_LEGACY_GAMES_WS)
        return
    else:
        try:
            if _legacy_ws_conn_total:
                _legacy_ws_conn_total.inc()
            if _legacy_ws_conn_by_result:
                _legacy_ws_conn_by_result.labels(result='accepted').inc()
        except Exception:
            pass
        logger.warning("legacy_ws_used: /api/games/ws connection attempted (deprecated)")
    """사용자 개인 게임 이벤트 피드

    쿼리파라미터 token 또는 헤더 Authorization Bearer 지원 (FastAPI WebSocket은 Depends 간편사용 제한 -> 수동 검증)
    """
    from ..services.auth_service import AuthService  # type: ignore
    from ..models.auth_models import User  # type: ignore
    from ..database import SessionLocal  # type: ignore
    from ..realtime import hub
    await websocket.accept()
    db = SessionLocal()
    user = None
    try:
        if token is None:
            # header에서 추출
            auth = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
            if auth and auth.lower().startswith("bearer "):
                token = auth.split()[1]
        if not token:
            await websocket.close(code=4401)
            return
        token_data = AuthService.verify_token(token, db=db)
        user = db.query(User).filter(User.id == token_data.user_id).first()
        if not user:
            await websocket.close(code=4403)
            return
        await hub.register_user(user.id, websocket)
        # 간단한 hello
        await websocket.send_json({"type": "ws_ack", "user_id": user.id})
        while True:
            try:
                _ = await websocket.receive_text()
                # ping ignore / client -> no-op
            except WebSocketDisconnect:
                break
            except Exception:
                break
    finally:
        if user:
            try:
                await hub.unregister_user(user.id, websocket)
            except Exception:
                pass
        await websocket.close()
        db.close()

@router.websocket("/ws/monitor")
async def monitor_game_ws(websocket: WebSocket, token: Optional[str] = None):
    """관리자/모니터 WebSocket (전체 사용자 이벤트 구독 + 스냅샷 1회)
    간단 권한 체크: is_admin True 필요
    """
    from ..services.auth_service import AuthService  # type: ignore
    from ..models.auth_models import User  # type: ignore
    from ..database import SessionLocal  # type: ignore
    from ..realtime import hub
    await websocket.accept()
    db = SessionLocal()
    user = None
    try:
        if token is None:
            auth = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
            if auth and auth.lower().startswith("bearer "):
                token = auth.split()[1]
        if not token:
            await websocket.close(code=4401)
            return
        token_data = AuthService.verify_token(token, db=db)
        user = db.query(User).filter(User.id == token_data.user_id).first()
        if not user or not getattr(user, "is_admin", False):
            await websocket.close(code=4403)
            return
        await hub.register_monitor(websocket)
        snapshot = await hub.snapshot_for_monitor()
        await websocket.send_json(snapshot)
        while True:
            try:
                _ = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except Exception:
                break
    finally:
        try:
            await hub.unregister_monitor(websocket)
        except Exception:
            pass
        await websocket.close()
        db.close()

# ----------------------------- Stats Endpoint -----------------------------
@router.get("/stats/basic", response_model=GameBasicStatsResponse)
def get_basic_stats(
    game_type: Optional[str] = Query(None),
    user_scope: Optional[bool] = Query(True, description="True=자신의 통계, False=전체(관리자 필요)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from ..services.stats_service import GameStatsService  # lazy import
    if user_scope:
        items = GameStatsService(db).basic_stats(user_id=current_user.id, game_type=game_type)
    else:
        if not getattr(current_user, "is_admin", False):
            raise HTTPException(status_code=403, detail="admin required")
        items = GameStatsService(db).basic_stats(game_type=game_type)
    return {"items": items}

@router.post("/session/start", response_model=GameSessionStartResponse)
async def start_game_session(
    payload: GameSessionStart,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 활성 세션 존재 확인
    active = db.query(GameSessionModel).filter(
        GameSessionModel.user_id == current_user.id,
        GameSessionModel.status == "active",
        GameSessionModel.game_type == payload.game_type
    ).first()
    if active:
        raise HTTPException(status_code=409, detail="Active session already exists")

    import uuid
    ext_id = str(uuid.uuid4())
    now = datetime.utcnow()
    session_row = GameSessionModel(
        external_session_id=ext_id,
        user_id=current_user.id,
        game_type=payload.game_type,
        initial_bet=payload.bet_amount or 0,
        total_bet=payload.bet_amount or 0,
        total_rounds=0,
        status="active",
        start_time=now,
    )
    db.add(session_row)
    db.flush()  # id 확보
    # GameHistory 기록
    log_game_history(
        db,
        user_id=current_user.id,
        game_type=payload.game_type,
        action_type="SESSION_START",
        session_id=session_row.id,
        result_meta={"external_session_id": ext_id, "bet_amount": payload.bet_amount or 0}
    )
    db.refresh(session_row)
    # 브로드캐스트
    try:
        broadcast_game_session_event = _lazy_broadcast_game_session_event()
        await broadcast_game_session_event({
            "event": "start",
            "session_id": session_row.id,
            "external_session_id": ext_id,
            "user_id": current_user.id,
            "game_type": payload.game_type,
            "bet_amount": payload.bet_amount or 0,
            "ts": now.isoformat()
        })
    except Exception:
        pass
    return {
        "session_id": ext_id,
        "status": "active",
        "started_at": now,
    }

# ---------------------------------------------------------------------------
# Admin utility endpoints
# ---------------------------------------------------------------------------
@router.post("/stats/recalculate/{user_id}")
def recalc_user_game_stats(user_id: int, db: Session = Depends(get_db), current_admin = Depends(get_current_admin)):
    """Recalculate authoritative aggregated stats for a user (crash only MVP)."""
    from ..services.game_stats_service import GameStatsService
    svc = GameStatsService(db)
    stats = svc.recalculate_user(user_id)
    if not stats:
        raise HTTPException(status_code=404, detail="No stats or history found")
    return {"success": True, "stats": stats.as_dict()}

@router.post("/session/end", response_model=GameSessionEndResponse)
async def end_game_session(
    payload: GameSessionEnd,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # external_session_id 매핑
    session_row = db.query(GameSessionModel).filter(
        GameSessionModel.external_session_id == payload.session_id,
        GameSessionModel.user_id == current_user.id
    ).first()
    if not session_row:
        raise HTTPException(status_code=404, detail="Session not found")
    if session_row.status != "active":
        raise HTTPException(status_code=409, detail="Session already ended")

    now = datetime.utcnow()
    session_row.end_time = now
    session_row.status = "ended"
    session_row.total_rounds = payload.rounds_played
    session_row.total_bet = payload.total_bet
    session_row.total_win = payload.total_win
    # result_data 요약 구성 및 저장 (세션 KPI)
    summary = {
        "duration": payload.duration,
        "rounds": payload.rounds_played,
        "total_bet": payload.total_bet,
        "total_win": payload.total_win,
        "net": (payload.total_win - payload.total_bet),
        "roi": ((payload.total_win - payload.total_bet) / payload.total_bet) if payload.total_bet else 0,
        "game_result": payload.game_result or {},
    }
    try:
        session_row.result_data = summary
    except Exception:
        # JSON 직렬화 실패 시 텍스트 fallback
        try:
            import json as _json
            session_row.result_data = _json.dumps(summary, default=str)  # type: ignore
        except Exception:
            session_row.result_data = None  # 최종 포기
    db.add(session_row)
    db.flush()

    log_game_history(
        db,
        user_id=current_user.id,
        game_type=session_row.game_type,
        action_type="SESSION_END",
        session_id=session_row.id,
        result_meta={
            "external_session_id": payload.session_id,
            "duration": payload.duration,
            "rounds": payload.rounds_played,
            "total_bet": payload.total_bet,
            "total_win": payload.total_win,
            "result": payload.game_result or {}
        }
    )

    try:
        broadcast_game_session_event = _lazy_broadcast_game_session_event()
        await broadcast_game_session_event({
            "event": "end",
            "session_id": session_row.id,
            "external_session_id": payload.session_id,
            "user_id": current_user.id,
            "duration": payload.duration,
            "total_bet": payload.total_bet,
            "total_win": payload.total_win,
            "game_type": session_row.game_type,
            "ts": now.isoformat(),
            "result_data": summary,
        })
    except Exception:
        pass

    duration = payload.duration
    return {
        "session_id": payload.session_id,
        "status": "ended",
        "duration": duration,
        "total_bet": payload.total_bet,
        "total_win": payload.total_win,
        "game_type": session_row.game_type,
        "result_data": summary,
    }

@router.get("/session/active", response_model=GameSession)
async def get_active_session(
    game_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(GameSessionModel).filter(
        GameSessionModel.user_id == current_user.id,
        GameSessionModel.status == "active"
    )
    if game_type:
        q = q.filter(GameSessionModel.game_type == game_type)
    row = q.order_by(GameSessionModel.start_time.desc()).first()
    if not row:
        raise HTTPException(status_code=404, detail="No active session")
    return GameSession(
        session_id=row.external_session_id,
        user_id=row.user_id,
        game_type=row.game_type,
        start_time=row.start_time,
        duration=None,
        current_bet=row.initial_bet,
        current_round=row.total_rounds,
        status=row.status
    )
# 가챠 확률 공개/구성 조회
@router.get("/gacha/config")
async def get_gacha_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = GameService(db)
    return svc.gacha_service.get_config()

# 유저별 가챠 통계/히스토리 요약
@router.get("/gacha/stats")
async def get_gacha_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = GameService(db)
    return svc.gacha_service.get_user_gacha_stats(current_user.id)

# ================= Existing Simple Game Feature Endpoints =================

@router.get("/")
async def get_games_list(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    게임 목록 조회 (직접 JSON 반환)
    """
    games = db.query(Game).filter(Game.is_active == True).all()
    result = []
    
    for game in games:
        # 직접 JSON 형식 준비
        game_data = {
            "id": str(game.id),
            "name": game.name,
            "description": game.description,
            "type": game.game_type,
            "image_url": getattr(game, 'image_url', f"/assets/games/{game.game_type}.png"),
            "is_active": game.is_active,
            "daily_limit": None,
            "playCount": 0,
            "bestScore": 0,
            "canPlay": True,
            "cooldown_remaining": None,
            "requires_vip_tier": None
        }
        result.append(game_data)
    
    # 직접 JSON 반환
    return Response(content=json.dumps(result), media_type="application/json")

# 슬롯 게임 엔드포인트
@router.post("/slot/spin", response_model=SlotSpinResponse)
async def spin_slot(
    request: SlotSpinRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    슬롯머신 스핀
    """
    bet_amount = request.bet_amount
    
    # 잔액 확인 (토큰 잔액)
    current_tokens = SimpleUserService.get_user_tokens(db, current_user.id)
    if current_tokens < bet_amount:
        raise HTTPException(status_code=400, detail="토큰이 부족합니다")
    
    # 슬롯 결과 생성
    # Load symbol weights from settings with safe fallback
    cfg_weights = getattr(settings, 'SLOT_SYMBOL_WEIGHTS', None) or {
        '🍒': 30, '🍋': 25, '🍊': 20, '🍇': 15, '💎': 8, '7️⃣': 2
    }
    # keep order stable for reproducibility in tests
    symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣']
    weights = [cfg_weights.get(sym, 1) for sym in symbols]
    reels = [random.choices(symbols, weights=weights)[0] for _ in range(3)]
    
    # 승리 판정
    win_amount = 0
    if reels[0] == reels[1] == reels[2]:
        multiplier = {'🍒': 2, '🍋': 3, '🍊': 4, '🍇': 5, '💎': 10, '7️⃣': 50}
        win_amount = bet_amount * multiplier.get(reels[0], 1)
    elif reels[0] == reels[1] or reels[1] == reels[2]:
        win_amount = int(bet_amount * 1.5)
    
    # 스트릭/변동 보상: 플레이 스트릭 증가(24h TTL) 및 소폭 보너스 가중치
    # 슬롯 플레이 스트릭은 "플레이 연속 시도" 기준으로 증가(승패 무관). 보너스는 승리 시에만 적용.
    streak_count = 0
    try:
        streak_count = update_streak_counter(str(current_user.id), "SLOT_SPIN", increment=True)
    except Exception:
        streak_count = 0

    if win_amount > 0:
        # 최대 +20%까지 승리 보너스 (연속 시도 기반) + 경미한 랜덤 변동(±5%)
        bonus_multiplier = 1.0 + min(max(streak_count, 0) * 0.02, 0.20)
        rng_variation = random.uniform(0.95, 1.05)
        win_amount = int(win_amount * bonus_multiplier * rng_variation)

    # 잔액 업데이트
    new_balance = SimpleUserService.update_user_tokens(db, current_user.id, -bet_amount + win_amount)
    
    # 플레이 기록 저장
    action_data = {
        "game_type": "slot",
        "bet_amount": bet_amount,
        "win_amount": win_amount,
        "reels": reels,
        "is_jackpot": reels[0] == '7️⃣' and reels[0] == reels[1] == reels[2]
    }
    
    _log_user_action(
        db,
        user_id=current_user.id,
        action_type="SLOT_SPIN",
        data={**action_data, "streak": streak_count}
    )
    
    message = "Jackpot!" if action_data["is_jackpot"] else ("Win" if win_amount > 0 else "Better luck next time")
    # SlotSpinResponse expects reels as List[List[str]]
    reels_matrix = [reels]
    # Derive an effective multiplier for reference (0 on lose)
    eff_multiplier = 0.0 if bet_amount <= 0 else round(win_amount / float(bet_amount), 2)
    # GameHistory 로그 (return 이전)
    try:
        delta = -bet_amount + win_amount
        log_game_history(
            db,
            user_id=current_user.id,
            game_type="slot",
            action_type="WIN" if win_amount > 0 else "BET",
            delta_coin=delta,
            result_meta={"reels": reels, "bet": bet_amount, "win": win_amount, "jackpot": action_data["is_jackpot"], "streak": streak_count}
        )
    except Exception as e:
        logger.warning(f"slot spin history log failed: {e}")
    # 실시간 브로드캐스트 (실패 허용)
    try:
        from ..realtime import hub
        await hub.broadcast({
            "type": "game_event",
            "subtype": "slot_spin",
            "user_id": current_user.id,
            "game_type": "slot",
            "bet": bet_amount,
            "win": win_amount,
            "reels": reels,
            "jackpot": action_data["is_jackpot"],
            "streak": streak_count,
        })
    except Exception:
        pass
    near_miss_anim = 'near_miss' if win_amount == 0 and (reels[0] == reels[1] or reels[1] == reels[2]) else None
    feedback = _build_feedback(
        domain="slot",
        event=("jackpot" if action_data["is_jackpot"] else ("win" if win_amount > 0 else "lose")),
        message=message,
        animation=near_miss_anim or ("jackpot" if action_data["is_jackpot"] else None),
        streak=streak_count,
        extra={"bet": bet_amount, "win": win_amount, "reels": reels}
    )
    return {
        'success': True,
        'reels': reels_matrix,
        'win_amount': win_amount,
        'win_lines': [],
        'multiplier': eff_multiplier if win_amount > 0 else 0.0,
        'is_jackpot': action_data["is_jackpot"],
        'free_spins_awarded': 0,
        'message': message,
        'balance': new_balance,
        'special_animation': near_miss_anim,
        'feedback': feedback,
    'net_change': win_amount - bet_amount,
    }
    # (도달 불가) 위 return 위에 브로드캐스트 삽입 완료


# 가위바위보 엔드포인트
@router.post("/rps/play", response_model=RPSPlayResponse)
async def play_rps(
    request: RPSPlayRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    가위바위보 플레이
    """
    user_choice = request.choice
    bet_amount = request.bet_amount
    
    # 잔액 확인
    current_tokens = SimpleUserService.get_user_tokens(db, current_user.id)
    if current_tokens < bet_amount:
        raise HTTPException(status_code=400, detail="토큰이 부족합니다")
    
    # AI 선택
    choices = ['rock', 'paper', 'scissors']
    ai_choice = random.choice(choices)
    
    # 승부 판정
    result = 'draw'
    win_amount = 0
    
    if user_choice == ai_choice:
        result = 'draw'
        win_amount = bet_amount  # 무승부시 베팅금액 반환
    elif (
        (user_choice == 'rock' and ai_choice == 'scissors') or
        (user_choice == 'paper' and ai_choice == 'rock') or
        (user_choice == 'scissors' and ai_choice == 'paper')
    ):
        result = 'win'
        win_amount = bet_amount * 2
    else:
        result = 'lose'
        win_amount = 0
    
    # 잔액 업데이트
    new_balance = SimpleUserService.update_user_tokens(db, current_user.id, -bet_amount + win_amount)
    
    # 플레이 기록 저장
    action_data = {
        "game_type": "rps",
        "bet_amount": bet_amount,
        "win_amount": win_amount,
        "user_choice": user_choice,
        "ai_choice": ai_choice,
        "result": result
    }
    
    _log_user_action(
        db,
        user_id=current_user.id,
        action_type="RPS_PLAY",
        data=action_data
    )
    
    # Build response matching schema
    message_map = {
        'win': 'You win!',
        'lose': 'You lose!',
        'draw': 'It\'s a draw.'
    }
    # GameHistory 로그 (return 이전)
    try:
        delta = -bet_amount + win_amount
        log_game_history(
            db,
            user_id=current_user.id,
            game_type="rps",
            action_type="WIN" if result == 'win' else ("DRAW" if result == 'draw' else "BET"),
            delta_coin=delta,
            result_meta={"bet": bet_amount, "user_choice": user_choice, "ai_choice": ai_choice, "result": result}
        )
    except Exception as e:
        logger.warning(f"rps play history log failed: {e}")
    # 실시간 브로드캐스트 (실패 허용)
    try:
        from ..realtime import hub
        await hub.broadcast({
            "type": "game_event",
            "subtype": "rps_play",
            "user_id": current_user.id,
            "game_type": "rps",
            "bet": bet_amount,
            "win": win_amount,
            "result": result,
            "user_choice": user_choice,
            "ai_choice": ai_choice,
        })
    except Exception:
        pass
    return {
        'success': True,
        'player_choice': user_choice,
        'computer_choice': ai_choice,
        'result': result,
        'win_amount': win_amount,
        'message': message_map[result],
        'balance': new_balance,
        'streak': None,
    }

# 가챠 엔드포인트
@router.post("/gacha/pull", response_model=GachaPullResponse)
async def pull_gacha(
    request: GachaPullRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    가챠 뽑기 (서비스 레이어 위임: 피티, 근접실패, 10연 할인 적용)
    """
    pull_count = max(1, int(request.pull_count or 1))

    # 서비스 초기화 및 실행 전 잔액 캡처(net_change 계산용)
    game_service = GameService(db)
    try:
        old_balance = SimpleUserService.get_user_tokens(db, current_user.id)
    except Exception:
        old_balance = None

    # pull_count을 10연 단위와 단일 뽑기로 배치 실행
    batches_of_10 = pull_count // 10
    singles = pull_count % 10

    all_results: list[str] = []
    last_animation: str | None = None
    last_message: str | None = None

    # 10연 배치 실행
    for _ in range(batches_of_10):
        try:
            res = game_service.gacha_pull(current_user.id, 10)
        except ValueError as ve:
            msg = str(ve)
            if "일일 가챠" in msg:
                # 표준화: 일일 한도 초과 → 429 + 구조화 detail
                raise HTTPException(status_code=429, detail={"code": "DAILY_GACHA_LIMIT", "message": msg})
            raise HTTPException(status_code=400, detail=msg)
        all_results.extend(res.results)
        last_animation = res.animation_type or last_animation
        last_message = res.psychological_message or last_message

    # 단일 실행
    for _ in range(singles):
        try:
            res = game_service.gacha_pull(current_user.id, 1)
        except ValueError as ve:
            msg = str(ve)
            if "일일 가챠" in msg:
                raise HTTPException(status_code=429, detail={"code": "DAILY_GACHA_LIMIT", "message": msg})
            raise HTTPException(status_code=400, detail=msg)
        all_results.extend(res.results)
        last_animation = res.animation_type or last_animation
        last_message = res.psychological_message or last_message

    # 현재 잔액 조회
    new_balance = SimpleUserService.get_user_tokens(db, current_user.id)
    net_change = None
    if old_balance is not None and new_balance is not None:
        net_change = new_balance - old_balance

    # 결과를 응답 스키마에 맞게 매핑
    def _to_item(result_token: str) -> Dict[str, Any]:
        # 결과 토큰에서 실제 희귀도 추출 (near_miss 접미사 제거)
        base = (
            result_token.replace("_near_miss_epic", "")
            .replace("_near_miss_legendary", "")
            .replace("_near_miss", "")
        )
        rarity = base.lower()
        name = f"{rarity.capitalize()} Item"
        return {"name": name, "rarity": rarity}

    items = [_to_item(tok) for tok in all_results[:pull_count]]

    # 카운트 집계
    rare_count = sum(1 for it in items if it["rarity"] == "rare")
    ultra_rare_count = sum(1 for it in items if it["rarity"] in ("epic", "legendary"))

    # special_animation: mirror animation_type for non-normal states for easier FE handling
    special_anim = last_animation if (last_animation in {"near_miss", "epic", "legendary", "pity"}) else None

    # 표준 사용자 액션 로깅 (요약 데이터)
    try:
        summary = {
            "game_type": "gacha",
            "pull_count": pull_count,
            "rare_count": rare_count,
            "ultra_rare_count": ultra_rare_count,
            "anim": special_anim,
            "last_animation": last_animation,
            "items_sample": items[:3],  # 과도한 길이 방지
        }
        _log_user_action(
            db,
            user_id=current_user.id,
            action_type="GACHA_PULL",
            data=summary,
        )
    except Exception:
        pass

    # 실시간 브로드캐스트 (실패 허용)
    try:
        from ..realtime import hub
        await hub.broadcast({
            "type": "game_event",
            "subtype": "gacha_pull",
            "user_id": current_user.id,
            "game_type": "gacha",
            "pull_count": pull_count,
            "rare": rare_count,
            "ultra_rare": ultra_rare_count,
            "anim": special_anim,
        })
    except Exception:
        pass
    # feedback 구성
    qualifier = None
    if last_animation in {"legendary", "epic"}:
        qualifier = last_animation
    event = "pity" if last_animation == "pity" else ("near_miss" if last_animation == "near_miss" else ("win" if ultra_rare_count or rare_count else "pull"))
    feedback = _build_feedback(
        domain="gacha",
        event=event,
        qualifier=qualifier,
        message=last_message or "다음 뽑기에 더 좋은 결과가 기다리고 있을지도 몰라요!",
        animation=last_animation if last_animation not in {None, "normal"} else None,
        extra={"pull_count": pull_count, "rare": rare_count, "ultra_rare": ultra_rare_count}
    )
    return {
        "success": True,
        "items": items,
        "rare_item_count": rare_count,
        "ultra_rare_item_count": ultra_rare_count,
        "pull_count": pull_count,
        "balance": new_balance,
        "special_animation": special_anim,
        "animation_type": last_animation or "normal",
        "psychological_message": last_message or "다음 뽑기에 더 좋은 결과가 기다리고 있을지도 몰라요!",
        "message": "Gacha pull completed",
        "currency_balance": {"tokens": new_balance},
        "feedback": feedback,
    "net_change": net_change,
    }

# 크래시 게임 엔드포인트
@router.post("/crash/bet", response_model=CrashBetResponse)
async def place_crash_bet(
    request: CrashBetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    크래시 게임 베팅 (단일 요청 내 시뮬레이션) 
    개선 사항:
    - 사용자 잔액 차감/승리 가산 단일 트랜잭션 처리
    - 동시 중복 제출 방지용 행 잠금(SELECT ... FOR UPDATE) 기반 멱등 (초간단)
    - broadcast 에 status 추가 (placed|auto_cashed)
    - potential_win 과 별도로 simulated_max_win 제공 (auto_cashout 미지정 시 혼동 제거)
    """
    bet_amount = request.bet_amount
    auto_cashout_multiplier = request.auto_cashout_multiplier

    # ---- 트랜잭션 스코프 시작 ----
    from sqlalchemy import select, text as _text
    from sqlalchemy.exc import SQLAlchemyError
    from ..models.auth_models import User as UserModel
    from ..core import economy
    from ..core.config import settings as _settings

    try:
        # 사용자 행 잠금 (비관적 락) → 동시 중복 베팅 중복 차감 방지
        user_row = db.execute(
            select(UserModel).where(UserModel.id == current_user.id).with_for_update()
        ).scalar_one_or_none()
        if not user_row:
            raise HTTPException(status_code=404, detail="사용자 없음")
        if user_row.gold_balance < bet_amount:
            raise HTTPException(status_code=400, detail="골드가 부족합니다")

        import uuid, random as _r
        game_id = str(uuid.uuid4())

        # 개선된 크래시 멀티플라이어 로직 - 더 실제적이고 예측 불가능한 시스템
        import time, hashlib
        seed = f"{current_user.id}:{int(time.time() * 1000)}:{game_id}"
        hash_val = int(hashlib.md5(seed.encode()).hexdigest()[:8], 16)
        
        # 5단계 확률 시스템으로 더 현실적인 분포 구현
        random_val = (hash_val % 10000) / 10000.0  # 0.0000 - 0.9999
        
        if random_val < 0.35:    # 35% - 1.0x ~ 1.5x (낮은 배수, 높은 확률)
            multiplier = 1.0 + (random_val / 0.35) * 0.5
        elif random_val < 0.60:  # 25% - 1.5x ~ 2.5x (중간 배수)  
            multiplier = 1.5 + ((random_val - 0.35) / 0.25) * 1.0
        elif random_val < 0.80:  # 20% - 2.5x ~ 5.0x (높은 배수)
            multiplier = 2.5 + ((random_val - 0.60) / 0.20) * 2.5
        elif random_val < 0.95:  # 15% - 5.0x ~ 10.0x (매우 높은 배수)
            multiplier = 5.0 + ((random_val - 0.80) / 0.15) * 5.0
        else:                   # 5% - 10.0x ~ 50.0x (잭팟 배수)
            multiplier = 10.0 + ((random_val - 0.95) / 0.05) * 40.0
            
        # 하우스 엣지 적용 (약 5% 하우스 수수료)
        multiplier = max(1.01, multiplier * 0.95)
        
        # 소수점 둘째 자리로 반올림
        multiplier = round(multiplier, 2)

        # 잔액 차감
        user_row.gold_balance -= bet_amount
        if user_row.gold_balance < 0:
            user_row.gold_balance = 0

        win_amount = 0
        status = "placed"
        
        # 자동 캐시아웃 로직 - 중복 당첨 방지
        if auto_cashout_multiplier and multiplier >= auto_cashout_multiplier:
            # 자동 캐시아웃 성공 - 한 번만 당첨 처리
            net_win = int(bet_amount * (auto_cashout_multiplier - 1.0))  # 순이익만 계산
            win_amount = net_win
            user_row.gold_balance += net_win  # 순이익만 추가
            status = "auto_cashed"
        else:
            # 크래시 발생 - 손실
            status = "crashed"

        new_balance = user_row.gold_balance

        # 로그(UserAction) → 기존 함수 재사용
        action_data = {
            "game_type": "crash",
            "bet_amount": bet_amount,
            "game_id": game_id,
            "auto_cashout": auto_cashout_multiplier,
            "actual_multiplier": multiplier,
            "win_amount": win_amount,
            "status": status,
        }
        _log_user_action(
            db,
            user_id=current_user.id,
            action_type="CRASH_BET",
            data=action_data
        )

        # crash_sessions / crash_bets upsert (동일 트랜잭션)
        db.execute(text(
            """
            INSERT INTO crash_sessions (external_session_id, user_id, bet_amount, status, auto_cashout_multiplier, actual_multiplier, win_amount)
            VALUES (:external_session_id, :user_id, :bet_amount, :status, :auto_cashout_multiplier, :actual_multiplier, :win_amount)
            ON CONFLICT (external_session_id) DO UPDATE SET
                auto_cashout_multiplier = EXCLUDED.auto_cashout_multiplier,
                actual_multiplier = EXCLUDED.actual_multiplier,
                win_amount = EXCLUDED.win_amount,
                status = CASE WHEN EXCLUDED.win_amount > 0 THEN 'cashed' ELSE crash_sessions.status END
            """
        ), {
            "external_session_id": game_id,
            "user_id": current_user.id,
            "bet_amount": bet_amount,
            "status": status if win_amount > 0 else "active",
            "auto_cashout_multiplier": auto_cashout_multiplier,
            "actual_multiplier": multiplier,
            "win_amount": win_amount,
        })
        db.execute(text(
            """
            INSERT INTO crash_bets (session_id, user_id, bet_amount, payout_amount, cashout_multiplier, status)
            SELECT s.id, :user_id, :bet_amount, :payout_amount, :cashout_multiplier,
                   CASE WHEN :payout_amount IS NOT NULL AND :payout_amount > 0 THEN 'cashed' ELSE 'placed' END
            FROM crash_sessions s
            WHERE s.external_session_id = :external_session_id
            """
        ), {
            "external_session_id": game_id,
            "user_id": current_user.id,
            "bet_amount": bet_amount,
            "payout_amount": win_amount if win_amount > 0 else None,
            "cashout_multiplier": auto_cashout_multiplier if win_amount > 0 else None,
        })

        # 유저 게임 통계 업데이트
        try:
            current_stats = current_user.game_stats or {}
            crash_stats = current_stats.get('crash', {
                'totalGames': 0,
                'highestMultiplier': 0,
                'totalCashedOut': 0,
                'averageMultiplier': 0
            })
            
            # 게임 카운트 증가
            crash_stats['totalGames'] = crash_stats.get('totalGames', 0) + 1
            
            # 성공적으로 캐시아웃한 경우에만 통계 업데이트
            if win_amount > 0:
                crash_stats['totalCashedOut'] = crash_stats.get('totalCashedOut', 0) + 1
                crash_stats['highestMultiplier'] = max(
                    crash_stats.get('highestMultiplier', 0),
                    auto_cashout_multiplier or 0
                )
                
                # 평균 멀티플라이어 계산
                current_avg = crash_stats.get('averageMultiplier', 0)
                total_cashed = crash_stats.get('totalCashedOut', 1)
                crash_stats['averageMultiplier'] = (
                    (current_avg * (total_cashed - 1) + (auto_cashout_multiplier or 0)) / total_cashed
                )
            
            # 업데이트된 통계를 저장
            current_stats['crash'] = crash_stats
            current_user.game_stats = current_stats
            db.add(current_user)
            
        except Exception as e:
            logger.warning(f"crash game stats update failed: {e}")

        # Server-authoritative aggregate stats (user_game_stats)
        try:
            from ..services.game_stats_service import GameStatsService as _GSS
            gss = _GSS(db)
            gss.update_from_round(
                user_id=current_user.id,
                bet_amount=bet_amount,
                win_amount=win_amount,
                final_multiplier=float(auto_cashout_multiplier or multiplier)
            )
        except Exception as e:  # pragma: no cover
            logger.warning("GameStatsService.update_from_round failed user=%s err=%s", current_user.id, e)

        # GameHistory
        try:
            delta = -bet_amount + win_amount
            log_game_history(
                db,
                user_id=current_user.id,
                game_type="crash",
                action_type="WIN" if win_amount > 0 else "BET",
                delta_coin=delta,
                result_meta={
                    "bet": bet_amount,
                    "auto_cashout": auto_cashout_multiplier,
                    "actual_multiplier": multiplier,
                    "win": win_amount,
                    "status": status,
                }
            )
        except Exception as e:
            logger.warning(f"crash bet history log failed: {e}")

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"crash bet failed: {e}")
        raise HTTPException(status_code=500, detail="크래시 베팅 처리 오류")

    # 실시간 브로드캐스트 (commit 후)
    try:
        from ..realtime import hub
        await hub.broadcast({
            "type": "game_event",
            "subtype": "crash_bet",
            "user_id": current_user.id,
            "game_type": "crash",
            "bet": bet_amount,
            "auto_cashout": auto_cashout_multiplier,
            "actual_multiplier": multiplier,
            "win": win_amount,
            "status": status,
        })
    except Exception:
        pass

    # potential_win / simulated_max_win 계산 (표시용)
    potential_win_raw = bet_amount * (auto_cashout_multiplier or multiplier)
    from ..core import economy as _economy  # 재사용
    v2_active = _economy.is_v2_active(_settings)
    if v2_active:
        potential_win = int(potential_win_raw * (1 - _economy.CRASH_HOUSE_EDGE_ADJUST))
    else:
        potential_win = int(potential_win_raw)
    simulated_max_win = int(bet_amount * multiplier)

    return {
        'success': True,
        'game_id': game_id,
        'bet_amount': bet_amount,
        'potential_win': potential_win,
        'max_multiplier': round(multiplier, 2),
        'message': 'Bet placed' if status == 'placed' else 'Auto-cashout triggered',
        'balance': new_balance,
        # 추가 노출(스키마에는 없지만 프론트 용 확장 - 추후 스키마 업데이트 필요 시 반영)
        'status': status,
        'simulated_max_win': simulated_max_win,
    }

# -------------------------------------------------------------------------
# ================= Integrated Unified Game API (from game_api.py) =================
@router.get("/stats/{user_id}", response_model=GameStats)
def get_game_stats(user_id: int, db: Session = Depends(get_db)):
    """사용자 전체 게임 통계 (슬롯/룰렛/가챠 등)"""
    total_spins = db.query(models.UserAction).filter(
        models.UserAction.user_id == user_id,
        models.UserAction.action_type.in_(['SLOT_SPIN', 'ROULETTE_SPIN', 'GACHA_PULL'])
    ).count()

    # TODO: 보상 테이블 존재 여부 검증 후 reward 집계 로직 조정 필요
    total_coins_won = 0
    total_gold_won = 0
    special_items_won = 0
    jackpots_won = db.query(models.UserAction).filter(
        models.UserAction.user_id == user_id,
        models.UserAction.action_data.contains('jackpot')
    ).count()

    return GameStats(
        user_id=user_id,
        total_spins=total_spins,
    total_coins_won=total_coins_won,
    total_gold_won=total_gold_won,
        special_items_won=special_items_won,
        jackpots_won=jackpots_won,
        bonus_spins_won=0,
        best_streak=0,
        current_streak=calculate_user_streak(user_id, db),
        last_spin_date=None
    )

# -------------------------------------------------------------------------
# Server-authoritative per-user aggregated crash stats (user_game_stats)
@router.get("/stats/me")
def get_my_authoritative_game_stats(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """현재 로그인 사용자에 대한 서버 권위 Crash GameStats.

    user_game_stats 테이블 row 없으면 생성 후 반환. (MVP: crash 전용)
    TODO: 멀티 게임 타입 확장 시 game_type 파라미터 도입.
    """
    try:
        from ..services.game_stats_service import GameStatsService as _GSS
        svc = _GSS(db)
        stats = svc.get_or_create(current_user.id)
        return {"success": True, "stats": {
            "user_id": stats.user_id,
            "total_bets": int(stats.total_bets or 0),
            "total_wins": int(stats.total_wins or 0),
            "total_losses": int(stats.total_losses or 0),
            "total_profit": float(stats.total_profit or 0),
            "highest_multiplier": float(stats.highest_multiplier) if stats.highest_multiplier is not None else None,
            "updated_at": stats.updated_at.isoformat() if stats.updated_at else None,
        }}
    except Exception as e:  # pragma: no cover
        logger.error("get_my_authoritative_game_stats failed user=%s err=%s", current_user.id, e)
        raise HTTPException(status_code=500, detail="GameStats 조회 실패")

@router.get("/profile/{user_id}/stats", response_model=ProfileGameStats)
def get_profile_game_stats(user_id: int, db: Session = Depends(get_db)):
    """프로필용 상세 게임 통계"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    week_ago = datetime.now() - timedelta(days=7)
    recent_actions = db.query(models.UserAction).filter(
        models.UserAction.user_id == user_id,
        models.UserAction.created_at >= week_ago
    ).count()

    favorite_game_query = db.query(
        models.UserAction.action_type,
        db.func.count(models.UserAction.id).label('count')
    ).filter(
        models.UserAction.user_id == user_id
    ).group_by(models.UserAction.action_type).order_by(db.text('count DESC')).first()
    favorite_game = favorite_game_query[0] if favorite_game_query else None

    return ProfileGameStats(
        user_id=user_id,
        total_games_played=db.query(models.UserAction).filter(models.UserAction.user_id == user_id).count(),
        favorite_game=favorite_game,
        recent_activities=[],  # TODO: 세부 활동 리스트 구성
        achievements=[],       # 아래 업적 엔드포인트에서 세부 제공
        current_session=None
    )

@router.get("/leaderboard", response_model=List[GameLeaderboard])
def get_game_leaderboard(game_type: Optional[str] = None, limit: int = 10, db: Session = Depends(get_db)):
    """게임별 또는 전체 리더보드"""
    if game_type:
        leaderboard_query = db.query(
            models.User.id,
            models.User.nickname,
            db.func.count(models.UserAction.id).label('score')
        ).join(
            models.UserAction, models.User.id == models.UserAction.user_id
        ).filter(
            models.UserAction.action_type == game_type
        ).group_by(
            models.User.id, models.User.nickname
        ).order_by(db.text('score DESC')).limit(limit).all()
    else:
        leaderboard_query = db.query(
            models.User.id,
            models.User.nickname,
            models.User.total_spent.label('score')
        ).order_by(models.User.total_spent.desc()).limit(limit).all()

    results: List[GameLeaderboard] = []
    # NOTE: GameLeaderboard 스키마 구조 조정 필요할 수 있음 (현재 정의와 불일치 가능)
    for rank, (user_id, nickname, score) in enumerate(leaderboard_query, 1):
        results.append(GameLeaderboard(
            game_type=game_type or 'overall',
            period='daily',
            entries=[],  # 간단화 - 상세 항목 분리 가능
            user_rank=rank,
            updated_at=datetime.utcnow()
        ))
    return results

@router.get("/achievements/{user_id}", response_model=List[Achievement])
def get_user_achievements(user_id: int, db: Session = Depends(get_db)):
    """사용자 업적 목록 (기본 예시)"""
    # TODO: 실제 업적 계산 로직 통합
    sample = Achievement(
        id=1,
        name="First Spin",
        description="첫 게임 플레이 완료",
        badge_icon="🎯",
        badge_color="#FFD700",
        achieved_at=datetime.utcnow(),
        progress=1.0
    )
    return [sample]

# (legacy /session/start, /session/end 엔드포인트 제거됨 - 영속 버전 상단 구현 사용)

# Helper
from uuid import uuid4

def calculate_user_streak(user_id: int, db: Session) -> int:
    today = datetime.utcnow().date()
    streak = 0
    for i in range(30):
        check_date = today - timedelta(days=i)
        activity = db.query(models.UserAction).filter(
            models.UserAction.user_id == user_id,
            func.date(models.UserAction.created_at) == check_date
        ).first()
        if activity:
            streak += 1
        else:
            break
    return streak

# --------------------------- GameHistory 조회 엔드포인트 ---------------------------
@router.get("/history", response_model=GameHistoryListResponse)
def get_game_history(
    game_type: Optional[str] = None,
    action_type: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """현재 사용자 GameHistory 조회

    필터:
      - game_type, action_type (정확 일치)
      - since (ISO8601 문자열) 이후
    페이지네이션:
      - limit / offset
    정렬: 최신(created_at desc)
    """
    from ..models.history_models import GameHistory
    q = db.query(GameHistory).filter(GameHistory.user_id == current_user.id)
    if game_type:
        q = q.filter(GameHistory.game_type == game_type)
    if action_type:
        q = q.filter(GameHistory.action_type == action_type)
    if since:
        try:
            dt = datetime.fromisoformat(since.replace('Z',''))
            q = q.filter(GameHistory.created_at >= dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="since 형식이 잘못되었습니다(ISO8601)")
    total = q.count()
    items = q.order_by(GameHistory.created_at.desc()).limit(min(limit, 200)).offset(offset).all()
    return GameHistoryListResponse(
        total=total,
        items=items,
        limit=min(limit,200),
        offset=offset
    )

# ----------------------------- /api/games/{game_type}/stats (GameHistory) -----------------------------
@router.get("/{game_type}/stats", response_model=GameTypeStats)
def get_game_type_stats(
    game_type: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from ..models.history_models import GameHistory
    q = db.query(GameHistory).filter(
        GameHistory.user_id == current_user.id,
        GameHistory.game_type == game_type
    )
    play_count = q.count()
    agg = db.query(
        db.func.coalesce(db.func.sum(GameHistory.delta_coin), 0),
        db.func.coalesce(db.func.sum(GameHistory.delta_gem), 0),
        db.func.coalesce(db.func.sum(db.case((GameHistory.action_type == 'WIN', 1), else_=0)), 0),
        db.func.coalesce(db.func.sum(db.case((GameHistory.action_type.in_(['BET','LOSE']), 1), else_=0)), 0),
        db.func.max(GameHistory.created_at)
    ).filter(
        GameHistory.user_id == current_user.id,
        GameHistory.game_type == game_type
    ).one()
    net_coin, net_gem, wins, losses, last_played = agg
    return GameTypeStats(
        game_type=game_type,
        play_count=play_count,
        net_coin=net_coin,
        net_gem=net_gem,
        wins=wins,
        losses=losses,
        last_played_at=last_played
    )

# ----------------------------- /api/profile/stats (GameHistory) -----------------------------
@router.get("/profile/stats", response_model=ProfileAggregateStats)
def get_profile_stats(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from ..models.history_models import GameHistory
    base_q = db.query(GameHistory).filter(GameHistory.user_id == current_user.id)
    total_play = base_q.count()
    sums = db.query(
        db.func.coalesce(db.func.sum(GameHistory.delta_coin), 0),
        db.func.coalesce(db.func.sum(GameHistory.delta_gem), 0),
        db.func.max(GameHistory.created_at)
    ).filter(GameHistory.user_id == current_user.id).one()
    net_coin, net_gem, last_played = sums
    # 즐겨찾기 게임: play count 상위 1개
    fav_row = db.query(
        GameHistory.game_type,
        db.func.count(GameHistory.id).label('cnt')
    ).filter(GameHistory.user_id == current_user.id).group_by(GameHistory.game_type).order_by(db.text('cnt DESC')).first()
    favorite = fav_row[0] if fav_row else None
    distinct_game_types = db.query(db.func.count(db.func.distinct(GameHistory.game_type))).filter(GameHistory.user_id == current_user.id).scalar() or 0
    recent_game_types_rows = db.query(GameHistory.game_type).filter(GameHistory.user_id == current_user.id).order_by(GameHistory.created_at.desc()).limit(5).all()
    recent_game_types = []
    seen = set()
    for (gt,) in recent_game_types_rows:
        if gt not in seen:
            seen.add(gt)
            recent_game_types.append(gt)
        if len(recent_game_types) >= 5:
            break
    return ProfileAggregateStats(
        user_id=current_user.id,
        total_play_count=total_play,
        total_net_coin=net_coin,
        total_net_gem=net_gem,
        distinct_game_types=distinct_game_types,
        favorite_game_type=favorite,
        recent_game_types=recent_game_types,
        last_played_at=last_played
    )

# ----------------------------- Follow API 구현 -----------------------------
@router.post("/follow/{target_user_id}", response_model=FollowActionResponse)
def follow_user(
    target_user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from ..models.social_models import FollowRelation
    if target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신은 팔로우할 수 없습니다")
    # 대상 유저 존재 확인
    target = db.query(models.User).filter(models.User.id == target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="대상 유저를 찾을 수 없습니다")
    existing = db.query(FollowRelation).filter(
        FollowRelation.user_id == current_user.id,
        FollowRelation.target_user_id == target_user_id
    ).first()
    if existing:
        # 이미 팔로우 상태 → idempotent 응답
        follower_count = db.query(FollowRelation).filter(FollowRelation.target_user_id == target_user_id).count()
        following_count = db.query(FollowRelation).filter(FollowRelation.user_id == current_user.id).count()
        return FollowActionResponse(success=True, following=True, target_user_id=target_user_id, follower_count=follower_count, following_count=following_count)
    rel = FollowRelation(user_id=current_user.id, target_user_id=target_user_id)
    db.add(rel)
    db.commit()
    follower_count = db.query(FollowRelation).filter(FollowRelation.target_user_id == target_user_id).count()
    following_count = db.query(FollowRelation).filter(FollowRelation.user_id == current_user.id).count()
    return FollowActionResponse(success=True, following=True, target_user_id=target_user_id, follower_count=follower_count, following_count=following_count)

@router.delete("/follow/{target_user_id}", response_model=FollowActionResponse)
def unfollow_user(
    target_user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from ..models.social_models import FollowRelation
    rel = db.query(FollowRelation).filter(
        FollowRelation.user_id == current_user.id,
        FollowRelation.target_user_id == target_user_id
    ).first()
    if rel:
        db.delete(rel)
        db.commit()
    follower_count = db.query(FollowRelation).filter(FollowRelation.target_user_id == target_user_id).count()
    following_count = db.query(FollowRelation).filter(FollowRelation.user_id == current_user.id).count()
    return FollowActionResponse(success=True, following=False, target_user_id=target_user_id, follower_count=follower_count, following_count=following_count)

@router.get("/follow/list", response_model=FollowListResponse)
def list_following(
    limit: int = 50,
    offset: int = 0,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from ..models.social_models import FollowRelation
    q = db.query(FollowRelation, models.User).join(models.User, FollowRelation.target_user_id == models.User.id).filter(FollowRelation.user_id == current_user.id)
    total = q.count()
    rows = q.order_by(FollowRelation.created_at.desc()).limit(min(limit,200)).offset(offset).all()
    items = [
        FollowListItem(user_id=user.id, nickname=user.nickname, followed_at=rel.created_at)
        for rel, user in rows
    ]
    return FollowListResponse(total=total, items=items, limit=min(limit,200), offset=offset)

@router.get("/follow/followers", response_model=FollowListResponse)
def list_followers(
    limit: int = 50,
    offset: int = 0,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from ..models.social_models import FollowRelation
    q = db.query(FollowRelation, models.User).join(models.User, FollowRelation.user_id == models.User.id).filter(FollowRelation.target_user_id == current_user.id)
    total = q.count()
    rows = q.order_by(FollowRelation.created_at.desc()).limit(min(limit,200)).offset(offset).all()
    items = [
        FollowListItem(user_id=user.id, nickname=user.nickname, followed_at=rel.created_at)
        for rel, user in rows
    ]
    return FollowListResponse(total=total, items=items, limit=min(limit,200), offset=offset)
