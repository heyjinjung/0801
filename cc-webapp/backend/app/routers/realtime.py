"""실시간 전역 동기화 WebSocket 라우터

사용자별 실시간 데이터 동기화:
- 골드/레벨/경험치 변경
- 업적/스트릭 진행도 업데이트  
- 이벤트 참여/완료 상태
- 보상 지급 알림
- 게임 통계 변동

기존 games.py WebSocket과 분리된 전용 채널로 
UI 상단 헤더, 프로필, 통계 등의 실시간 반영 담당
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models.auth_models import User
from ..dependencies import get_current_user
from ..services.auth_service import AuthService
from ..realtime.hub import hub

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/realtime", tags=["Realtime Sync"])


@router.websocket("/sync")
async def user_sync_websocket(
    websocket: WebSocket,
    token: Optional[str] = None,
):
    """사용자별 실시간 동기화 WebSocket
    
    전송 이벤트 타입:
    - profile_update: 골드, 레벨, 경험치 등 기본 프로필 변경
    - achievement_progress: 업적 진행도 변경
    - streak_update: 스트릭 카운터 변경
    - event_progress: 이벤트 참여/진행 상태 변경
    - reward_granted: 보상 지급 알림
    - stats_update: 게임 통계 업데이트
    """
    from ..services.auth_service import AuthService
    
    await websocket.accept()
    db = SessionLocal()
    user = None
    
    try:
        # 토큰 인증
        if token is None:
            auth = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
            if auth and auth.lower().startswith("bearer "):
                token = auth.split()[1]
        
        if not token:
            await websocket.close(code=4401, reason="No token provided")
            return
            
        token_data = AuthService.verify_token(token, db=db)
        user = db.query(User).filter(User.id == token_data.user_id).first()
        
        if not user:
            await websocket.close(code=4401, reason="Invalid user")
            return
            
        # 허브에 사용자 등록
        await hub.register_user(user.id, websocket)
        logger.info(f"User {user.id} connected to realtime sync")
        
        # 연결 확인 메시지
        await websocket.send_json({
            "type": "sync_connected",
            "user_id": user.id,
            "timestamp": asyncio.get_event_loop().time()
        })
        
        # 초기 상태 전송
        initial_state = await get_user_sync_state(user.id, db)
        await websocket.send_json({
            "type": "initial_state",
            **initial_state
        })
        
        # 연결 유지 및 ping 처리
        while True:
            try:
                message = await websocket.receive_text()
                # 클라이언트에서 ping 메시지 처리
                if message == "ping":
                    await websocket.send_text("pong")
                    continue
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket error for user {user.id}: {e}")
                break
                
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        if user:
            try:
                await hub.unregister_user(user.id, websocket)
                logger.info(f"User {user.id} disconnected from realtime sync")
            except Exception as e:
                logger.error(f"Error unregistering user {user.id}: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
        db.close()


async def get_user_sync_state(user_id: int, db: Session) -> Dict[str, Any]:
    """사용자 초기 동기화 상태 데이터 수집"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {}
            
        # 기본 프로필 데이터
        profile_data = {
            "user_id": user.id,
            "gold_balance": getattr(user, 'gold_balance', 0),
            "level": getattr(user, 'battlepass_level', 1) or 1,
            "experience": getattr(user, 'total_experience', 0) or 0,
            "vip_points": getattr(user, 'vip_points', 0) or 0,
            "rank": getattr(user, 'user_rank', 'STANDARD'),
        }
        
        # Redis에서 스트릭 정보 가져오기
        streak_data = {}
        try:
            from ..utils.redis import get_streak_counter
            streak_count = get_streak_counter(str(user.id), "SLOT_SPIN")
            streak_data = {
                "streak_count": streak_count,
                "action_type": "SLOT_SPIN"
            }
        except Exception as e:
            logger.warning(f"Failed to get streak data for user {user_id}: {e}")
            
        # 업적 진행도 (간단한 카운트만)
        achievement_data = {}
        try:
            from ..services.achievement_service import AchievementService
            achievement_service = AchievementService(db)
            progress = achievement_service.user_progress(user.id)
            achievement_data = {
                "total_achievements": len(progress),
                "unlocked_count": len([p for p in progress if p.get("unlocked", False)])
            }
        except Exception as e:
            logger.warning(f"Failed to get achievement data for user {user_id}: {e}")
            
        return {
            "profile": profile_data,
            "streak": streak_data,
            "achievements": achievement_data,
            "timestamp": asyncio.get_event_loop().time()
        }
        
    except Exception as e:
        logger.error(f"Error getting sync state for user {user_id}: {e}")
        return {}


