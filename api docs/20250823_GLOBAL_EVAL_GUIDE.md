## 지표 표준화(무중단/저위험) 즉시 적용 가이드

본 섹션은 게임횟수/접속일수 지표의 혼선을 제거하기 위한 단기 보정안을 문서화합니다. 코드 변경 없이도 적용 가능한 사용 가이드와 빠른 검증 루틴을 포함하며, 차기 릴리스에서의 API 확장 방향을 제시합니다.

### 단일 지표 정의를 API에서 강제 제공
- 총 접속일수 표준: UserAction의 distinct date 수를 기준으로 계산합니다.
	- 기준 윈도우: 최근 90일(권장). 비용/성능 이슈가 없으면 lifetime로 확장 가능.
	- 시계열 기준: UTC 00:00 기준 일 단위 절단(서버/DB/ETL 간 표준화).
	- 포함 이벤트: 로그인(DAILY_LOGIN) 및 게임/상점 등 사용자 행동 전반(UserAction 테이블에 기록된 모든 action_type)을 “활동일”의 근거로 인정.
- API 확장 제안(GET /api/users/stats 응답 필드 추가):
	- last_30d_active_days: 최근 30일 distinct 활동일 수
	- lifetime_active_days: 평생 distinct 활동일 수(비용 크면 90/180일로 제한)

### 프론트 사용 엔드포인트 가이드 고정
- 프로필/요약 카드는 /api/auth/me 또는 /api/auth/profile만 사용.
- 통계 카드는 /api/users/stats만 사용. games/dashboard의 기타 합산 수치를 혼용하지 않기.
- 주의: /api/users/{id}는 공개 프로필로 마스킹 값(잔액 0 등)이 포함될 수 있으며 자기 자신 조회용이 아님.

### 혼선 경로 소프트 디프리케이션
- /api/users/profile에 이미 Deprecation: true, Link: </api/auth/profile>; rel="successor-version" 헤더가 추가됨.
- 프론트는 점진 전환을 진행하고, 서버는 deprecated 호출 카운팅(메트릭/로그)으로 제거 시점 판단.

### 빠른 검증 루틴(로컬/스테이징)
- 게임횟수: 슬롯 3회 실행 → /api/users/stats의 total_games_played가 +3인지 확인.
- 접속일수(표준화 전 임시): streak/tick로 DAILY_LOGIN 2일 연속 기록 → 임시 계산 쿼리에서 distinct date가 2인지 확인.
- 회귀: /api/auth/me만 호출했을 때 값이 일관적인지 확인. 자기 자신을 GET /api/users/{id}로 조회하지 않았는지 점검.

### 세부 고려사항(놓치기 쉬운 포인트)
- 타임존: 클라이언트 로컬과 서버 UTC 절단선 차이로 오프바이원 발생 가능 → 모든 “일 계산”은 서버 UTC 기준으로 고정, 응답 문서에 명시.
- 성능: UserAction(user_id, created_at) 인덱스와 date(created_at) 기반 distinct 계산 최적화 필요(가능하면 날짜 파티셔닝/머티리얼라이즈드 뷰/일별 롤업 캐시 고려).
- 정의 명확화: “활동일”은 DAILY_LOGIN만인지, 모든 행동 포함인지 명시(본 문서는 “모든 행동 포함”을 권장. 단, 추후 설정화 가능).
- 캐싱: last_30d_active_days는 계산 비용이 낮아 요청 시 계산해도 되나, lifetime_active_days는 일별 롤업 또는 주기 캐시를 권장.
- 이벤트 결손: 간헐적 실패 대비 idempotent 재기록 또는 지연 수집 보정 로직 필요.
- 공개/비공개 혼동: 공개 프로필의 마스킹 규칙을 문서로 재강조(잔액/민감지표 0으로 표시), 자기 프로필은 /api/auth/me만 사용.

