# Realtime WebSockets (Unified Sync Hub)

Realtime 통합 허브와 모니터링 스트림을 통해 게임/상점/프로필 등 실시간 이벤트를 전달합니다.

## Endpoints (표준 / 레거시)

1) 표준(권장): User Sync Hub — `GET /api/realtime/sync?token=<JWT>`
  - Auth: JWT access token (query `token` 또는 `Authorization: Bearer` 허용)
  - 초기 메시지: `sync_connected`, 선택적으로 `initial_state`
  - 메시지 유형(예): `user_action`, `purchase_update`, `profile_update`, `streak_update`, `reward_granted`, `stats_update`, `pong`
  - 프론트 전역 컨텍스트(RealtimeSyncContext)가 기본으로 이 경로를 사용합니다.

2) 레거시(비권장·폴백): User stream — `GET /api/games/ws?token=<JWT>`
  - 초기 메시지: `ws_ack`
  - 주요 메시지: `game_event` 위주(레거시 스키마)
  - 상태: 호환을 위해 한시 유지, 추후 제거 예정. 신규 기능은 통합 허브(`/api/realtime/sync`)에서만 보장됩니다.

3) Monitor stream: `GET /api/games/ws/monitor?token=<JWT>`
   - Requires admin (current stub allows any authenticated user; tighten later).
   - On connect sends `monitor_snapshot` containing currently connected user ids & recent events.
   - Then streams all subsequent `game_event` broadcasts for every user.

## Event Payload Shape
```
{
  "type": "game_event",
  "game_type": "slot" | "rps" | "gacha" | "crash",
  "user_id": <int>,
  "bet": <number>,            // or relevant input field
  "result": { ... },           // game specific result data
  "ts": "2025-08-16T12:34:56.789Z"  // ISO8601 UTC
}
```
Additional fields may appear (e.g. reward summaries) but core keys are stable.

## Architecture

`app/realtime/hub.py` implements an in‑memory `RealtimeHub`:
- Tracks per-user WebSocket connections.
- Tracks monitor connections.
- Maintains a ring buffer of recent events for snapshotting.
- Broadcasts game events fan‑out to relevant sockets.

Why in‑memory now? Simplicity & low latency for a single instance. A later horizontal scale step can swap internal broadcast with Redis Pub/Sub or Kafka without changing router code (keep hub interface stable).

## Client Flow (User)
1. Obtain JWT via `/api/auth/login` or `/api/auth/signup`.
2. Open WS: `wss://<host>/api/realtime/sync?token=...` (권장)
3. Wait for `{ "type": "sync_connected" }` (및 필요 시 `initial_state`).
4. Perform gameplay/shop/profile REST calls (e.g., POST `/api/games/slot/spin`, `/api/shop/buy`).
5. Receive standardized events (e.g., `user_action`, `purchase_update`, `profile_update`).

## Client Flow (Monitor)
1. Obtain admin JWT.
2. Open WS: `/api/games/ws/monitor?token=...`.
3. Read initial `monitor_snapshot`.
4. Stream all subsequent `game_event` messages globally.

## Security Notes
- Current monitor auth is permissive; tighten with role/claims check (TODO).
- Query param token accepted for convenience; production should prefer `Authorization` header only.
- No rate limiting yet; consider simple message budget per connection.

## Migration Notes
- 표준 경로는 `/api/realtime/sync` 입니다.
- 레거시 `/api/games/ws`는 비권장(deprecated) 상태로 폴백 경로만 유지됩니다.
- 신규/변경 이벤트 스키마는 통합 허브 기준으로만 보장됩니다.
- 제거 계획: `/api/games/ws`는 추후 릴리스에서 제거 예정(프론트 사용처 교체 완료 후). 모니터 경로는 별도 공지 전까지 유지.

## Testing
- CLI smoke: 컨테이너 내부에서 `python -m app.scripts.ws_smoke` 실행 시 `/api/realtime/sync` 우선 연결 시도 후 실패 시 `/api/games/ws` 폴백합니다.
- Pytest: `test_games_ws.py` (사용자 이벤트 수신), 모니터 스냅샷 수신 커버.

## Future Enhancements
- Add reward / token balance delta events.
- Add presence (join/leave) events to monitors.
- Externalize broadcast (Redis / Kafka) for multi-instance scale.
- Structured schema versioning for events.
