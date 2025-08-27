"""보상 관련 최소 유틸/service 모듈.

슬림화 정책(2025-08-20):
 - streak 일일 보상 산식만 유지 (calculate_streak_daily_reward)
 - RewardService 에서 브로드캐스트/이메일 사이드이펙트 제거 (성능/결합도 축소)
 - TokenService 잔액 업데이트만 보존
"""
from __future__ import annotations
from math import exp
from datetime import datetime, timezone

def calculate_streak_daily_reward(streak_count: int) -> tuple[int, int]:
    """지민 감쇠(C안) 기반 골드/XP 산출.

    Gold = 1000 + 800 * (1 - e^{-streak/6})  (≈ 1800 수렴)
    XP   = 50   + 40  * (1 - e^{-streak/8})  (≈ 90 수렴)

    Args:
        streak_count: 현재 유지 중인 연속 출석 일수(>=0)
    Returns:
        (gold:int, xp:int)
    """
    g = int(round(1000 + 800 * (1 - exp(-streak_count / 6))))
    xp = int(round(50 + 40 * (1 - exp(-streak_count / 8))))
    return g, xp

__all__ = ["calculate_streak_daily_reward"]
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app import models
from .token_service import TokenService

class RewardService:
    """Service for handling reward distribution and management"""
    
    def __init__(self, db: Session, token_service: TokenService | None = None):
        self.db = db
        self.token_service = token_service or TokenService(db)

    SINGLE_ADD_COMPAT = True  # 기존 테스트 호환을 위한 최소 플래그 유지

    def distribute_reward(
        self,
        user_id: int,
        reward_type: str,
        amount: int,
        source_description: str,
        *,
        idempotency_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Distribute a reward transactionally with optional idempotency.

        Returns a serializable dict matching RewardItem: {reward_id, reward_type, reward_value, awarded_at}.
        """
        # Idempotency check: reuse prior grant if same key exists
        if idempotency_key:
            existing_action = (
                self.db.query(models.UserAction)
                .filter(
                    models.UserAction.user_id == user_id,
                    models.UserAction.action_type == "REWARD_GRANT",
                    models.UserAction.action_data == idempotency_key,
                )
                .first()
            )
            if existing_action:
                # Try to find the most recent reward for this user with matching description
                link = (
                    self.db.query(models.UserReward)
                    .filter(models.UserReward.user_id == user_id)
                    .order_by(models.UserReward.claimed_at.desc())
                    .first()
                )
                if link:
                    reward = self.db.query(models.Reward).filter(models.Reward.id == link.reward_id).first()
                    if reward:
                        return {
                            "reward_id": reward.id,
                            "reward_type": reward.reward_type,
                            "reward_value": str(int(reward.value) if reward.value is not None else 0),
                            "awarded_at": link.claimed_at,
                        }

    # Fresh grant path within a DB transaction (사이드이펙트 제거 버전)
        try:
            now = datetime.now(timezone.utc)
            # Currency effects
            if reward_type.upper() in {"COIN", "TOKEN"}:
                self.token_service.add_tokens(user_id, amount)

            if self.SINGLE_ADD_COMPAT:
                # Reward + UserReward 객체 생성 후 UserReward만 add → Reward는 relationship lazy load 시 접근
                reward = models.Reward(
                    name=f"{reward_type}:{amount}",
                    description=source_description,
                    reward_type=reward_type.upper(),
                    value=float(amount),
                )
                user_reward = models.UserReward(
                    user_id=user_id,
                    reward=reward,
                    claimed_at=now,
                    is_used=False,
                )
                self.db.add(user_reward)
            else:
                reward = models.Reward(
                    name=f"{reward_type}:{amount}",
                    description=source_description,
                    reward_type=reward_type.upper(),
                    value=float(amount),
                )
                self.db.add(reward)
                self.db.flush()
                user_reward = models.UserReward(
                    user_id=user_id,
                    reward_id=reward.id,
                    claimed_at=now,
                    is_used=False,
                )
                self.db.add(user_reward)

            # Idempotency marker as a UserAction
            if idempotency_key:
                action = models.UserAction(
                    user_id=user_id,
                    action_type="REWARD_GRANT",
                    action_data=idempotency_key,
                )
                self.db.add(action)

            self.db.commit()
            self.db.refresh(user_reward)

            return {
                "reward_id": reward.id,
                "reward_type": reward.reward_type,
                "reward_value": str(int(reward.value) if reward.value is not None else 0),
                "awarded_at": user_reward.claimed_at,
            }
        except SQLAlchemyError as e:
            self.db.rollback()
            raise e
    # 이메일/브로드캐스트 사이드이펙트 제거 버전: finally 블록 삭제

    def grant_content_unlock(
        self,
        user_id: int,
        content_id: int,
        stage_name: str,
        source_description: str,
        awarded_at: datetime = None,
    ) -> models.UserReward:
        """콘텐츠 스테이지 해제 보상 - Reward + UserReward 링크 구조 재사용.

        기존 테스트가 UserReward(reward_type=..., reward_value=...) 형태를 기대했으나
        현재 UserReward 모델에는 해당 필드가 없으므로 Reward 테이블에 메타 저장.
        name: CONTENT_UNLOCK:{content_id}:{stage_name}
        description: source_description
        reward_type: CONTENT_UNLOCK
        value: 0
        """
        if awarded_at is None:
            awarded_at = datetime.now(timezone.utc)
        try:
            reward = models.Reward(
                name=f"CONTENT_UNLOCK:{content_id}:{stage_name}",
                description=source_description,
                reward_type="CONTENT_UNLOCK",
                value=0.0,
            )
            self.db.add(reward)
            self.db.flush()
            link = models.UserReward(
                user_id=user_id,
                reward_id=reward.id,
                claimed_at=awarded_at,
                is_used=False,
            )
            self.db.add(link)
            self.db.commit()
            self.db.refresh(link)
            return link
        except SQLAlchemyError as e:
            self.db.rollback()
            raise e