### 다음 단계 제안(차기 스프린트)
1) API 확장: /api/users/stats에 접속일 관련 2개 필드(last_30d_active_days, lifetime_active_days) 추가 및 OpenAPI 업데이트.
2) 프론트 매핑 정리: 게임횟수는 stats.total_games_played만, 접속일수는 위 새 필드 중 하나만 사용.
3) 문서/검증: api docs/20250808.md와 본 문서에 지표 정의/마이그레이션 메모 추가, 간단한 회귀 테스트 케이스 병행.

원하시면 서버에 위 2개 필드를 추가하고(비파괴/가산 필드), 컨테이너 내에서 빠른 테스트까지 실행해 드릴 수 있습니다.

# 🎰 Casino-Club F2P 상용 기준 전역 가이드 & 점검 체크리스트 (v0.1 / 2025-08-23)

본 문서는 상용 카지노 게임 웹 수준을 기준으로, 현재 프로젝트를 전역적으로 평가·개선하기 위한 실행형 가이드와 체크리스트입니다. 최소 변경 원칙과 컨테이너 표준(docker-compose) 하에 진행하며, 테스트 그린·Alembic 단일 head·/docs 스키마 일관을 성공 기준으로 합니다.

## [업데이트 로그] 2025-08-23 WS 표준화/스모크 결과
- 변경 요약
	- 리얼타임 표준 경로를 `/api/realtime/sync`로 확정. 레거시 `/api/games/ws`는 비권장(deprecated) 폴백으로만 유지(추후 제거 예정).
	- 스모크 스크립트(`backend/app/scripts/ws_smoke.py`)를 표준→폴백 순으로 접속하도록 단일화.
- 검증
	- 컨테이너 내부 실행: `docker compose exec backend python -m app.scripts.ws_smoke` → 첫 프레임 `sync_connected` 수신.
- 다음 단계
	- 프론트 전역 리스너 기본 경로 재확인(OK) 및 문서 주석 강화.
	- 레거시 `/api/games/ws` 사용처 모니터링 후 제거 스위치 도입 → 단계적 제거.

## 현재 진행도 요약 (2025-08-23)
- A. 인증/세션: Green ~80%
	- 가입/로그인/락아웃/토큰 기본 시나리오 동작, 테스트 스모크 통과. 리프레시/락 정책 추가 검증 일부 남음.
- B. 프로필/스트릭/업적/배틀패스: Yellow ~60%
	- 프로필/스트릭 OK, 업적 기본 반영. 배틀패스는 설계/연동 대기.
- C. 경제/상점/보상: Yellow ~70%
	- buy/limited/webhook/settle 전 구간 브로드캐스트 배선 적용, 멱등/Fraud 정책 반영. 리그레션/경계 테스트 보강 필요.
- D. 게임 & 통계: Yellow ~65%
	- `/api/actions` 로깅/최근 액션/WS 브로드캐스트 OK. Crash/세부 통계 검증 일부 대기.
- E. 리얼타임(WS): Green ~90%
	- 허브 표준화(`/api/realtime/sync`), 프론트 기본 경로 전환 확인, 스모크 성공. 레거시 제거 스위치 도입 예정.
	- 레거시 제거 스위치 추가: ENABLE_LEGACY_GAMES_WS=false 설정 시 `/api/games/ws` 거부 및 Prometheus 카운터(ws_legacy_games_connections_total) 집계.
- F. 데이터/스키마/계약: Yellow-Green ~75%
	- OpenAPI 단일 소스/스냅샷/디프 준비 완료. 핵심 인덱스/제약/마이그레이션 점검 일부 남음.
- G. 관측성/운영: Yellow-Green ~75%
	- Prometheus/Grafana 가동/라벨 정합, 기본 패널 OK. 지표/임계치 튜닝 및 실데이터 검증 진행 중.
- H. 보안/권한: Red ~30%
	- RBAC/관리자 보호/감사로그/키 회전 강화 진행: JWT kid 헤더(kid=KEY_ROTATION_VERSION) 추가, 감사로그 유틸(app/security/audit.py) 도입 및 일부 Admin 엔드포인트에 적용.
- I. 신뢰성/DR: Yellow ~50%
	- Alembic 단일 head 유지. 백업/롤백 절차/프로파일 분리 보강 대기.
