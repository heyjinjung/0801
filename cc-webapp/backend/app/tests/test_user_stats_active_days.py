from datetime import datetime, timedelta

def test_user_stats_active_days_basic(client, auth_token):
    token = auth_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Trigger at least one action today by logging a real action (slot spin)
    resp = client.post("/api/games/slot/spin", headers=headers, json={"bet_amount": 1})
    assert resp.status_code == 200, resp.text

    # Fetch stats
    s = client.get("/api/users/stats", headers=headers)
    assert s.status_code == 200, s.text
    data = s.json()

    # New fields exist and are integers
    assert "last_30d_active_days" in data and isinstance(data["last_30d_active_days"], int)
    assert "lifetime_active_days" in data and isinstance(data["lifetime_active_days"], int)

    # At least 0 <= last_30d_active_days <= lifetime_active_days
    assert 0 <= data["last_30d_active_days"] <= data["lifetime_active_days"]

    # With at least one action today, last_30d_active_days should be >= 1
    assert data["last_30d_active_days"] >= 1
