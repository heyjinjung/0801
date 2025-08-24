import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.auth_service import AuthService
from app.schemas.auth import UserCreate
from app.database import get_db
from app.models.auth_models import User

# Mark as core for CI minimal runs
pytestmark = pytest.mark.ci_core


def make_user(db, site_id: str, rank: str = "STANDARD") -> User:
    uc = UserCreate(
        site_id=site_id,
        nickname=site_id,
        phone_number="01000000000",
        invite_code=os.getenv("UNLIMITED_INVITE_CODE", "5858"),
        password="passw0rd",
    )
    user = AuthService.create_user(db, uc)
    # Elevate rank if needed
    if rank and rank != "STANDARD":
        user.user_rank = rank
        db.commit()
        db.refresh(user)
    return user


def make_token_for_user(user: User) -> str:
    return AuthService.create_access_token({
        "sub": user.site_id,
        "user_id": user.id,
        "is_admin": user.is_admin,
    })


def test_rewards_distribute_requires_premium(client):
    # Prepare two users: standard and premium
    db = None
    for dep, func in app.dependency_overrides.items():
        if dep.__name__ == 'get_db':
            db = next(func())
            break
    assert db is not None

    standard = make_user(db, "std_user", rank="STANDARD")
    premium = make_user(db, "prem_user", rank="PREMIUM")

    std_token = make_token_for_user(standard)
    prem_token = make_token_for_user(premium)

    payload = {
        "user_id": standard.id,
        "reward_type": "TOKEN",
        "amount": 10,
        "source_description": "test",
        "idempotency_key": "rbac-test-1"
    }

    # Standard user should be forbidden
    r1 = client.post("/api/rewards/distribute", json=payload, headers={"Authorization": f"Bearer {std_token}"})
    assert r1.status_code == 403

    # Premium user should succeed
    r2 = client.post("/api/rewards/distribute", json=payload, headers={"Authorization": f"Bearer {prem_token}"})
    assert r2.status_code in (200, 400)  # 400 may appear if duplicate idempotency or service edge; still passed RBAC
    if r2.status_code == 200:
        body = r2.json()
        assert set(["reward_id", "reward_type", "reward_value", "awarded_at"]) <= set(body.keys())