- J. 테스트/품질: Yellow ~60%
	- 백엔드 스모크/WS 스모크 OK. OpenAPI CI 연동/프론트 E2E(Playwright) 보강 예정.

## 1) 목적/범위
- 목적: 가입→로그인→플레이→보상/결제→이벤트→로그아웃 전 과정이 실시간으로 UI에 반영되고, 데이터/보안/관측성이 상용 기준을 충족하도록 보증.
- 범위: Backend(FastAPI) / Frontend(Next.js) / DB(PostgreSQL) / Cache(Redis) / MQ(Kafka) / OLAP(ClickHouse) / Monitoring(Prometheus+Grafana).

## 2) 성공 기준(SLO-ish)
- 가용성: 핵심 API(인증/게임/상점/리얼타임) 99.5%+ (개발 환경은 smoke 기준 충족).
- 성능: p95 API < 250ms(읽기), < 400ms(쓰기), WS 이벤트 전달 지연 p95 < 500ms.
- 데이터 일관: 경제(골드) 음수 잔액 0건, 멱등 키 재진행 성공률 100%(TTL 내), 클릭하우스 적재 누락률 < 0.5%.

## 3) 아키텍처 표준 요약
- 설정: `app.core.config.settings` 단일 소스. 레거시 `app/config.py`는 shim(확장 금지).
- 라우터: games 관련 엔드포인트는 `app/routers/games.py` 단일화.
- 리얼타임: `/api/realtime/sync` WS 허브 단일 채널(표준). 메시지 스키마 `{ type, user_id, data, timestamp? }`.
	- 레거시 `/api/games/ws`는 비권장 폴백(신규 기능 비보장, 제거 예정).
- 마이그레이션: Alembic 단일 head 유지(현재 head: f79d04ea1016), merge 전략 엄수.

## 4) 기능 영역별 체크리스트(실행형)

### A. 인증/세션
- 구현 위치
	- 라우터: `backend/app/routers/auth.py`, `users.py`
	- 세션/토큰: `backend/app/services/auth_service.py`, `models/auth_models.py`
	- 메인 등록: `backend/app/main.py` (auth, users include)
- 검증 방법
	- REST: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
	- 실패락: 잘못된 비밀번호 6회 → 429 확인(문서의 정책 5회/10분)
	- 토큰 회전: 만료 직전 요청 → 401 후 1회 refresh 재시도 성공
	- DB: Users/Refresh 토큰 레코드 생성/상태 확인
- 로그 포인트
	- `AuthService.verify_token`, `AuthService.login` INFO/ERROR
	- 실패락 카운터 증가 시 WARN (추가 권장)

### B. 프로필/스트릭/업적/배틀패스
- 구현 위치
	- 프로필/대시보드: `backend/app/routers/dashboard.py`, `users.py`
	- 스트릭: `backend/app/routers/streak.py`, Redis 유틸 `app/utils/redis.py`
	- 업적 서비스: `backend/app/services/achievement_service.py`
- 검증 방법
	- REST: `GET /api/dashboard`, `POST /api/streak/claim`
	- 프론트: 대시보드 진입 시 스냅샷 노출, 클레임 후 값 증가
	- Redis: 스트릭 키 증가/TTL 확인
- 로그 포인트
	- `streak.py` claim 처리 INFO, 멱등 예외 WARN
	- `dashboard` 조립 시간 DEBUG (성능 추적용)

### C. 경제/상점/보상
- 구현 위치
	- 상점/보상 라우터: `backend/app/routers/shop.py`, `rewards.py`
	- 결제/멱등/Fraud: `backend/app/services/payment_service.py`(예상), Redis 키 전략 문서
	- 경제 단일화: 관련 모델/서비스에서 gold-only 정책(문서: `api docs/20250808.md` 단일화 섹션)
- 검증 방법
	- REST: `/api/shop/catalog`, `/api/shop/buy`, 보상 지급 후 `/api/users/profile` 잔액 증가
	- 멱등: 동일 receipt/idempotency 키 재시도 → 단일 success 보장
	- Fraud: 짧은 윈도우 다회 요청 시 429 또는 정책 응답
