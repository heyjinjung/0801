"""
Unified WebSocket smoke test (aiohttp-based)

Usage (inside backend container):
  python -m app.scripts.ws_smoke

Flow:
  1) POST /api/auth/login with testuser/password (auto-seeded in dev/test)
  2) Try WS connect to /api/realtime/sync (preferred)
  3) Fallback to /api/games/ws
  4) Print first received frame or timeout
"""
from __future__ import annotations

import os
import sys
import asyncio

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


async def ws_check(session: aiohttp.ClientSession, path: str, token: str) -> bool:
    ws_url = f"{BASE.replace('http', 'ws')}{path}?token={token}"
    print(f"[SMOKE] Connecting WS: {ws_url}")
    try:
        async with session.ws_connect(ws_url, heartbeat=20) as ws:
            # Try receive first (some endpoints send an initial ack), then ping
            try:
                msg = await asyncio.wait_for(ws.receive(), timeout=3)
                from aiohttp import WSMsgType
                if msg.type == WSMsgType.TEXT:
                    preview = msg.data[:200] + ("…" if len(msg.data) > 200 else "")
                    print("[SMOKE] First frame:", preview)
                elif msg.type == WSMsgType.CLOSED:
                    print("[SMOKE] Closed immediately")
                elif msg.type == WSMsgType.ERROR:
                    print("[SMOKE] Error:", ws.exception())
                else:
                    print("[SMOKE] Non-text frame:", msg.type)
            except asyncio.TimeoutError:
                print("[SMOKE] No initial frame within 3s (OK for some endpoints)")
            # Send a ping-ish text
            try:
                await ws.send_str("ping")
            except Exception:
                pass
            return True
    except Exception as e:
        print(f"[SMOKE] Connect failed for {path}: {type(e).__name__}: {e}")
        return False


async def main() -> int:
    timeout = aiohttp.ClientTimeout(total=12)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        token = await login(session)
        print("[SMOKE] Token OK")
        # Preferred endpoint per guide
        if await ws_check(session, "/api/realtime/sync", token):
            return 0
        # Fallback to legacy game WS
        ok = await ws_check(session, "/api/games/ws", token)
        return 0 if ok else 2


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as e:
        print("[SMOKE] Fatal:", e)
        sys.exit(1)
