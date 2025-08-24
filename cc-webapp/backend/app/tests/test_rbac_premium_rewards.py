import os, uuid, time
import pytest
from starlette.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.auth_models import User

pytestmark = pytest.mark.ci_core


def _signup(client: TestClient):
    uniq = str(int(time.time() * 1000))[-7:]
    site_id = f"rbac_{uniq}_{uuid.uuid4().hex[:4]}"
    payload = {
        "site_id": site_id,
        "password": "pass1234",
        "nickname": site_id,
        "invite_code": os.getenv("UNLIMITED_INVITE_CODE", "5858"),
        "phone_number": f"010{uniq}0",
    }
    r = client.post("/api/auth/signup", json=payload)
    if r.status_code != 200:
        r = client.post("/api/auth/login", json={"site_id": site_id, "password": "pass1234"})
        assert r.status_code == 200
    data = r.json()
    return data["access_token"], data["user"]["id"]


def test_rewards_distribute_requires_premium(client):
    # Use API to create two users
    std_token, std_id = _signup(client)
    prem_token, prem_id = _signup(client)

    # Elevate second user to PREMIUM
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == prem_id).first()
        if u:
            u.user_rank = "PREMIUM"
            db.add(u)
            db.commit()
    finally:
        db.close()

    payload = {
        "user_id": std_id,
        "reward_type": "TOKEN",
        "amount": 10,
        "source_description": "test",
        "idempotency_key": f"rbac-test-{uuid.uuid4().hex[:6]}"
    }

    # Standard user should be forbidden
    r1 = client.post("/api/rewards/distribute", json=payload, headers={"Authorization": f"Bearer {std_token}"})
    assert r1.status_code == 403

    # Premium user should pass RBAC
    r2 = client.post("/api/rewards/distribute", json=payload, headers={"Authorization": f"Bearer {prem_token}"})
    assert r2.status_code in (200, 400)
