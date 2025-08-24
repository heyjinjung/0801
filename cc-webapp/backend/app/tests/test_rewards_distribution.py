import time
from starlette.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.auth_models import User as _User


def _signup(client: TestClient):
    uniq = str(int(time.time() * 1000))[-7:]
    site_id = f"rw_{uniq}"
    payload = {
        "site_id": site_id,
        "password": "pass1234",
        "nickname": f"rw_{uniq}",
        "invite_code": "5858",
        "phone_number": f"010{uniq}0",
    }
    r = client.post("/api/auth/signup", json=payload)
    if r.status_code != 200:
        r = client.post("/api/auth/login", json={"site_id": site_id, "password": "pass1234"})
        assert r.status_code == 200
    data = r.json()
    return data["access_token"], data["user"]["id"]


def test_distribute_tokens_and_idempotency():
    client = TestClient(app)
    access_token, user_id = _signup(client)
    headers = {"Authorization": f"Bearer {access_token}"}
    # Elevate to PREMIUM to satisfy RBAC on /api/rewards/distribute
    try:
        db = SessionLocal()
        u = db.query(_User).filter(_User.id == user_id).first()
        if u and getattr(u, "user_rank", "STANDARD") != "PREMIUM":
            u.user_rank = "PREMIUM"
            db.add(u)
            db.commit()
    finally:
        try:
            db.close()
        except Exception:
            pass

    # Capture starting balance
    r_profile = client.get("/api/users/profile", headers=headers)
    assert r_profile.status_code == 200
    start_balance = r_profile.json().get("cyber_token_balance", 0)

    idem = f"grant_{int(time.time())}"
    payload = {
        "user_id": user_id,
        "reward_type": "TOKEN",
        "amount": 250,
        "source_description": "promo:test",
        "idempotency_key": idem,
    }
    r = client.post("/api/rewards/distribute", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reward_type"] in ("TOKEN", "COIN")
    assert int(body["reward_value"]) == 250

    # Idempotent replay should not double-grant
    r2 = client.post("/api/rewards/distribute", json=payload, headers=headers)
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["reward_id"] == body["reward_id"]

    # Balance increased only once by 250
    r_profile2 = client.get("/api/users/profile", headers=headers)
    assert r_profile2.status_code == 200
    end_balance = r_profile2.json().get("cyber_token_balance", 0)
    assert end_balance - start_balance == 250


def test_distribute_item_records_history():
    client = TestClient(app)
    access_token, user_id = _signup(client)
    headers = {"Authorization": f"Bearer {access_token}"}
    # Elevate to PREMIUM for RBAC
    try:
        db = SessionLocal()
        u = db.query(_User).filter(_User.id == user_id).first()
        if u and getattr(u, "user_rank", "STANDARD") != "PREMIUM":
            u.user_rank = "PREMIUM"
            db.add(u)
            db.commit()
    finally:
        try:
            db.close()
        except Exception:
            pass

    payload = {
        "user_id": user_id,
        "reward_type": "ITEM",
        "amount": 1,
        "source_description": "event:limited_skin",
    }
    r = client.post("/api/rewards/distribute", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reward_type"] == "ITEM"

    # Validate it appears in user rewards listing
    r_list = client.get(f"/api/rewards/users/{user_id}/rewards?page=1&page_size=10")
    assert r_list.status_code == 200
    lst = r_list.json()
    assert lst["total_rewards"] >= 1
    assert any(it["reward_id"] == body["reward_id"] for it in lst["rewards"])