# 브로드캐스트 헬퍼 함수들
async def broadcast_profile_update(user_id: int, changes: Dict[str, Any]) -> None:
    """프로필 변경 브로드캐스트"""
    event = {
        "type": "profile_update",
        "user_id": user_id,
        "changes": changes,
        "timestamp": asyncio.get_event_loop().time()
    }
    await hub.broadcast(event)


async def broadcast_achievement_progress(user_id: int, achievement_code: str, progress: int, unlocked: bool = False) -> None:
    """업적 진행도 변경 브로드캐스트"""
    event = {
        "type": "achievement_progress",
        "user_id": user_id,
        "achievement_code": achievement_code,
        "progress": progress,
        "unlocked": unlocked,
        "timestamp": asyncio.get_event_loop().time()
    }
    await hub.broadcast(event)


async def broadcast_streak_update(user_id: int, action_type: str, streak_count: int) -> None:
    """스트릭 카운터 변경 브로드캐스트"""
    event = {
        "type": "streak_update",
        "user_id": user_id,
        "action_type": action_type,
        "streak_count": streak_count,
        "timestamp": asyncio.get_event_loop().time()
    }
    await hub.broadcast(event)


async def broadcast_event_progress(user_id: int, event_id: int, progress: Dict[str, Any], completed: bool = False) -> None:
    """이벤트 진행도 변경 브로드캐스트"""
    event = {
        "type": "event_progress",
        "user_id": user_id,
        "event_id": event_id,
        "progress": progress,
        "completed": completed,
        "timestamp": asyncio.get_event_loop().time()
    }
    await hub.broadcast(event)


async def broadcast_reward_granted(user_id: int, reward_type: str, amount: int, balance_after: int) -> None:
    """보상 지급 브로드캐스트"""
    event = {
        "type": "reward_granted",
        "user_id": user_id,
        "reward_type": reward_type,
        "amount": amount,
        "balance_after": balance_after,
        "timestamp": asyncio.get_event_loop().time()
    }
    await hub.broadcast(event)


async def broadcast_stats_update(user_id: int, stats: Dict[str, Any]) -> None:
    """게임 통계 업데이트 브로드캐스트"""
    event = {
        "type": "stats_update", 
        "user_id": user_id,
        "stats": stats,
        "timestamp": asyncio.get_event_loop().time()
    }
    await hub.broadcast(event)


async def broadcast_catalog_update(reason: str, item_id: int | None = None) -> None:
    """상점 카탈로그 변경 브로드캐스트 (글로벌 이벤트)

    reason 예: create|update|delete|discount|rank
    """
    event: Dict[str, Any] = {
        "type": "catalog_update",
        "reason": reason,
        "timestamp": asyncio.get_event_loop().time(),
    }
    if item_id is not None:
        event["item_id"] = item_id
    await hub.broadcast(event)


async def broadcast_purchase_update(
    user_id: int,
    *,
    status: str,
    product_id: str | None = None,
    receipt_code: str | None = None,
    reason_code: str | None = None,
    amount: int | None = None,
) -> None:
    """구매 상태 변경 브로드캐스트

    status 예시: success | failed | pending | idempotent_reuse | processing
    """
    event: Dict[str, Any] = {
        "type": "purchase_update",
        "user_id": user_id,
        "status": status,
        "timestamp": asyncio.get_event_loop().time(),
    }
    if product_id is not None:
        event["product_id"] = product_id
    if receipt_code is not None:
        event["receipt_code"] = receipt_code
    if reason_code is not None:
        event["reason_code"] = reason_code
    if amount is not None:
        event["amount"] = amount
    await hub.broadcast(event)


# 테스트용 엔드포인트 (개발 환경에서만)
@router.get("/test/broadcast")
async def test_broadcast(
    user_id: int,
    event_type: str = "test",
    current_user: User = Depends(get_current_user)
):
    """테스트용 브로드캐스트 (관리자만)"""
    if not getattr(current_user, 'is_admin', False):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin required")
        
    test_event = {
        "type": event_type,
        "user_id": user_id,
        "test_data": "Hello from test broadcast",
        "timestamp": asyncio.get_event_loop().time()
    }
    await hub.broadcast(test_event)
    
    return {"success": True, "event": test_event}