- 로그 포인트
	- 구매 pending→success 전이 INFO, 실패 사유 포함
	- 멱등 충돌/선점 WARN, Fraud 차단 INFO/WARN

### D. 게임(슬롯/가챠/RPS/Crash) & 통계
- 구현 위치
	- 통합 게임 라우터: `backend/app/routers/games.py`
	- 액션: `backend/app/routers/actions.py` (DB+Kafka+허브 브로드캐스트)
	- Crash 상태: Redis 관리 유틸/서비스(파일 경로 주석 반영)
- 검증 방법
	- REST: `/api/games/*`, `/api/actions` 단건/벌크, `/api/actions/recent/{userId}`
	- Kafka: `app/kafka_client.py` consumer 레디 상태, 최근 메시지 확인
	- ClickHouse: 헬스 라우터 `backend/app/routers/olap.py` 기반 상태 확인
- 로그 포인트
	- `actions.log_action` 저장/브로드캐스트 INFO, Kafka 실패 WARN
	- 라운드 결과 처리 시 stats 업데이트 INFO

### E. 리얼타임(WS) 표준
- 구현 위치
	- 라우터: `backend/app/routers/realtime.py`
	- 허브: `backend/app/realtime/hub.py` (브로드캐스트/스로틀/최근 이벤트)
	- 프론트 클라이언트: `frontend/utils/wsClient.ts`, 대시보드 연동 `frontend/components/HomeDashboard.tsx`
- 검증 방법
  	- WS 연결: `/api/realtime/sync` 접속, `sync_connected`/`initial_state` 수신(표준)
	- 이벤트: `user_action` 수신 시 최근 액션 자동 갱신(프론트 훅 트리거)
	- 유실 대비: 재연결 후 초기 상태 수신 확인
  	- 폴백: `/api/games/ws`는 임시 호환용(가능한 사용 지양)
- 로그 포인트
	- 허브 register/unregister INFO, 브로드캐스트 DEBUG(샘플링), 스로틀 히트 카운트

### F. 데이터/스키마/계약
- [ ] Postgres: 핵심 인덱스(`user_actions(user_id, created_at)` 등) 및 FK/UNIQUE 무결성.
- [ ] Redis: 키 네이밍/TTL 정책, 멱등키/재고/스트릭 키 충돌 없음.
- [ ] Kafka: 토픽 존재/오프셋 모니터링, 재시작 시 재소비 전략 명시.
- [ ] ClickHouse: 파티션/정렬키 적용, 적재 지연/누락 모니터링.
- [x] 이벤트/HTTP 계약: OpenAPI 단일 소스, 메시지 스키마 문서와 일치(WS 스키마 표준 적용, OpenAPI 스냅샷 스크립트 준비).
- 메모(2025-08-23): CI 게이트 강화 – 경로/메서드 제거 외에 스키마 타입 변경 및 required 필드 추가도 차단. PR 코멘트에 변경 요약 자동 기입.

### G. 관측성/운영
- 구현 위치
	- 글로벌 메트릭 라우터: `backend/app/routers/metrics.py` (`/api/metrics/global`, `/api/metrics/stream`)
	- Kafka/ClickHouse 클라이언트: `backend/app/kafka_client.py`, `backend/app/olap/clickhouse_client.py`
- Grafana 패널(예시)
	- 로그인 실패율(시간별), 결제 성공률, WS 연결 수/이벤트 지연, Kafka consumer lag, ClickHouse 적재 RPS/에러
- ClickHouse 쿼리 스니펫(예시)
	- 최근 1시간 액션 집계: `SELECT action_type, count() FROM events WHERE ts > now() - INTERVAL 1 HOUR GROUP BY action_type ORDER BY count() DESC;`
	- 사용자별 승/패 합계: `SELECT user_id, sum(wins) AS w, sum(losses) AS l FROM game_stats WHERE date >= today()-7 GROUP BY user_id ORDER BY w DESC LIMIT 50;`
