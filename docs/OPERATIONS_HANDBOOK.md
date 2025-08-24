# Operations Handbook (concise)

## Legacy WS removal conditions (3-line guide)
- Alert clean: LegacyWsUsagePersisting stays green for 7 days (Grafana alert based on sum(rate(ws_legacy_games_connections_total[5m])) == 0).
- Dashboard: Legacy WS panel shows ~0 for entire lookback window; no client error reports linked to /api/games/ws.
- Action: Set ENABLE_LEGACY_GAMES_WS=0 permanently and merge router-removal PR; monitor 24h rollout.

## PREMIUM guard application criteria (3-line guide)
- Scope: High-value grant/settlement endpoints and user-specific personalization that could leak or skew incentives.
- Rule: Require require_min_rank("PREMIUM") unless endpoint is strictly idempotent self-serve with low value.
- Examples: /api/rewards/distribute (applied), candidate: /recommend/personalized (GET/POST), /personalization/* (profile/recs), sensitive shop adjustments.
