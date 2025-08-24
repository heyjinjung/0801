# cc-webapp/backend/app/routers/rewards.py
from fastapi import APIRouter, Depends, HTTPException, Query, Path

from typing import List, Any, Optional # Any might not be needed if using specific Pydantic models
from pydantic import BaseModel, ConfigDict, Field, field_serializer
from datetime import timezone
from datetime import datetime
import json, logging
logger = logging.getLogger(__name__)
from app.core.config import settings

# Assuming models and database session setup are in these locations
from .. import models  # This should import UserReward and User
from ..database import get_db
from ..services.user_service import UserService
from ..dependencies import require_min_rank  # RBAC: rank-based access control

router = APIRouter(prefix="/api/rewards", tags=["Rewards"])

from ..services.reward_service import RewardService

# Pydantic model for distribution request
class RewardDistributionRequest(BaseModel):
    user_id: int
    reward_type: str
    amount: int
    source_description: str
    idempotency_key: Optional[str] = None
    metadata: Optional[dict] = None

# Pydantic model for individual reward item in the response
class RewardItem(BaseModel):
    id: int = Field(alias="reward_id")
    reward_type: str
    reward_value: str
    awarded_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @field_serializer("awarded_at")
    def serialize_awarded_at(self, dt: datetime):  # noqa: D401
        """Return ISO string with Z timezone."""
        return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

# Pydantic model for the overall response
class PaginatedRewardsResponse(BaseModel):
    rewards: List[RewardItem]
    page: int
    page_size: int
    total_rewards: int # Renamed from 'total' for clarity
    total_pages: int

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


@router.get(
    "/users/{user_id}/rewards",
    response_model=PaginatedRewardsResponse,
    tags=["Rewards"]  # "users" 태그 제거, "Rewards"로 통일
)
async def get_user_rewards(
    user_id: int = Path(..., title="The ID of the user to get rewards for", ge=1),
    page: int = Query(1, ge=1, description="Page number, 1-indexed"),
    page_size: int = Query(20, ge=1, le=100, description="Number of items per page"),
    db = Depends(get_db),
    user_service: UserService = Depends(lambda db=Depends(get_db): UserService(db))
):
    """
    Retrieves a paginated list of rewards for a specific user.
    """
    # First, check if user exists (optional, but good practice for FK constraints)
    try:
        user_service.get_user_or_error(user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Calculate offset
    offset = (page - 1) * page_size

    # Query for total count of rewards for the user
    total_rewards_count = db.query(models.UserReward).filter(models.UserReward.user_id == user_id).count()

    if total_rewards_count == 0:
        return PaginatedRewardsResponse(
            rewards=[],
            page=page,
            page_size=page_size,
            total_rewards=0,
            total_pages=0
        )

    total_pages = (total_rewards_count + page_size - 1) // page_size # Calculate total pages

    if offset >= total_rewards_count and page > 1 : # if page requested is beyond the total items
         raise HTTPException(
             status_code=404,
             detail=f"Page not found. Total items: {total_rewards_count}, total pages: {total_pages}. Requested page: {page}."
        )

    # Query for the paginated list of rewards joined with Reward to shape the response
    rows = (
        db.query(models.UserReward, models.Reward)
        .join(models.Reward, models.UserReward.reward_id == models.Reward.id)
        .filter(models.UserReward.user_id == user_id)
        .order_by(models.UserReward.claimed_at.desc())  # most recent first
        .offset(offset)
        .limit(page_size)
        .all()
    )

    rewards_list = [
        {
            "reward_id": reward.id,
            "reward_type": reward.reward_type,
            "reward_value": str(int(reward.value) if reward.value is not None else 0),
            "awarded_at": link.claimed_at,
        }
        for link, reward in rows
    ]

    return PaginatedRewardsResponse(
        rewards=rewards_list,
        page=page,
        page_size=page_size,
        total_rewards=total_rewards_count,
        total_pages=total_pages
    )

@router.post("/distribute", response_model=RewardItem, tags=["Rewards"])
async def distribute_reward_to_user(
    request: RewardDistributionRequest,
    db = Depends(get_db),
    # Require PREMIUM or higher for distribution endpoint (sensitive path)
    current_user = Depends(require_min_rank("PREMIUM")),
):
    """
    Distributes a specific reward to a user.
    This is the central endpoint for granting rewards from games or events.
    """
    reward_service = RewardService(db=db)
    try:
        result = reward_service.distribute_reward(
            user_id=request.user_id,
            reward_type=request.reward_type,
            amount=request.amount,
            source_description=request.source_description,
            idempotency_key=request.idempotency_key,
            metadata=request.metadata,
        )
        # 실시간 브로드캐스트: 보상 지급 + 프로필 변경 (best-effort)
        try:
            from ..realtime.hub import hub
            from ..models.auth_models import User as _User
            import asyncio
            # balance_after 계산 (gold_balance 기준 단일 통화)
            user = db.query(_User).filter(_User.id == request.user_id).first()
            balance_after = getattr(user, 'gold_balance', None)
            evt = {
                "type": "reward_granted",
                "user_id": request.user_id,
                "reward_type": request.reward_type,
                "amount": request.amount,
                "balance_after": balance_after,
            }
            prof = {
                "type": "profile_update",
                "user_id": request.user_id,
                "changes": {"gold_balance": balance_after},
            }
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(hub.broadcast(evt))
                loop.create_task(hub.broadcast(prof))
        except Exception:
            pass
        # Kafka 프로듀서 가져오기
        prod = get_producer()
        if prod:
            try:
                # Kafka에 메시지 전송
                prod.send(settings.KAFKA_REWARDS_TOPIC, {
                    "user_id": request.user_id,
                    "reward_type": request.reward_type,
                    "reward_value": request.amount,
                    "source": request.source_description or "",
                    "awarded_at": datetime.now(timezone.utc).isoformat(),
                })
            except Exception as e:
                logger.warning("Kafka produce failed: %s", e)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Kafka producer 설정
try:
    from kafka import KafkaProducer
    _producer = None
    def get_producer():
        global _producer
        if _producer is None and settings.KAFKA_ENABLED:
            _producer = KafkaProducer(
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS.split(","),
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
        return _producer
except Exception:
    def get_producer(): return None

# Ensure this router is included in app/main.py:
# from .routers import rewards
# app.include_router(rewards.router, prefix="/api", tags=["rewards"]) # Ensure tags are appropriate