- Prometheus 지표(추가 권장)
	- `ws_active_connections`, `realtime_event_lag_ms`, `shop_buy_success_total`, `shop_buy_failed_total`, `auth_login_locked_total`

#### 관측성 현황(2025-08-23)
- [x] Prometheus scrape 정합: backend job 라벨 `cc-webapp-backend`로 통일
- [x] Grafana 대시보드 프로비저닝: 기본 패널(HTTP/WS/구매 지표) 적용
- 메모(2025-08-23): 레거시 WS 사용률 패널 추가 및 Alert rule(`legacy_ws_alerts.yml`) 추가 – 15분 이상 >0이면 경보. 상점 P95 지연/5xx 비율 알림 포함.
- [x] Alert rules 마운트: `invite_code_alerts.yml` 로드 및 rule_files 활성화
- [ ] 라이브 데이터 검증: 패널 실데이터 렌더 확인 및 임계치 튜닝
- [x] SSE 스트림 정상화: `/api/metrics/stream` 오류 필드 교정 후 metrics 프레임 수신 확인

#### 운영 팁: WS 스모크 실행(개발환경)
- 명령: 컨테이너 내부에서 `python -m app.scripts.ws_smoke` (외부에서 `docker compose exec backend ...`로 호출 가능)
- 동작: `/api/realtime/sync` 우선 연결 → 실패 시 `/api/games/ws` 폴백 → 첫 프레임 또는 타임아웃 로깅
 - 레거시 경로 모니터링: Prometheus 지표 `ws_legacy_games_connections_total`를 패널에 추가하여 사용처 잔존 확인.

## 6-bis) 자동 스모크 시나리오(개발환경)
- Backend(pytest)
	- 로그인→/auth/me→스트릭 클레임→액션 생성→최근 액션 조회가 200/일관 JSON
	- 골드 잔액 증가·스트릭 카운트 증가 assert
- Frontend(Playwright)
	- 로그인 후 대시보드: 골드/스트릭/최근 액션 노출
	- 액션 발생 후 WS 이벤트 수신 → 최근 액션 DOM 갱신 확인
	- 재연결 시 초기 상태 DOM 값 일치 확인

### H. 보안/권한/규정 준수
- [ ] RBAC 역할(VIP/PREMIUM/STANDARD) 엔드포인트 가드.
- 메모(2025-08-23): `/api/rewards/distribute`에 PREMIUM 가드 적용. 고가치 지급/정산 및 개인화 API에 단계적 확대 예정.
- [ ] Admin API 보호/감사 로그, 비밀/키 관리(회전 계획 포함).
- [ ] 규정: PII 처리 구분, 성인콘텐츠 접근 연령검증 플로우.

### I. 신뢰성/마이그레이션/DR
- [x] Alembic 단일 head, destructive 변경 시 shadow+rename 전략.
- [ ] 백업: pg_dump + WAL 보관 정책(개발은 스냅샷/시드로 대체), Redis cold-start seed.
- [ ] 롤백 절차/Compose 프로파일 분리(dev/tools/prod) 정리.

### J. 테스트/품질 게이트
- [ ] Build/Lint/Unit/Integration/E2E 스모크 그린.
- [ ] 핵심 시나리오: 인증, 스트릭, 상점 결제/프로모, 게임 액션, 리얼타임 반영, 한정 패키지.
- [x] OpenAPI 재수출 검증(수동 스냅샷/디프 스크립트 준비), 문서/테스트 동기화(진행 중).
 - [ ] CI 통합 상태: GitHub Actions OpenAPI 계약(workflows/openapi-ci.yml) 및 Frontend Playwright(workflows/frontend-e2e.yml) 추가.

## 5) 성숙도 단계(L1→L3)
- L1(MVP): 핵심 기능 작동 + REST 스냅샷 + 제한적 WS, 기본 지표/로그.
- L2(Beta): 전역 WS 커버리지, Fraud/HMAC/멱등 완비, 기본 대시보드, ClickHouse 적재.
- L3(Prod): 알림/자동화 수치 기반 운영, DR/백업 리허설 통과, SLA 수준 안정성.

