"""
레거시 /api/games/ws 엔드포인트에 1회 접속하여 Prometheus 카운터
ws_legacy_games_connections_total 및
ws_legacy_games_connections_by_result_total{result="accepted"}
증가를 유도하는 유틸.

사용법(백엔드 컨테이너 내부):
  python -m app.scripts.ws_touch_legacy
"""
from __future__ import annotations

import asyncio
import os
from typing import Optional

import aiohttp


BASE = os.environ.get("SMOKE_BASE", "http://localhost:8000")
SITE_ID = os.environ.get("SMOKE_SITE_ID", "testuser")
PASSWORD = os.environ.get("SMOKE_PASSWORD", "password")


async def login(session: aiohttp.ClientSession) -> str:
    async with session.post(f"{BASE}/api/auth/login", json={"site_id": SITE_ID, "password": PASSWORD}) as r:
        r.raise_for_status()
        data = await r.json()
        token = data.get("access_token")
        if not token:
            raise RuntimeError("No access_token in response")
        return token


async def touch_legacy_ws(session: aiohttp.ClientSession, token: str) -> None:
    ws_url = f"{BASE.replace('http', 'ws')}/api/games/ws?token={token}"
    try:
        async with session.ws_connect(ws_url, heartbeat=10) as ws:
            # 첫 프레임 수신(ack) 시도 후 간단히 ping 전송
            try:
                await asyncio.wait_for(ws.receive(), timeout=2)
            except asyncio.TimeoutError:
                pass
            try:
                await ws.send_str("ping")
            except Exception:
                pass
    except Exception as e:
        # 연결 실패는 무시(카운터 증가가 목적)
        print(f"[ws_touch_legacy] connect failed: {type(e).__name__}: {e}")


async def main() -> int:
    timeout = aiohttp.ClientTimeout(total=8)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        token = await login(session)
        await touch_legacy_ws(session, token)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except KeyboardInterrupt:
        raise SystemExit(130)