## 6) “하루 사용자 여정” 실검증 시나리오
1) 초대코드로 가입 → 로그인(락/리프레시 확인) → 대시보드 스냅샷.
2) 스트릭 클레임 → 골드/레벨/스트릭 실시간 반영.
3) 슬롯 3판: 승/패/보상 반영, 최근 액션·통계 실시간 갱신.
4) 상점 구매 → 결제 성공 → 잔액 증가/보상 로그/실시간 배지 점등.
5) 이벤트 참여/진행/클레임 → 업적 업데이트 동시 확인.
6) 재접속(WS 재연결) → 초기 상태/백필 정상.

## 7) 위험/부채/우선순위
- 위험: 이벤트 스키마 분기/중복 라우터 잔존, 다중 Alembic head 재발, ClickHouse 지연 누락.
- 부채: 일부 레거시 API/유틸(단일화 대기), 전역 컨텍스트 없는 분산 상태 업데이트.
- 우선순위: WS 브로드캐스트 배선 완성 → 프론트 전역 리스너/스토어 → OLAP 위젯.

## 8) 부록: 리얼타임 이벤트 계약(초안)
- profile_update: { changes: { gold_balance?, level?, exp? } }
- reward_granted: { reward_type, amount, balance_after }
- streak_update: { action_type, streak_count }
- achievement_progress: { achievement_code, progress, unlocked }
- stats_update: { stats: { game_type?, wins?, losses?, ev? } }
- user_action: { action_type, client_ts?, context, server_ts }

— 본 문서는 운영 과정에서 계속 보강되며, 변경 요약은 `api docs/20250808.md`와 #final.md 파일에 누적 기록합니다.

## 9) 진행 현황 요약(2025-08-23)

### 완료(현재 반영됨)
- 리얼타임 허브 단일화: `/api/realtime/sync` 활성, 이벤트 스키마 표준 적용 `{type,user_id,data,timestamp?}`.
- 게임 액션 브로드캐스트: `POST /api/actions` → `user_action` 허브 전파.
- 보상 지급 브로드캐스트: `rewards.py` 경로에서 `reward_granted` + `profile_update` 허브 전파(비차단, 스로틀 준수).
- 환경 자동화: `cc-manage.ps1`에서 `.env.development → .env` 자동 복사(없을 때), README/문서 반영.
- 최근 액션 스냅샷: `GET /api/actions/recent/{user_id}` 엔드포인트 확인 및 테스트 커버리지 추가.
	- 테스트 추가: `cc-webapp/backend/app/tests/test_actions_recent_flow.py` (signup → action → recent 검증).
- 모니터링 정합: Prometheus job 라벨/스크레이프 타깃 정리(`cc-webapp-backend`), Grafana 대시보드/프로비저닝 적용, Alert rules 마운트.
- 구성 파일 오류 정리: Grafana 대시보드 JSON 이스케이프 수정, `docker-compose.override.local.yml` 스키마 오류 제거, `ci/export_openapi.ps1` 출력 보강.
- OpenAPI 스냅샷/디프: 컨테이너 내부 수출 후 루트 스냅샷/디프 파일 생성 스크립트 준비.

### 부분 진행/보강 예정
- 상점/결제 전 구간 WS 브로드캐스트 배선 보강(구매 성공/실패, 잔액 변경, 멱등 충돌 알림).
- Prometheus 지표 확장 및 Grafana 기본 대시보드(profiles: auth 실패율/WS 연결/consumer lag/적재 RPS).
- Frontend E2E(Playwright) 시나리오: 로그인→대시보드→액션→WS 반영→재연결 초기화.
- OpenAPI CI 통합: 스냅샷/디프 아티팩트 업로드 및 PR 코멘트 자동화.
- 레거시 WS 제거 스위치 도입: `/api/games/ws` 완전 제거 전 단계적 비활성 옵션 제공.

### 검증/운영 메모
- 테스트: 컨테이너 내부에서 `pytest -q app/tests` 수행(핵심 스모크 포함), Alembic `upgrade head`로 단일 head 유지 확인.
- OpenAPI: 필요 시 `python -m app.export_openapi`로 재수출 후 `/docs` 단일성 확인.
- 트러블슈팅: 스키마 미반영 시 `app.openapi_schema=None` 재생성, JWT 실패는 `auth_token` 픽스처로 재현.

### 다음 단계 제안(우선순위)
1) 상점/결제 WS 브로드캐스트 완성(잔액/구매 상태 실시간 반영) → 프론트 전역 리스너 연결.
2) Prometheus/Grafana 프로비저닝 스크립트 추가 및 기본 패널 배치.
3) OpenAPI 재수출 자동화 + 변경 감시 테스트(`test_openapi_diff_ci.py`)와 연계.

#### 실행 현황(2025-08-23)
- WS 브로드캐스트는 buy/limited/webhook/settle 전 구간에서 발화하도록 정비(성공 시 profile_update 포함).
- Grafana 프로비저닝 스크립트 추가: `scripts/provision_grafana.ps1`(대시보드/데이터소스 템플릿 준비).
- OpenAPI 변경 감시 테스트 추가: `backend/app/tests/test_openapi_diff_ci.py`(핵심 경로 존재/스냅샷 대비 파괴적 변경 감지).

#### 사용 방법
- 모니터링 준비: PowerShell에서 `scripts/provision_grafana.ps1` 실행 후 `docker-compose.monitoring.yml`의 Grafana 프로비저닝 경로에 마운트.
- OpenAPI: 컨테이너 내부에서 `python -m app.export_openapi`로 `current_openapi.json` 갱신 후 pytest 실행.

#### 다음 보강 포인트
- Grafana 대시보드 실데이터 렌더 확인 및 임계치/패널 튜닝.
- OpenAPI 스냅샷/디프 CI 연동(아티팩트 업로드·PR 코멘트).
- 결제 전 구간 WS 브로드캐스트와 프론트 전역 리스너 보강.


타임존 기준
활동일 산정은 “UTC 00:00” 절단으로 고정(문서 명시). 클라이언트 로컬 날짜와 달라 오프바이원 이슈 방지.
활동일 정의 범위
DAILY_LOGIN만 포함 vs. 모든 UserAction 포함 중 선택 필요(본 가이드는 “모든 행동 포함” 권장). 선택 결과를 응답 스키마 설명에 명시.
성능/인덱싱
distinct date 집계 최적화: (user_id, created_at) 인덱스, date(created_at) 사용, 필요 시 일별 롤업/머티리얼라이즈드 뷰/캐시 고려.
lifetime_active_days는 캐시 또는 배치 롤업 권장, last_30d_active_days는 온디맨드도 가능.
캐싱/TTL
stats 응답에 대한 단기 캐시 TTL(예: 30~60초) 고려. 프론트 폴링/새로고침에도 일관성 유지.
공개/비공개 프로필 혼동
/api/users/{id}는 마스킹(잔액 0 등)된 공개용. 자기 자신 조회 금지 규칙을 프론트에 명시적으로 고정.
이벤트 결손/중복
지연 수집/중복 기록 보정: idempotent 키 설계, 재시도 시 중복 방지. “활동일”은 distinct로 중복 영향 적지만 정의를 문서화.
테스트 커버리지
프론트 회귀: 자기 프로필 렌더가 /api/auth/me만 사용함을 테스트로 보증.
백엔드 회귀: 슬롯 3회 후 stats.total_games_played +3, DAILY_LOGIN 2일 후 distinct=2 검증 케이스 추가.
관측/운영
deprecated 엔드포인트 사용량 Prometheus 카운터/로그화로 제거 시점 판단.
OpenAPI 응답 설명에 “UTC 기준”, “활동일 정의” 명시.
RBAC 연동
추후 stats 확장 필드가 RBAC 영향 받지 않도록 공용 읽기 정책 확인(민감 데이터 포함 여부 점검).
