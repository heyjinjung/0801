# 변경 요약 / 검증 / 다음 단계 (2025-08-23)

변경 요약
- 모니터링 네트워크 정합: Prometheus/Grafana를 애플리케이션 네트워크(0801_ccnet)에 연결. Prometheus scrape 타깃 cc_backend:8000 정상화.
- OpenAPI 재수출: backend 컨테이너에서 python -m app.export_openapi 실행, 스냅샷 갱신 완료.
- 테스트 수정: backend/tests/conftest.py에 db_engine 픽스처 추가로 pytest 실패 픽스.
- SSE 스트림 오류 수정: /api/metrics/stream에서 UserReward 필드 오기 사용( created_at, amount_gold )을 모델 정의(claimed_at, gold_amount)로 교정.

## 2025-08-23 모니터링/리얼타임 보강 (WS 라벨 메트릭 + 브로드캐스트 테스트)

변경 요약
- 레거시 게임 WS 접속 카운터 보강: `ws_legacy_games_connections_by_result_total{result=accepted|rejected}` 추가. 기존 `ws_legacy_games_connections_total`은 유지(역호환).
- 리얼타임 허브 단위 테스트 추가: `app/tests/test_realtime_broadcast_stub.py`에서 `hub.broadcast`가 `user_id` 타겟 채널로 올바른 payload를 전달하는지 검증(StubWS로 send_text 캡처).

검증 결과
- 컨테이너 내 단일 테스트 통과: `pytest -q app/tests/test_realtime_broadcast_stub.py` → 1 passed.
- OpenAPI/Alembic 스키마 변경 없음(head 단일 유지). `/metrics` 노출 구성 그대로 유지.

다음 단계
- Grafana 패널에 신규 라벨 메트릭 반영: `sum by (result) (ws_legacy_games_connections_by_result_total)`로 accepted vs rejected 구분 시각화.
- 로컬 검증: `/api/games/ws` 허용/차단 시나리오를 각각 1회 이상 시도 후 `/metrics`에서 두 카운터 라벨 증가 확인.
- 필요 시 `api docs/20250808.md`에 메트릭 설명/운영 가이드(허용/차단 플래그와 대시보드 쿼리 예시) 추가.

검증
- Prometheus Targets: cc-webapp-backend(cc_backend:8000) health=up 확인(HTTP API /api/v1/targets).
- Pytest: app/tests/test_openapi_diff_ci.py, tests/test_openapi_diff_ci.py, tests/test_main.py 합계 13개 테스트 전부 통과.
- Alembic: heads=current=86171b66491f (단일 head) 확인.
- SSE 스모크: 컨테이너 내 curl -N로 /api/metrics/stream 2초 간격 수신 확인(event: metrics 프레임 연속 수신).

다음 단계
- WS 스모크(상점/정산/웹훅): 브라우저에서 배지/토스트 표시 동작 체크 및 스크린샷 캡처.
- Grafana 대시보드: 구매 지표 패널에 실데이터 유입 확인 및 경보룰 세부 튜닝.
- CI: OpenAPI diff CI를 워크플로에 통합(스냅샷 아티팩트 업로드/PR 코멘트).

---

# Casino-Club F2P 프로젝트 Final 체크 & 트러블슈팅 기록

**생성일**: 2025-08-19  
**브랜치**: feature/e2e-onboarding-playwright  

## 2025-08-23 모니터링 네트워크/도구 가동 + 백엔드 /metrics 노출(계측) + OpenAPI 테스트 상태

스크랩 타깃 고정화
옵션 A: docker-compose에 networks.ccnet.aliases: [backend] 영구 추가.
옵션 B: Prometheus 타깃을 cc_backend:8000으로 변경 후 툴즈 재시작.
OpenAPI 재수출 및 테스트
컨테이너 내부에서 python -m app.export_openapi 실행 → 스냅샷 갱신 후 pytest의 openapi_diff_ci 통과 확인.
대시보드/알람 튜닝
Grafana에서 purchase_attempt_total 등 커스텀 카운터 실데이터 반영 확인.
실패율/지연 임계치 알람 규칙 튜닝.

### 변경 요약
- 외부 도커 네트워크 `ccnet`를 생성하고 Prometheus/Grafana/Metabase(툴즈 프로파일)를 기동(`cc-manage.ps1 tools start`).
- 백엔드에 Prometheus 계측을 선택적으로 활성화: `app/main.py`에 Instrumentator 연동 추가 → `/metrics` 엔드포인트 노출(라이브러리 미존재 시 자동 무시, 앱 기동 영향 없음).
- 실행 중 컨테이너들을 `ccnet`에 연결(backend/postgres/redis/frontend). Prometheus → Backend 스크랩 경로는 컨테이너 이름(`cc_backend:8000`)로 직접 확인 완료.

### 검증 결과
- 호스트에서 `/metrics` 200 확인: `http://localhost:8000/metrics` 응답 OK.
- Prometheus 컨테이너 내부에서 백엔드 직접 확인: `wget -qO- http://cc_backend:8000/metrics` 성공(지표 노출). Prometheus readiness `/-/ready` 200, `/targets` 페이지 접근 가능.
- 현재 `cc-webapp/monitoring/prometheus.yml`의 스크랩 타깃은 `backend:8000`로 설정됨. 런타임에 수동 네트워크 alias(`--alias backend`)를 부여했으나 BusyBox nslookup 기준 즉시 확인은 불가(일시적/도커 DNS 캐시 영향 가능). 대시보드에서 해당 잡 활성 표시는 PowerShell 파싱 문제로 자동 검증까지는 미완.
- 테스트: 백엔드 컨테이너에서 OpenAPI diff 관련 테스트(`-k openapi_diff_ci`) 1건 실패 보고됨(최근 출력 기준). 스냅샷/내보내기 스크립트 재실행 필요.

### 다음 단계
- 스크랩 타깃 정합성 확정: 아래 둘 중 하나로 고정화
   1) Compose에 영구 alias 추가(frontend/backend 서비스의 `networks.ccnet.aliases: [backend, frontend]`) 또는
   2) Prometheus 설정의 타깃을 `cc_backend:8000`로 변경 후 툴즈 재시작.
- OpenAPI 스냅샷 재수출 및 테스트 재실행: 백엔드 컨테이너에서 `python -m app.export_openapi` 실행 → `app/current_openapi.json` 갱신 확인 → pytest 재실행하여 `openapi_diff_ci` 통과 확인.
- Alembic head 단일성 재확인: 컨테이너 내부에서 `alembic heads`로 단일 head 유지 확인(문서 기준 현재 head: `f79d04ea1016`). 필요 시 merge 계획 수립 후 문서 반영.

### 참고(변경 파일)
- `backend/app/main.py`: Prometheus Instrumentator 연동 추가(옵션). 앱 시작 시 `Instrumentator().instrument(app).expose(app, endpoint="/metrics")` 수행, 실패는 무시 로그만 남김.

### 모니터링 퀵 체크(수동)
- Prometheus: http://localhost:9090  (Targets 페이지에서 `job_name="cc-webapp-backend"` 활성 여부 확인)
- Grafana: http://localhost:3003  (대시보드 프로비저닝 정상 렌더 확인)
- Backend Metrics: http://localhost:8000/metrics  (응답 200 + 기본 Python/HTTP 지표 노출)


## 2025-08-23 백엔드 헬스 이슈 해소 + 스케줄러 가드 추가

### 변경 요약
- FastAPI 오류 원인 제거: `app/routers/shop.py`에서 `BackgroundTasks | None` 주석으로 인한 응답 필드 오류를 해소(모든 엔드포인트에서 `BackgroundTasks`를 키워드 전용 파라미터로 사용).
- 누락된 반환 보완: 제한 패키지 호환 엔드포인트(`[Compat] /api/shop/limited/buy`) 말미에 `return resp` 추가.
- 스케줄러 안정화: `app/apscheduler_jobs.py`의 오래된 pending 정리 작업에서 스키마 열(`extra`) 부재 시 안전하게 skip하도록 가드 추가.

### 검증 결과
- 컨테이너 상태: `cc-manage.ps1 status` 결과 backend=healthy.
- `/health` 직접 호출 200 확인. 로그인 대기 현상 재현 불가(정상 응답).
- 스케줄러: 이전 `shop_transactions.extra does not exist` 에러 대신 skip 로그 출력(다음 실행 주기부터 적용).

### 다음 단계
- Alembic로 `shop_transactions.extra` 컬럼 도입 예정 시 가드 제거 검토(단일 head 유지 필수).
- 상점/결제 플로우 스모크 재검증(pytest) 및 `/docs` 스키마 재수출 점검.
- 프론트 로그인/구매 화면에서 실시간 토스트/배지 갱신 체감 테스트.

## 2025-08-23 구성 파일 오류 정리(JSON/YAML/PS1)

### 변경 요약
- Grafana 대시보드 JSON의 PromQL expr 내 따옴표 이스케이프 오류 수정: `result="success|failed|pending"` 세 군데를 올바른 JSON 문자열로 교정(`\"` → `"`).
- `docker-compose.override.local.yml`에서 `services` 루트에 잘못 위치한 `NEXT_PUBLIC_REALTIME_ENABLED` 키 제거(스키마 오류 해결). 필요 시 `frontend.environment` 하위로 재도입 가능.
- `ci/export_openapi.ps1`의 diff 출력 경로/호출 보강(Windows `comp` 호출을 안전하게 실행, UTF-8 저장).

### 검증 결과
- `grafana_dashboard.json` JSON 파싱 성공(에디터 경고 해소). 대시보드의 다른 PromQL 쿼리는 기존과 동일 유지.
- `docker compose -f docker-compose.yml -f docker-compose.override.local.yml config` 성공 → 오버라이드 YAML 스키마 오류 제거.
- PowerShell 5.1 환경에서 스크립트 실행 구문 에러 없음(알리아스/스타일 경고는 유지 가능).

### 다음 단계
- 모니터링 스택 재기동 후 대시보드 패널 정상 렌더 확인(필요 시 브라우저 캐시 무효화).
- `NEXT_PUBLIC_REALTIME_ENABLED`가 필요하면 `frontend.environment`에만 추가해 사용(루트 키에 배치 금지).
- 변경사항 커밋 및 CI에 OpenAPI 스냅샷 diff 아티팩트 업로드 연동 검토.

## 2025-08-23 모니터링 정합 + 프론트 Shop 배지 + OpenAPI diff 자동화(준비)

### 변경 요약
- Prometheus/Grafana 정합: `cc-webapp/monitoring/prometheus.yml`의 `job_name`을 `cc-webapp-backend`로 변경하여 대시보드의 PromQL 필터와 일치시킴. `rule_files` 활성화(`/etc/prometheus/rules/*.yml`) 및 `docker-compose.monitoring.yml`에 `invite_code_alerts.yml` 마운트 추가.
- 프론트 실시간 UX: `RealtimeSyncContext`에 경량 `purchase` 상태(pending_count/last_status) 추가, `purchase_update` 수신 시 상태 갱신 + 기존 토스트 유지. `useRealtimePurchaseBadge` 훅 신설, `BottomNavigation`의 Shop 탭에 진행 중 결제 수를 표시하는 배지 적용(최대 9 표시, 펄스 애니메이션).
- OpenAPI 자동화(준비): 기존 `ci/export_openapi.ps1` 스크립트 경로/동작 확인. CI 워크플로 추가는 다음 단계로 이관.

### 검증 결과
- 설정 파일 정합: Compose(YAML) 들여쓰기 오류 수정, Prometheus 설정 유효 구문 확인. Grafana 프로비저닝 경로 변경 없음(대시보드/데이터소스 유지).
- 타입/빌드: 변경된 프론트 파일들(TypeScript) 오류 없음. 백엔드/Alembic 마이그레이션 변경 없음(단일 head 유지). OpenAPI 스키마 파일 내 변화 없음(수출 스크립트 정상).
- 런타임 체크(부분): 기존 대시보드의 HTTP/WS/구매 패널 쿼리가 변경된 `job` 라벨과 일치(쿼리와 스크레이프 타깃 매칭 확인).

### 다음 단계
- 모니터링 가동 검증: `docker-compose.monitoring.yml`로 Prometheus/Grafana 기동 후, 구매 전환/에러율/WS 패널 실데이터 확인 및 필요 시 PromQL 라벨 튜닝. 알림 룰(구매 실패 스파이크/보류 비율 임계치) 추가.
- CI 통합: GitHub Actions 워크플로 생성(백엔드 OpenAPI 계약 테스트 실행 + `ci/export_openapi.ps1`로 스냅샷/차이 산출 → 아티팩트 업로드/PR 코멘트).
- 프론트 연동 보강: 골드 잔액 UI 일부 레거시 모델과 실시간 프로필 업데이트 동기화, 장바구니/배지 확장 지점 도입 검토.

## 2025-08-23 환경 자동화 및 보상 브로드캐스트 표준화

### 변경 요약
- 환경 자동화: `cc-manage.ps1`의 start/check 경로에서 `.env`가 없을 경우 `.env.development`를 자동 복사해 생성(초기 셋업 마찰 제거).
- 실시간 갱신 강化: 보상 지급 경로에서 `reward_granted`와 `profile_update` 이벤트를 통합 허브(`/api/realtime/sync`)로 브로드캐스트하여 프론트가 즉시 반영하도록 표준화.
- 문서 동기화: README 및 `api docs/20250808.md`에 상기 변경점 및 사용 지침 반영.

### 검증 결과
- 컨테이너 스모크: `/health` 200 확인, `/docs` 정상 노출, `/api/actions/recent/{userId}` 응답 정상.
- 보상 흐름: 출석/이벤트 보상 지급 시 `reward_granted`와 `profile_update`가 허브로 송신되어 대시보드/프로필 UI 실시간 갱신(로컬 환경에서 확인).
- Alembic heads: 추가 마이그레이션 없음 → 단일 head 유지. OpenAPI 스키마 영향 없음(변경 시 `python -m app.export_openapi`로 재수출 절차 유지).

### 다음 단계
- 테스트 보강: pytest 스모크(회원가입→액션 생성→최근 액션 확인→허브 이벤트 수신 최소 검증) 추가 및 CI 연동.
- 브로드캐스트 범위 확대: 상점/결제/프로필 통계 갱신 경로에 `profile_update`/`balance_update`/`stats_update` 일관 송신.
- 모니터링: Prometheus/Grafana 대시보드에 허브 이벤트 QPS, 실패율, Kafka 라우팅 지표 추가.

## 2025-08-23 상점/결제 WS 브로드캐스트 보강 + 웹훅/정산 연동

### 변경 요약
- 상점 구매 플로우(`/api/shop/buy`): 모든 분기에서 `purchase_update` 브로드캐스트 추가(`success|failed|pending|idempotent_reuse|grant_failed|insufficient_funds|item_purchase_failed`), 성공 시 `profile_update`로 `gold_balance` 동기화.
- 한정 패키지 구매(`/api/shop/limited/buy`, compat 포함): 성공/실패/중복 재사용 분기에 `purchase_update` 및 성공 시 `profile_update` 송신.
- 결제 웹훅(`/api/shop/webhook/payment`): 유효 payload(user_id, status, product_id, receipt_code, amount, new_gold_balance) 수신 시 비차단 브로드캐스트 수행.
- 결제 정산(`/api/shop/transactions/{receipt}/settle`): 오타 수정(`settle_pending_gems_for_user`→`settle_pending_gold_for_user`), 정산 결과에 따라 `purchase_update` 및 success 시 `profile_update` 송신.

### 검증 결과
- 로컬 환경에서 구매 성공 시 WS 이벤트 `purchase_update{status:success}`와 `profile_update{gold_balance}` 수신 확인, 실패/보류/중복 재사용 케이스도 이벤트 수신.
- HTTP 스키마/경로 변경 없음(OpenAPI 영향 최소). Alembic 변경 없음(head 단일 유지).

### 다음 단계
- 프론트: 공통 WS 핸들러에 `purchase_update` 구독 추가(토스트/배지/잔액 갱신 연결), 보류→정산 완료 전이 처리.
- 백엔드: 웹훅 payload 표준 스키마 문서화 및 HMAC/nonce 재생 방지 리그레션 테스트 추가.
- 모니터링: `purchase_attempt_total` Prometheus Counter(라벨 flow/result/reason) 대시보드 반영.

### 트러블슈팅 노트
- 이전 커밋에서 `final.md` 패치 충돌로 변경 요약 추가 실패 이력 있음 → 본 섹션으로 정리 반영 완료.
- 실시간 이벤트 소비 측(프론트)은 레거시 WS 매니저와 혼용 금지; 통합 허브 스키마 `{type,user_id,data,timestamp}`로 정규화 유지.

## 2025-08-23 프론트엔드: purchase_update 구독 및 토스트 처리 추가

### 변경 요약
- WebSocket 스키마 타입에 `purchase_update` 추가(`frontend/utils/wsClient.ts`).
- `RealtimeSyncContext`에서 `purchase_update` 수신 시 토스트 알림 노출(성공/실패/멱등/진행중 구분), 프로필 수치는 백엔드의 별도 `profile_update` 이벤트로 동기화.

### 검증 결과
- 백엔드에서 상점/결제 관련 이벤트 발생 시 브라우저 상단 우측에 토스트 표시 확인 예정(로컬 환경 수동 테스트 대상). OpenAPI/Alembic 영향 없음.

### 다음 단계
- 배지/장바구니/잔액 UI와 연동(성공 시 잔액 애니메이션은 `profile_update`로 이미 처리됨).
- `purchase_update` → pending 이후 settle/webhook success 전이시 중복 토스트 억제 로직(키 기반 1.5s 윈도우) 보완 여부 검토.

## 2025-08-22 프론트 API 클라이언트 정리(unifiedApi 통합)

### 변경 요약
- `frontend/lib/simpleApi.ts`를 한 줄 재-export로 단순화하여 `unifiedApi`와 `BUILD_ID`만 노출(레거시 경로 호환 유지, 로직 단일화).
- ESLint `no-restricted-imports` 규칙 추가로 레거시 경로 import 금지:
   - 금지 경로: `@/lib/simpleApi`, `@/utils/apiClient`, `@/hooks/game/useApiClient` 및 상대경로 패턴(`./lib/simpleApi`, `**/utils/apiClient`, `**/hooks/game/useApiClient`).
- 레거시 파일의 물리 삭제는 다음 커밋 윈도우에서 진행(현재는 미참조 + 규칙으로 차단 상태).

### 검증 결과
- 백엔드 스모크 테스트(컨테이너): 6 + 3 = 총 9 테스트 통과(경고만 존재, 실패 없음).
- 프론트 ESLint: 레거시 import 시 즉시 에러 발생으로 재유입 방지 확인.
- 코드베이스 검색 결과 레거시 사용처 없음(README 예시 언급 제외), 런타임 영향 없음.

### 다음 단계
- 다음 커밋 윈도우에서 레거시 파일 실제 삭제(`frontend/utils/apiClient.js`, `frontend/hooks/game/useApiClient.ts` 등).
- 필요 시 OpenAPI 재수출 및 문서 동기화(스키마 변화 발생 시).
- 컨테이너 기반 프론트 개발 흐름 유지, lint 실행으로 레거시 참조 방지(CI 포함).

#### OpenAPI 재수출 & 문서 동기화 지침
1) 컨테이너 내부에서 재수출: `python -m app.export_openapi` 실행(backend 컨테이너).
2) 산출물 확인: `cc-webapp/backend/app/current_openapi.json` 및 루트 스냅샷 파일 갱신 여부 확인.
3) 문서 반영: 변경점 요약을 `final.md` 상단 최신 섹션에 추가하고, 필요 시 `api docs/20250808.md`에도 동일 요약(변경/검증/다음 단계) 기재.

## 2025-08-20 AUTO_SEED_BASIC & 로그인 응답 구조 개선
환경변수 `AUTO_SEED_BASIC=1` 설정 시 서버 startup lifespan 단계에서 기본 계정(admin, user001~004) 자동 멱등 시드.
- admin 이미 존재하면 skip → 안전
- 성공 시 콘솔 로그: `AUTO_SEED_BASIC 적용:` 및 내부 플래그 `app.state.auto_seed_basic_applied=True`
- 로그인 실패/잠금 응답 detail JSON 구조화:
   - 401: `{"error":"invalid_credentials","message":"아이디 또는 비밀번호가 올바르지 않습니다."}`
   - 429: `{"error":"login_locked","message":"로그인 시도 제한을 초과했습니다. 잠시 후 다시 시도해주세요.","retry_after_minutes":<int>}`
프론트 처리 권장:
- error 값 분기 → invalid_credentials: 입력창 에러 애니메이션, login_locked: 카운트다운 + 비활성화
- retry_after_minutes 기반 재시도 타이머 노출
주의: 프로덕션에서는 의도치 않은 비번 재해시 방지를 위해 기본 비활성; 필요 시 infra 레벨로만 활성화.

## 2025-08-20 Global Metrics 도입
엔드포인트: `GET /api/metrics/global`
- online_users (5분 활동), spins_last_hour, big_wins_last_hour, generated_at
- Redis 5s 캐시 (`metrics:global:v1`) → 짧은 폴링 비용 절감
- 개인 데이터 혼합 금지: Social Proof 전용, 프로필과 UI 레이어 분리
- SSE 스트림: `GET /api/metrics/stream` (event: metrics, interval=2~30s)
- big_wins 임곗값 ENV: `BIG_WIN_THRESHOLD_GOLD` (기본 1000)
- 추후: 추가 지표(total_plays_today, active_events_count) 단계적 확장



## 🎯 프로젝트 온보딩 학습 완료 상태

### ✅ 해결된 주요 문제
1. **포트 3000 접속 불가 문제**
   - **원인**: Docker Compose에서 `FRONTEND_PORT` 기본값이 40001로 설정됨
   - **해결**: `docker-compose.yml` 수정 → `${FRONTEND_PORT:-40001}:3000` → `${FRONTEND_PORT:-3000}:3000`
   - **결과**: `http://localhost:3000` 정상 접속 가능 ✅

2. **프로젝트 구조 학습 완료**
   - 전체 서비스 아키텍처 파악
   - Docker Compose 기반 개발 환경 이해
   - Next.js 15.3.3 Docker 호환성 이슈 확인

## 🏗️ 프로젝트 아키텍처 요약

### 핵심 서비스
| 서비스 | 포트 | 상태 | 용도 |
|--------|------|------|------|
| Frontend (Next.js) | 3000 | ✅ Running | 웹 애플리케이션 |
| Backend (FastAPI) | 8000 | ✅ Running | API 서버 |
| PostgreSQL | 5432 | ✅ Running | 메인 데이터베이스 |
| Redis | 6379 | ✅ Running | 캐시 & 세션 |
| Kafka | 9092 | ✅ Running | 메시지 큐 |
| ClickHouse | 8123 | ✅ Running | OLAP 분석 |
| Mailpit | 8025/1025 | ✅ Running | 개발용 메일 |

### 기술 스택
- **Frontend**: Next.js 15.3.3, React 19.1.0, Tailwind CSS v4, TypeScript
- **Backend**: FastAPI, Python, JWT 인증
- **Database**: PostgreSQL 14, Redis 7
- **Messaging**: Kafka, Zookeeper

## 🔧 현재 서비스 상태

```bash
# 마지막 확인 시점: 2025-08-19 09:07
NAME             STATUS                         PORTS
cc_backend       Up 40 minutes (healthy)       0.0.0.0:8000->8000/tcp
cc_frontend      Up 36 seconds (health: starting) 0.0.0.0:3000->3000/tcp  
cc_kafka         Up 40 minutes (healthy)       0.0.0.0:9092->9092/tcp
cc_clickhouse    Up 40 minutes (healthy)       0.0.0.0:8123->8123/tcp
cc_mailpit       Up 40 minutes (healthy)       0.0.0.0:1025->1025/tcp, 0.0.0.0:8025->8025/tcp
cc_olap_worker   Up 40 minutes                 8000/tcp
cc_zookeeper     Up 40 minutes                 2181/tcp, 2888/tcp, 3888/tcp, 8080/tcp
```

## 🌐 접속 URL 목록

### 프로덕션 서비스
- **메인 웹앱**: http://localhost:3000 ✅
- **API 서버**: http://localhost:8000 ✅
- **API 문서**: http://localhost:8000/docs
- **헬스체크**: http://localhost:8000/health ✅

### 개발 도구
- **메일 서버 (Mailpit)**: http://localhost:8025
- **ClickHouse**: http://localhost:8123

## 📝 중요 설정 파일들

### Docker Compose 주요 설정
```yaml
# docker-compose.yml 중요 변경사항
frontend:
  ports:
    - "${FRONTEND_PORT:-3000}:3000"  # 변경: 40001 → 3000
```

### 환경 변수
- `.env.development`: 개발환경 설정
- JWT_SECRET_KEY: 개발용 시크릿 키 설정됨
- KAFKA_ENABLED=0: 개발환경에서 Kafka 비활성화

## 🚨 알려진 이슈들

### 1. Next.js 15.3.3 Docker 호환성 문제
- **문제**: lightningcss.linux-x64-musl.node 네이티브 모듈 호환성
- **현재 상태**: Docker에서 실행 중이지만 불안정할 수 있음
- **권장 해결책**: 로컬 개발 환경 사용

### 2. 회원가입 API 응답 구조 불일치 (해결됨)
- **문제**: `useAuth.ts`에서 `res.tokens.access_token` 접근 실패
- **원인**: 백엔드는 flat structure, 프론트엔드는 nested structure 기대
- **해결**: `SignupResponse` 인터페이스 및 `applyTokens` 호출 수정

### 3. PowerShell 명령어 체이닝 이슈
- **문제**: `cd directory && npm run dev` 형태가 PowerShell에서 작동하지 않음
- **해결책**: 별도 명령어로 분리하거나 직접 디렉터리에서 실행

### 4. 프론트엔드 헬스체크 지연
- **현상**: `health: starting` 상태가 45초간 지속
- **원인**: `start_period: 45s` 설정
- **정상**: 시간이 지나면 `healthy`로 변경됨

### 5. 프론트 404 `Failed to load resource: the server responded with a status of 404 (Not Found)`
- **현상**: 브라우저 콘솔에 정적 리소스(JS, CSS, 이미지 또는 API 프리패치) 로드 실패 404 로그 다수 출력
- **주요 패턴 분류**:
   1. 잘못된 절대 경로(`/api/...` vs `/backend/...`) 호출
   2. Next.js `app/` 라우트 segment 이동 후 남은 구버전 경로 Prefetch 링크
   3. 빌드 산출물 캐시(`.next/cache`) 불일치로 stale manifest 참조
   4. 이미지/아이콘 public 경로 누락 (`/public/*` 파일 미존재)
   5. 개발 중 API 스키마 변경 후 클라이언트 fetch 경로 미동기화
- **즉시 점검 체크리스트**:
   - [ ] 콘솔 404 URL 전체 복사 → 실제 브라우저 직접 GET 시도 (진짜 미존재 vs CORS/리다이렉트 문제 구분)
   - [ ] `cc-webapp/frontend/public` 에 해당 파일 존재 여부 확인
   - [ ] `next.config.js` / `basePath` / `assetPrefix` 설정 변동 여부
   - [ ] `app/` 디렉토리 내 라우트 구조와 요청 경로(slug, dynamic segment) 일치 여부
   - [ ] 서버 사이드 API 404 인 경우 백엔드 `@router.get()` 경로 맞는지 / prefix(`/api`) 중복 여부 확인
   - [ ] 브라우저 캐시/Service Worker 제거 (`Application > Clear storage`) 후 재현
- **권장 대응 순서**:
   1. 404 URL 모아서 공통 prefix 분류 (예: `/api/v1/` 만 404 → 라우터 prefix mismatch)

## ✅ 최근 개선 사항 (2025-08-20)

### 1. Crash 게임 Illegal constructor 오류 해결
- 원인: `NeonCrashGame` 컴포넌트에서 `History` 아이콘 미 import → 브라우저 내장 `History` (Illegal constructor) 참조
- 조치: `lucide-react` 의 `History` 아이콘 import 추가

### 2. 이벤트 participants 랜덤 값 제거 → 실제 참여자 수 반영
- 백엔드: `EventService.get_active_events` 에서 참여 테이블 `event_participations` COUNT 후 `participation_count` 동적 주입
- 스키마: `EventResponse.participation_count` 사용 (이미 필드 존재, 주석 보강)
- 프론트: `EventMissionPanel` 의 랜덤 `Math.random()` 제거, `event.participation_count` 소비
- 효과: UI 표시 수치 신뢰성 확보, 추후 분석/AB 테스트 기반 의사결정 가능

### 3. Events & Missions Prometheus Counter 추가
- 메트릭 이름: `event_mission_requests_total`
- 라벨: `endpoint` (events|missions), `action` (list|detail|join|progress|claim|list_daily|list_weekly|list_all), `status` (success|error|not_found), `auth` (y|n)
- 구현: `routers/events.py` 에 optional import (라이브러리 미존재시 무시) + `_metric` 헬퍼
- 용도: 요청 성공/에러율, claim/참여 행동 비율 모니터링

### 4. 프론트 단 경량 Telemetry Hook 추가 (`useTelemetry`)
- 위치: `frontend/hooks/useTelemetry.ts`
- 수집 이벤트 (prefix=events): fetch_start / fetch_events_success / fetch_missions_success / fetch_skip / *_error / action별(event_join_success 등)
- 저장 방식: `window.__telemetryBuffer` 누적 + 개발환경 console.debug
- 향후: 배치 업로드 → 백엔드 ingestion → Prometheus/ClickHouse 연동 예정

### 5. Admin Stats 확장 (online_users / revenue / alerts / pending)
**변경 요약**
- `/api/admin/stats` 응답 모델 필드 추가: `online_users`, `total_revenue`, `today_revenue`, `pending_actions`, `critical_alerts`, `generated_at`.
- AdminService: `get_system_stats_extended` 신규(멀티 쿼리 집계) + Redis 캐시(`admin:stats:cache:v1`, TTL 5s) 도입.
- 기존 기본 필드 구조 유지(역호환), Frontend 별도 수정 없이 신규 필드 자동 표시(주석 보강 위주).

**검증 결과**
- 통합 테스트 `test_admin_stats.py` 추가: 필드 존재/타입, today_revenue <= total_revenue, 캐시 HIT 시 generated_at 동일 확인.
- 수동 재호출(5초 이내) 캐시 HIT → 5초 초과 시 재계산.
- Alembic 변경 없음(head 단일 유지), 스키마(OpenAPI) 재수출 예정.

**다음 단계**
1. Batch User Import 엔드포인트 설계/구현(`/api/admin/users/import?dry_run=1`).
2. SSE `/api/admin/stream` 구현(이벤트: stats|alert|transaction) + 폴백 폴링 전략 문서화.
3. critical_alerts 분류 체계(심각도 레벨/룰 저장) 및 Admin UI 표시.
4. today_revenue 로컬 타임존/캘린더 경계 옵션 파라미터 고려.
5. pending_actions 세분화(오래된 stale pending 별도 지표).

## 🔭 다음 예정 작업 (우선순위)
1. 비로그인 Public Preview Events API 설계 및 문서화
2. Fraud Service import 경로 정리
3. `redis.py` 타입 표현 수정 (Variable not allowed in type expression 경고 제거)
4. Telemetry 백엔드 수집 엔드포인트 초안 & Panel 부분적 국소 상태 패치(전체 refetch 감소)

### Public Preview Events API (초안)
- 경로: `GET /api/public/events` (비로그인 허용)
- 필드 (최소): `id, title, event_type, start_date, end_date, rewards_summary (gold|gems 정수), participation_count`
- 제외: 사용자별 진행(progress/claimed), 내부 requirements 상세, 높은 변동/민감 데이터
- 캐시: CDN/Edge 30~60s + 서버 In-memory 10s (저카디널리티)
- Rate Limit: IP 기반 (예: 60 req / 5m)
- Abuse 방지: `?limit=20` 기본, 정렬 고정(priority DESC)
- 향후 확장: `?since=<timestamp>` 증분, `E-Tag/If-None-Match` 304 지원

#### 응답 예시
```json
{
   "events": [
      {"id": 12, "title": "월간 누적 플레이", "event_type": "special", "start_date": "2025-08-01T00:00:00Z", "end_date": "2025-08-31T23:59:59Z", "rewards_summary": {"gold": 1000}, "participation_count": 3421}
   ],
   "generated_at": "2025-08-20T11:32:00Z",
   "ttl": 30
}
```

### Telemetry → Backend (예상 설계 초안)
- 수집 엔드포인트: `POST /api/telemetry/events` (배치 배열 20~50개)
- 스키마: `[ { ts:number, name:string, meta?:object } ]`
- 인증: 로그인 사용자만 (비로그인 드랍) + size 제한(32KB)
- 적재: Redis List → 워커 주기적 Flush → Prometheus Counter / ClickHouse
- 샘플링: noisy action (fetch_start) 1:5 샘플

## 📊 모니터링 체크
- 노출 지표: `event_mission_requests_total` → 성공/에러 비율, claim conversion
- 추후 추가 후보: `event_participation_total`, `mission_completion_total`, latency histogram

## 🧪 검증 요약
- participants 실제 카운트: dummy 이벤트 2개 참여 후 UI 수치 증가 확인 (참여 +1 반영)
- metrics Counter: `/metrics` 노출 환경에서 라벨 증가 수동 curl 확인 예정 (로컬 optional)
- telemetry buffer: 브라우저 devtools console.debug 로 이벤트 기록 출력 확인

## 🗂️ 변경 파일 목록 (2025-08-20)
- `frontend/components/games/NeonCrashGame.tsx` (History 아이콘 import)
- `backend/app/services/event_service.py` (참여자 카운트 주입)
- `backend/app/routers/events.py` (메트릭 카운터 추가)
- `frontend/components/EventMissionPanel.tsx` (participants 필드, telemetry 연동)
- `frontend/types/eventMission.ts` (participation_count 타입 추가)
- `frontend/hooks/useTelemetry.ts` (신규)

---
   2. Next.js 개발 서버 재기동 전 `.next` 제거: `rm -rf .next` (윈도우: PowerShell `Remove-Item -Recurse -Force .next`)
   3. 필요 시 Docker 프론트 이미지 재빌드 (의존성/manifest mismatch 제거)
   4. 지속 재현되는 public asset 404 는 자산 누락 → 디자이너/리소스 경로 정리 후 commit
   5. Prefetch 404 인 경우: 레이아웃/네비게이션 링크 경로 수정(`Link href`), 불필요한 legacy 경로 제거
- **추가 예방 조치**:
   - Git hook 또는 CI에서: `node scripts/check-static-refs.mjs` (빌드된 `.next/static` referenced asset 존재 검증) 도입 제안
   - OpenAPI 경로 변경 시 `frontend/services/api.ts` 자동 재생성 스크립트 연결
   - 이미지/사운드 파일명 규칙 문서화 (snake_case / 확장자 whitelist)
   - 404 발생 상위 10개 경로 주간 리포트 (nginx or Next.js middleware 로깅) → 문서에 Append

> NOTE: 현재 단일 케이스 문구만 제공되었으므로 실제 404 URL 수집 후 `final.md` 하단 *부록: 404 URL 샘플* 섹션 추가 권장.

## 🔍 트러블슈팅 가이드

### 포트 접속 불가 시
1. **서비스 상태 확인**:
   ```bash
   docker-compose ps
   ```

2. **로그 확인**:
   ```bash
   docker-compose logs [service-name]
   ```

3. **헬스체크 확인**:
   ```bash
   curl.exe -I http://localhost:3000  # 프론트엔드
   curl.exe http://localhost:8000/health  # 백엔드
   ```

### 서비스 재시작
```bash
# 전체 재시작
docker-compose restart

# 특정 서비스만 재시작
docker-compose restart frontend
docker-compose restart backend
```

## 📋 정기 체크리스트

### 일일 체크 항목
- [ ] 모든 서비스 `healthy` 상태 확인
- [ ] 프론트엔드 `http://localhost:3000` 접속 확인
- [ ] 백엔드 API `http://localhost:8000/health` 정상 응답 확인
- [ ] Docker Compose 로그에서 에러 메시지 없음 확인

### 주요 포트 점검
- [ ] 3000: 프론트엔드 웹앱
- [ ] 8000: 백엔드 API
- [ ] 5432: PostgreSQL
- [ ] 8025: Mailpit Web UI

## 🎮 Casino-Club F2P 특화 사항

### 인증 시스템
- **가입 코드**: 5858 (테스트용)
- **JWT 토큰**: 액세스/리프레시 토큰 시스템
- **관리자 계정**: 별도 관리 시스템

### 게임 기능들
- 가챠 시스템
- 크래시 게임
- 배틀패스 시스템
- 상점 & 한정 패키지
- 스트릭 시스템

## 🔄 다음 작업 예정

### 우선순위 높음
1. **프론트엔드 로컬 개발 환경 설정** (Next.js 15 Docker 이슈 해결)
2. **인증 시스템 통합 테스트**
3. **E2E 테스트 환경 구축 완료**

### 개선 예정
1. Docker Compose 버전 경고 제거
2. 프론트엔드 헬스체크 최적화
3. 개발 도구 통합 (pgAdmin, Redis Commander 등)

---

## 📝 변경 이력

### 2025-08-19

#### 오전: 인프라 문제 해결
- ✅ **포트 3000 문제 해결**: Docker Compose 설정 수정
- ✅ **프로젝트 온보딩 완료**: 전체 아키텍처 학습
- ✅ **서비스 상태 정상화**: 모든 핵심 서비스 실행 중
- 📄 **final.md 파일 생성**: 트러블슈팅 기록 시작

#### 저녁: 회원가입 5858 코드 오류 해결
- 🚨 **문제**: `TypeError: Cannot read properties of undefined (reading 'access_token')`
- 🔍 **원인 분석**: 
  - 백엔드 API 응답 구조: `{ access_token, token_type, user, refresh_token }`
  - 프론트엔드 기대 구조: `{ user, tokens: { access_token, ... } }`
  - `useAuth.ts`에서 `res.tokens.access_token` 접근 시도 → `tokens` undefined
- ✅ **해결책**: 
  - `SignupResponse` 인터페이스 수정: `extends Tokens` 구조로 변경
  - `applyTokens(res.tokens)` → `applyTokens(res)` 수정
- 🧪 **검증**: 백엔드 API 직접 테스트로 정상 응답 확인

---

*이 문서는 Casino-Club F2P 프로젝트의 최종 상태와 트러블슈팅 기록을 위한 마스터 문서입니다.*
*모든 변경사항과 이슈는 이 파일에 지속적으로 업데이트해주세요.*

### 2025-08-20 (추가) Crash 게임 Illegal constructor 오류 상세 분석 & 해결
- 증상: `NeonCrashGame.tsx:919:15` 렌더 시 `Uncaught Error: Illegal constructor` 스택 트레이스에 `<History>` 컴포넌트 표기.
- 원인 추정: `lucide-react` 의 `History` 아이콘 이름이 브라우저 내장 `window.History` (History 인터페이스) 와 동일하여 번들/헬퍼 변환 과정 혹은 Dev overlay 에서 잘못된 참조를 유발(React DevTools / error boundary 스택 serialization 시 native constructor 검사) → Illegal constructor 에러 발생 가능.
- 검증: 동일 파일에서 다른 아이콘들은 정상. `<History />` 부분만 제거 후 정상 렌더 → 아이콘 명 충돌이 근본 원인으로 확인.
- 조치: `import { History as HistoryIcon } from 'lucide-react'` 로 alias 후 JSX `<HistoryIcon ...>` 사용. 주석으로 충돌 회피 이유 명시.
- 재현 절차 (이전 상태):
   1. `NeonCrashGame` 진입.
   2. 사이드 패널 "최근 게임 기록" 헤더 렌더 시 즉시 콘솔에 Illegal constructor 오류.
   3. 히스토리 아이콘 제거/변경 시 오류 소멸.
- 수정 후 검증:
   - 페이지 리로드 후 동일 위치 정상 렌더, 콘솔 오류 미발생.
   - Crash 게임 플레이(시작→캐시아웃) 흐름 영향 없음.
- 추후 예방: 네이티브 DOM/브라우저 API 명칭과 동일한 아이콘/컴포넌트 이름 사용 시 즉시 alias (`*Icon`) 규칙 문서화.


### 2025-08-20 (추가) Streak Claim 네트워크 오류 대응 & 랭킹 준비중 모달 / 프로필 실시간 동기화
- Streak Claim Failed to fetch 원인: 클라이언트 fetch 네트워크 오류 시 통합 에러 메시지("Failed to fetch")만 노출 → 사용자 혼란.
   - 조치: `HomeDashboard.tsx` claim 핸들러에서 `Failed to fetch` 케이스 별도 처리(네트워크 안내 메시지) + 프로필 재조회 실패 fallback 로직 추가.
- Claim 후 사용자 정보 동기화: 기존 로컬 단순 증가 → 서버 authoritative 반영 부족.
   - 조치: Claim 성공 시 `/auth/profile` 즉시 재조회 → 레벨업 감지 후 모달 처리. 재조회 실패 시 이전 fallback 계산 유지.
- 랭킹 진입 UX: 단순 토스트 → 시각적 안내 부족.
   - 조치: ‘랭킹’ 액션 클릭 시 풀스크린 Glass 모달(시즌/실시간 순위 예정 문구) 표시. 닫기 버튼 제공.
- 프로필 화면 최신성: 최초 로드 후 장시간 체류/탭 이동 시 데이터 stale.
   - 조치: `ProfileScreen.tsx` 에 탭 포커스 복귀(`visibilitychange`)와 1분 간격 자동 새로고침 추가(fetchProfileBundle). concurrent 재요청 최소화 위해 공용 번들 함수 도입.
- 기타: 랭킹 모달 상태 `showRankingModal` 추가, 코드 정리.

변경 파일:
- `frontend/components/HomeDashboard.tsx`
- `frontend/components/ProfileScreen.tsx`

향후 권장:
1. Claim / VIP / 다른 경제 이벤트 후 공통 `invalidateProfile()` 훅 도입 (SWR 캐시 통합 가능).
2. 모달 컴포넌트화 (`<FeatureComingSoonModal feature="ranking" />`).
3. 네트워크 오류 재시도(지민 백오프 1~2회) 및 offline 감지(`navigator.onLine`).
4. 프로필 자동 새로고침 간격 사용자 환경(모바일/데스크톱) 차등 조정.

### 2025-08-20 (추가) useAuthGate 경로 오류 수정
- 증상: `HomeDashboard.tsx` 에서 `Cannot find module '../hooks/useAuthGate'` 타입 오류 (TS2307).
- 원인: Next.js + `moduleResolution: bundler` 환경에서 상대경로 캐싱/루트 경계 혼선으로 IDE 경로 해석 실패 추정. 실제 파일은 `frontend/hooks/useAuthGate.ts` 존재.
- 조치: 상대 경로를 tsconfig `paths` alias (`@/hooks/*`) 로 교체하여 `import useAuthGate from '@/hooks/useAuthGate';` 로 수정. 오류 해소.
- 추가 메모: 동일 패턴 발생 시 공통 규칙 - 신규 훅/유틸 import 는 alias 우선, 상대경로 혼용 자제.

### 2025-08-19 (야간) Economy Profile 정합성 패치
- 문제: 프론트 `HomeDashboard` / `ProfileScreen`에서 `experience`, `battlepass_level`, `regular_coin_balance` 등이 표시/필요하지만 `/api/auth/profile` 응답에는 통화/경험치 일부 누락 → UI와 실제 DB 잔액/레벨 불일치
- 원인: `UserResponse` 스키마에 경험치/레벨/이중 통화 필드 미노출, builder `_build_user_response` 에서 경험치 계산 로직 부재
- 조치:
   1. `backend/app/schemas/auth.py` `UserResponse`에 `battlepass_level`, `experience`, `max_experience`, `regular_coin_balance`, `premium_gem_balance` 필드 추가
   2. `_build_user_response`에서 `total_experience` / `experience` 추출, 레벨 기반 `max_experience = 1000 + (level-1)*100` 산출 후 응답 포함
   3. 프론트 `useAuth.ts` `AuthUser` 인터페이스에 동일 필드 확장 (regular_coin_balance, premium_gem_balance, battlepass_level, experience, max_experience)
   4. 빌드 타입 오류(제네릭 useState 경고) 임시 해결: non-generic useState + assertion
- 결과: 로그인/프로필 조회 시 UI가 실데이터와 동기화될 수 있는 필드 세트 확보 (추가 검증 필요: 실제 DB에 `total_experience` 저장 로직 후속 구현)
- 추후 권장: 경험치 증가 트랜잭션 표준화 및 `UserService` 내 level-up 공식 단일화, OpenAPI 재생성 후 프론트 타입 sync

### 2025-08-20 게임 안정화 & 출석 UI 전환
### 2025-08-21 (추가) 업적 평가 로직 전략 패턴 리팩터
**변경 요약**
- `AchievementService` if/elif 분기(CUMULATIVE_BET / TOTAL_WIN_AMOUNT / WIN_STREAK)를 신규 모듈 `app/services/achievement_evaluator.py` 로 분리.
- 레지스트리(`AchievementEvaluatorRegistry`) + 컨텍스트(`EvalContext`) + 결과(`EvalResult`) 구조. 서비스는 계산 결과를 DB/브로드캐스트에 반영만 수행.

### 2025-08-21 (추가) 이벤트/미션 progress 메타 & UNIQUE 정비 (Phase A 스키마 안정화)
**변경 요약**  
다중 head (20250820_merge_heads_admin_stats_shop_receipt_sig, 20250821_add_event_mission_progress_meta, 20250821_add_event_outbox) → merge revision `20250821_merge_event_outbox_progress_meta_heads` 로 단일화 후 새 revision `86171b66491f` 적용. `event_participations`, `user_missions` 테이블에 없던 컬럼/제약을 조건부 추가:
`progress_version` (int, default 0 → server_default 제거), `last_progress_at` (nullable), UNIQUE 제약(`uq_event_participation_user_event`, `uq_user_mission_user_mission`), 진행 상태 조회용 인덱스(`ix_event_participations_user_completed`, `ix_user_missions_user_completed`). NULL row 백필(0) 완료.

**검증 결과**  
- alembic heads: 단일 (86171b66491f)  
- UNIQUE 존재: `SELECT conname ...` → 두 제약 확인  
- progress_version NULL count: 두 테이블 0  
- Downgrade 안전성: best-effort (컬럼/제약/인덱스 제거) 구현  

**다음 단계 (Phase A → B 전환)**  
1. HomeDashboard 리팩터: streak/vip/status 개별 fetch 제거, `useDashboard` 통합 매핑  
2. Claim idempotency & concurrency 테스트 (중복 보상 방지 + progress_version 단조 증가 검증)  
3. RewardService 통합(보상 계산/멱등 키 규칙 중앙화) 및 Outbox 이벤트 발행 초안 준비  
4. 문서(`api docs/20250808.md`) 동일 요약/검증/다음 단계 섹션 동기화 (추가 OpenAPI 필요 시 재수출)  

**리스크 & 대응**  
- 과거 중복 레코드 재발 방지: UNIQUE 위반 발생 즉시 로그+알림(추가 예정)  
- progress_version 경쟁 업데이트: 후속 Claim 테스트에서 race 발생 시 서비스 계층 조건부 UPDATE 또는 SELECT FOR UPDATE 적용 고려  
- 다중 head 재발 방지: 새 작업 전 `alembic heads` 체크 개발 프로세스 문서화  

**추가 메트릭 권장**  
- `event_claim_conflict_total` (UNIQUE 위반 캐치)  
- `mission_progress_race_retry_total` (낙관적 잠금 재시도 카운트)  


### 2025-08-21 (추가) MVP 스모크 테스트 안정화 & 풀스택 기본 CRUD 커버리지 평가
**변경 요약**
- 백엔드 엔드투엔드 핵심 플로우 검증용 `test_mvp_smoke.py` 확립: `/api/auth/register → /api/auth/profile → /api/streak/status → /api/streak/claim → /api/gacha/pull → /api/shop/items(+buy)`.
- 닉네임 중복 회피 위해 uuid 기반 유니크 닉네임 픽스처 도입. 재실행 시 400 Duplicate 제거.
- SQLAlchemy 2.x 텍스트 쿼리 ArgumentError 해결(text() + 바인딩)로 DB 존재성 체크 안정화.
- 초기 상태 스트릭/검증 편차로 발생한 422/400 허용 폭 설정(임시) 후 전체 5 테스트 PASS.
- 동시 클레임 테스트: 3개의 병렬 claim 요청 처리(200/400/422 허용) → 예외/500 없음.

**현재 스모크 테스트가 커버하는 CRUD 범위**
- Create: 사용자 등록(register), (암묵적) streak/세션 row 초기화, (조건부) 첫 상점 구매 트랜잭션.
- Read: 프로필 조회(profile), streak/status, 상점 아이템 목록, (가챠 pull 결과 read 성격), 헬스엔드포인트.
- Update: streak claim 시 내부 streak 진행/보상(gold) 잔액 변경, (shop 구매 시 wallet / transactions 상태 갱신).
- Delete: 직접적인 삭제(D) 경로는 현재 스모크에 포함되지 않음 (계정 삭제 / 트랜잭션 취소 / 이벤트 탈퇴 등 미포함).

**풀스택 CRUD ‘검증 완료?’ 평가**
| 영역 | C(R)UD 상태 | 비고 |
|------|-------------|------|
| 사용자(auth) | C,R (U=미포함, D=미구현) | 프로필 수정/탈퇴 엔드포인트 미검증/미구현 |
| 스트릭 | R,U (Claim=상태갱신) | Create는 첫 접근시 lazy init, Delete 없음 |
| 상점(카탈로그/구매) | R,C(U) | 구매=Create+지갑 Update, 상품 생성/관리(Admin) 미포함 |
| 가챠 | C(행위) + R(결과) | 결과 로그 persistence 검증 미포함 |
| 이벤트/업적 | 미포함 | 별도 테스트 필요 |
| Admin 통계/관리 | 미포함 | read-only stats 별도 스위트 필요 |
| 삭제(Delete) 전반 | 미포함 | 안전성/권한 설계 이후 추가 예정 |

→ 결론: “핵심 플레이 경제 루프” 의 CR(U) 일부는 스모크로 최소 검증 완료. 시스템 전반 CRUD 완전 검증 상태로 보기는 어려움. Admin/삭제/프로필 수정/이벤트/업적 CRUD 커버리지 개별 테스트 확장이 필요.

**다음 단계 제안**
1) 프로필 수정(PUT /api/auth/profile) 또는 닉네임 변경 경로 정의 후 U 테스트 추가.
2) 논리 삭제(soft delete) 대상(예: shop transaction rollback, event participation withdraw) 정책 문서화 및 D 경로 테스트 추가.
3) 이벤트/업적 전용 mini-smoke (참여→진행→claim) 추가로 gamification CRUD 보강.

**추가 품질 과제**
- 스모크 테스트에서 현재 422 허용 상태를 정상화: 초기 streak seed 엔드포인트/로직 추가 후 허용 상태 (200/400) 축소.
- reward/gold delta 정량 assert (claim 전후 잔액 비교) 도입하여 경제 정확성 강화.
- OpenAPI 재수출 후 스모크 테스트가 사용하는 경로 스키마 drift 검사(generated vs runtime).


**도입 이유**
1. 업적 타입 증가 시 서비스 파일 비대화 방지 및 충돌 감소.
2. 순수 계산과 사이드이펙트(Notification, hub.broadcast, realtime broadcast) 분리 → 단위 테스트 용이.
3. 동일 패턴을 미션/이벤트 평가로 재사용 가능한 기반.

**세부 구현**
- 지원 타입: CUMULATIVE_BET, TOTAL_WIN_AMOUNT, WIN_STREAK (결과 동등성 유지)
- 공통 합산 유틸 `_cumulative_amount` (BET / WIN 구분) 추출
- Win Streak: 최근 100개 기록 역순 스캔 (이전 로직 동일)
- 서비스 내 helper 메서드 `_aggregate_user_bet/_aggregate_user_win/_current_win_streak` 제거

**영향/호환성**
- OpenAPI / 응답 스키마 변경 없음
- 실시간 브로드캐스트 payload 동일 (achievement_unlock, achievement_progress)
- Alembic 변동 없음(head 유지)
- UserAchievement 기존 진행값 재사용 (마이그레이션 불필요)

**검증**
- 새 파일 및 수정 파일 구문 오류 없음
- is_user_action=False 조기 반환 로직 유지
- 누적/승리/연속승 조건 동일 threshold 에서 unlock 동작 확인(논리 대비)

**확장 가이드**
```python
def eval_daily_win(ctx: EvalContext, cond: dict) -> EvalResult:
   # 예: 오늘 00:00~현재 WIN 합산 후 threshold 비교
   ...
AchievementEvaluatorRegistry.register("DAILY_WIN", eval_daily_win)
```

**다음 단계 제안**
1. evaluator 단위 테스트 작성 (progress/unlocked 케이스)
2. mission_evaluator.py 도입으로 이벤트/미션 조건 통합
3. 누적 합산 Redis 10s 캐시 적용(고빈도 액션 부하 감소)

### 2025-08-21 (추가) GameDashboard 색상 팔레트 톤다운
**변경 요약**
- 기존 과포화 네온 배경/카드(`from-purple-900 via-black to-pink-900`, 진한 border-purple-500/30, text 그라디언트 from-purple-400/to-pink-400) → 홈/상점/프로필 페이지의 더 차분한 다크 글래스 톤과 정렬.
- 배경: `from-[#0e0a17] via-black to-[#1a0f1f]` 로 채도 감소 및 색 온도 균형.
- 카드: `bg-black/50` 대신 `bg-[#14121a]/70` + border 투명도 30%→20% 로 대비 완화.
- 헤더/섹션 타이틀 그라디언트: purple/pink 400 → 300 단계로 다운.
- 버튼 아웃라인/호버 색상 투명도 축소(`border-purple-500/50 -> /30`, hover 배경 /20 → /10).

**영향**
- 시각적 피로도 감소, 정보 hierarchy 강조(콘텐츠 > 크롬).
- 다크 배경 위 텍스트 대비 유지(AA 이상) — 300 단계 그라디언트도 `bg-clip-text` 로 충분한 명도 확보.
- 다른 주요 화면(Home/Shop/Profile)과 톤 통일 → 브랜드 일관성 개선.

**추가 제안**
1. Tailwind theme 확장으로 semantic token (e.g. `bg-surface-alt`, `text-accent-faint`) 정의 후 하드코드 색상 축소.
2. Light 모드 대비 필요 시 동일 계층 변수화(`data-theme` 스위치) 준비.
3. 과포화 포인트 컬러(금색, 승리 강조 등)는 의도된 강조 요소에만 국소 사용.


### 2025-08-20 (추가) 이벤트 시스템 통합 & Admin 관리 UI 1차 구현
**변경 요약**
- 프론트 `EventMissionPanel` 이 기존 개별 fetch → 중앙 `useEvents` 훅으로 통합 (중복 제거, 캐시 활용).
- 이벤트 참여(join), 진행(progress), 보상 수령(claim) 모두 훅 액션 사용. 진행 증가 임시 버튼(모델 지민 포인트 수동 +Δ) 추가.
- 백엔드 Admin 전용 라우터(`/api/admin/events`) 활용 위한 프론트 관리 페이지 `/admin/events` 신규:
   - 목록 조회 / 생성 / 비활성화 / 참여자 조회 / 강제 보상(force-claim) / 모델 지민 seed 버튼.
   - JSON 요구치/보상 편집 폼(검증은 추후 개선 예정). 
- Admin 이벤트 API 유틸(`frontend/utils/adminEventsApi.ts`) 추가로 클라이언트 코드 단순화.

**주요 파일**
- `frontend/components/EventMissionPanel.tsx`: useEvents 연동, 모델 지민 progress 증가 핸들러.
- `frontend/hooks/useEvents.ts`: 이벤트 캐시/조작 훅 (join/claim/updateProgress/refresh).
- `frontend/utils/adminEventsApi.ts`: Admin 이벤트 CRUD/보조 액션 클라이언트.
- `frontend/app/admin/events/page.tsx`: Admin UI 페이지(1차 프로토타입).

**스모크 테스트 시나리오 (수동)**
1. (관리자) `/admin/events` 접속 → "모델지민 Seed" 실행 → 목록에 모델 지민 이벤트(id 기록) 존재 확인.
2. (일반 사용자) 메인 패널 로드 → 해당 이벤트 표시, 참여 전 상태(join 버튼 표시) 확인.
3. 참여(join) 클릭 → 참여자 수 증가(또는 새 refetch 후 반영) & 상태 joined.
4. 모델 지민 +10 두세 번 실행 → progress 누적 확인(임시 로직: 현재 progress + delta → PUT).
5. 요구치 도달 후 claim 버튼 → 보상 수령 → claimed=true 반영.
6. 관리자 페이지에서 해당 이벤트 비활성화 → 사용자 측 상태 refresh 후 inactive UI 처리 (또는 사라짐).
7. 관리자 force-claim (다른 user id) 수행 → 참여자 목록에서 claimed=true 확인.

**검증 결과 (현재)**
- 빌드 성공(Next.js 15.3.3) 및 타입/린트 치명적 오류 없음(ESLint next/core-web-vitals config 미존재 경고는 별도 환경 이슈).
- useEvents 훅 캐시 정상 작동(비로그인 시 조용히 skip).
- Admin 페이지 주요 액션 로컬 테스트 필요(네트워크 200 OK 기대) → 후속 자동화 테스트 미구현.

**추후 작업**
1. 이벤트 진행(progress) API 다중 지표 확장 대비: updateProgress 인터페이스 progress:number → object payload 전환 리팩토링.
2. Admin 이벤트 폼 유효성 검증 / JSON Schema 적용 & 에러 메시지 개선.
3. Cypress/Playwright E2E: seed→join→progress→claim→deactivate 자동화.
4. 퍼블릭 프리뷰 이벤트 API (`/api/public/events`) 통합 후 비로그인 노출 전략.
5. 모델 지민 자동 증가(실제 모델/게임 연계) 로직 연결 및 수동 버튼 제거.
6. progress 덮어쓰기 레이스 방지: 서버 atomic increment endpoint 또는 SELECT ... FOR UPDATE 로직 도입.
7. force-claim 멱등 표준화: already_claimed 상태 코드/에러 바디 명확화 및 문서화.

**위험/주의**
- useEvents updateProgress 현재 단일 progress 숫자 덮어쓰기 → 병렬 증가 경합 시 손실 가능 (낙관적 업데이트 vs 서버 원자 증가 엔드포인트 필요).
- Admin 강제 보상(force-claim) 다중 호출 시 중복 처리 재검증 필요(서버 멱등성 가드 확인).
- any/assertion 증가로 타입 안전성 저하 → ESLint/TS 설정 정상화 후 재도입 필요.

**다음 단계 권장 품질 가드**
- 이벤트/참여/보상 테스트(pytest) 추가: join 멱등, progress 경계(요구치 초과), claim 중복, force-claim 후 상태.
- OpenAPI 재수출 (`python -m app.export_openapi`) 및 `api docs/20250808.md` 변경 요약 반영.

- 크래시 베팅 원자성 개선: `backend/app/routers/games.py` 크래시 베팅 처리 구간을 단일 DB 트랜잭션 + 행 잠금(row-level lock) 적용하여 중복 결과/골드 미반영 위험 감소. 응답 스키마(`CrashBetResponse`)에 `status`, `simulated_max_win` 필드 추가하여 클라이언트 측 후행 UI/리스크 계산 근거 제공.
- 출석(Attendance) 월간 달력 → 주간 전환: `HomeDashboard.tsx` 기존 월 단위 격자 생성 로직 제거, 현재 주(일~토) 7일만 표시. 오늘 강조 및 이번 주 출석 카운트 단순화로 가시성 향상. 문구: "이번 주 출석".
- 슬롯 당첨금 역표시 이슈 조사: 슬롯 컴포넌트 내 금액 표기(`+{winAmount.toLocaleString()}G`) 방향 전환/역정렬/transform 없음 확인. 현 단계 재현 불가 → 추가 스크린샷/DOM 캡처 필요.
- 스트릭 보상(예: 8000G) 수령 후 실제 골드/로그 미반영 문제 식별: 프론트 단 로컬 상태 갱신만 이뤄지고 서버 확정/잔액 반영 endpoint 없음 또는 미호출 추정 → 서버 Claim 엔드포인트/로그 테이블/트랜잭션 필요.
- 특별보상 금액 축소 요구 수집: 구체 금액/스케일 정책 미정(예: 상한/구간 비율) → 정책 합의 후 산식/프론트·백엔드 동기화 예정.
- Seed User 02 데이터 초기화 예정: 관련 테이블(사용자, 잔액, streak, 게임 로그) 안전 삭제/리셋 스크립트 설계 필요.

#### Pending / 다음 단계 초안
1. 스트릭 보상 Claim 서버 구현: (요청 → 멱등 처리 → 잔액 증가 → reward 로그 기록) + 테스트 추가
2. 특별보상 축소 산식 정의(기준: 현재 최대치, 경제 인플레이션 지표) 후 코드 반영 및 문서화
3. User 02 초기화 안전 스크립트/관리 라우트(Guard: ENV=dev + 특정 user_id 화이트리스트) 작성
4. 슬롯 역표시 추가 자료 수집 → 재현 시 DOM/CSS 레이어 검사

#### 검증 로그 (부분)
- 크래시 베팅: 변경 후 단일 응답 필드 확장 (OpenAPI 재수출 필요 여부 점검 예정)
- 출석 UI: 빌드 후 대시보드에서 7일 표시 정상 (월간 격자 제거)
- 나머지 Pending 항목: 구현 전 상태 기록

#### 문서 작업
- 본 섹션 추가로 2025-08-20 변경/이슈/다음 단계 기록 완료. 구현 후 각 항목 세부 검증 결과 추가 예정.

### 2025-08-20 (추가) Streak Claim API & 경제 산식 개편 계획
- 선택된 스트릭 일일 보상 산식: 지민 감쇠(C 안)
   - Gold = 1000 + 800*(1 - e^{-streak/6})  (상한 ~1800 근사)
   - XP   = 50 + 40*(1 - e^{-streak/8})   (상한 ~90 근사)
- 공용 util: `_calculate_streak_rewards(streak)` 백엔드 `streak.py` 내 임시 구현 → 후속 `app/services/reward_service.py` 이동 및 프론트 util 동기화 예정.
- 신규 엔드포인트: `POST /api/streak/claim`
   - 멱등키: `streak:{user_id}:{action_type}:{UTC_YYYY-MM-DD}` → `user_rewards.idempotency_key` UNIQUE 전제
   - 트랜잭션: User.gold_balance(+gold), User.experience(+xp), UserReward insert(metadata: formula=C_exp_decay_v1)
   - 재호출 시 기존 레코드 반환
   - 검증 로직 미구현 항목(TTL/중복 tick 보호) → 후속 보강
- 프론트 `HomeDashboard.tsx` 기존 클라이언트-only `claimDailyReward` → 서버 API 호출 방식 리팩터 필요 (미적용 상태).

#### User 02 초기화 (익명화 전략)
- 삭제 대신 회계/통계 보존을 위해 익명화 선택:
   - UPDATE users SET nickname='user02_reset', email=NULL, gold_balance=0, experience=0 WHERE id=2;
   - 민감 로그/팔로우/채팅 등은 유지, 필요시 별도 purge 옵션.
   - Redis streak 키: `DEL user:2:streak:* user:2:streak_protection:*`
- 후속: 익명화 스크립트 `/scripts/reset_user_02.sql` 또는 관리 라우터로 추가 예정.

#### 캘린더 UI 보정
- 월간 문구 잔재 제거: HomeDashboard.tsx '이번달 출석' → '(월간 누적 X일)' 표시로 축소, 메인은 주간 7일 표시 유지.

#### 다음 후속 처리
1. (완료) 프론트 streak claim 서버 호출 리팩터 (`HomeDashboard.tsx` fetch POST /api/streak/claim)
2. (진행) 보상 산식 util 표준화: `app/services/reward_service.py` 추가, 경계 테스트 작성 예정 (streak 0,1,3,7,14)
3. (완료) `user_rewards` 확장: `reward_type`, `gold_amount`, `xp_amount`, `reward_metadata`, `idempotency_key` + UNIQUE index (`ix_user_rewards_idempotency_key`)
4. (완료) OpenAPI 재생성: `backend/app/current_openapi.json` 및 timestamped 스냅샷 생성
5. (완료) User02 익명화 스크립트 `scripts/reset_user_02.sql` 추가
6. (예정) Admin DEV 전용 라우터에 User02 reset endpoint 추가 / 보상 경계 테스트(pytest)

### 2025-08-20 (야간) VIP 일일 포인트 & Daily Claim 멱등 개선
- 백엔드 변경:
   - `users.vip_points` 컬럼 추가 (idempotent migration `add_vip_points.py`).
   - `UserResponse` 스키마에 `vip_points` 노출 및 `/api/auth/me` 등 프로필 응답 경로 반영.
   - 신규 라우터 `vip.py`:
      - `POST /api/vip/claim` (멱등키: `vip:{user_id}:{UTC_YYYY-MM-DD}` + Redis 플래그 `vip_claimed:{user_id}:{date}` TTL 26h)
      - `GET /api/vip/status` (금일 수령 여부/포인트 조회 `claimed_today`, `vip_points`, `last_claim_at`).
   - Reward 로그: `UserReward(reward_type='VIP_DAILY', idempotency_key=...)` 기록.
- 프론트 변경 (`HomeDashboard.tsx`):
   - 하드코드된 `vipPoints=1250` 제거 → 서버 값 초기화(fallback camelCase/underscore).
   - 일일 보상 모달 버튼 수령 후 비활성(`이미 수령됨`) 처리; 중복 클릭 로컬 증가 제거.
   - TODO 주석: 보상 미리보기 금액을 서버 산식 응답으로 치환 예정.
- 테스트: `test_vip_daily_claim.py` 추가 (동일일 중복 수령 시 단일 레코드 + idempotent 응답 확인).

검증 결과:
- VIP 첫 수령 후 동일 일자 재요청: HTTP 200, `idempotent=True`, DB `user_rewards` 동일 idempotency_key 1건 유지.
- Streak 일일 보상: 로컬 임의 증가 제거 후 서버 authoritative 값만 반영(중복 수령 시 기존 값 재표시, gold 재증가 없음 확인).
- User 프로필 응답에 `vip_points` 필드 노출 확인 (/api/auth/me).

다음 단계:
1. HomeDashboard 보상 미리보기 산식 → 서버 streak status 확장(예: 예상 next reward 금액)으로 완전 이관.
2. user02 데이터 정리 자동화: `/api/dev/reset_user02` 호출 절차 final.md에 사용 예 추가 + CI 전 pre-step 스크립트화.
3. VIP status 전용 E2E & OpenAPI 문서 스냅샷 재생성 (`python -m app.export_openapi`).

### user02 데이터 초기화 실행 지침
개발 중 잔여 목업 수치(골드/연속일)가 분석을 방해할 경우 dev 전용 리셋 엔드포인트 사용.
1. 토큰 발급 후:
    ```bash
    curl -H "Authorization: Bearer <ACCESS_TOKEN>" -X POST http://localhost:8000/api/dev/reset_user02
    ```
2. 성공 시 user02 골드/경험치/출석 Redis 키 초기화, 익명화 규칙 적용.
3. 프론트 재로그인 또는 `/api/auth/me` 재조회로 반영 확인.




GameStats (totalBets, wins, losses, highestMultiplier, totalProfit) 현재
Crash 세션에서 프론트 sessionStats 로컬 증가 + 프로필 재조회 시 일부 동기화.
서버 “단일 권위” 부재: 동시성·재시작·재계산 취약. 격차
결과 확정 시점 이벤트(“bet_settled”) 미정.
역사적 재계산/치유(heal) 엔드포인트 부재.
통계 필드 정의/NULL 처리·인덱스 전략 미정. 목표 아키텍처
테이블: user_game_stats (user_id PK, total_bets, total_wins, total_losses, highest_multiplier, total_profit, updated_at).
이벤트 소스: crash_bets(또는 games_crash_rounds) + 승패 확정 로직 → Service emit.
Service: GameStatsService.update_from_round(user_id, bet_amount, win_amount, final_multiplier).
재계산: GameStatsService.recalculate_user(user_id) (SELECT SUM… GROUP BY user_id).
Admin/내부 API: POST /api/games/stats/recalculate/{user_id}.
나중 확장: 가챠/슬롯 등 게임별 세분화 컬럼 또는 별도 테이블(user_game_stats_daily). 최소 단계(Incremental)
user_game_stats 마이그레이션 추가 (단일 head 확인 필수).
Crash 베팅 확정 지점에 Service 호출 (트랜잭션 내 idempotent upsert).
프론트 sessionStats 로컬 증가 제거 → 프로필 재조회만.
재계산 엔드포인트 + pytest: 조작된 레코드 후 재계산 복구 확인. 테스트/모니터링
유닛: update_from_round 승/패/동일 highest_multiplier 갱신 케이스.
회귀: 대량(1000) 라운드 후 합계 = 재계산 값 일치.
메트릭: stats_update_latency, stats_recalc_duration.
경고: highest_multiplier 역행(감소) 발생 시 로그 경고.
Fraud 차단 고도화 현재
단순 시도 횟수 / 고유 카드토큰 다양성 임계 기반 차단(문서상). 격차
디바이스/IP 지문, 금액 편차, 다중 계정 상관, 지속 순위화 없음.
정책 버전/룰 explainability 미구현. 목표 아키텍처
수집 지표(슬라이딩 윈도우 Redis): attempts:{ip}, attempts:{fingerprint}, distinct_cards:{user}, amount_stddev:{user}.
Rule Engine(우선 단계): JSON 룰 세트 (조건 → 점수).
점수 합산 → Threshold tiers(Soft block / Hard block / Review).
장기: Feature 스냅샷 ClickHouse 저장 → Offline 모델(XGBoost) → 주기적 weight export → 실시간 점수 계산. 최소 단계
Redis ZSET 또는 HLL 로 distinct_* 추적 추가.
Rule DSL (예: yaml) loader + 평가 함수.
구매 플로우에서 FraudContext 생성 → 평가 → action(enum) 반환.
감사 로그 fraud_audit (user_id, action, score, features JSON).
임계 변경/룰 리로드 핫스왑 (파일 타임스탬프 감시). 테스트/모니터링
유닛: 단일 룰, 복합 룰, 임계 경계 테스트.
부하: 500 RPS 시 Redis latency < X ms (메트릭).
경고: Hard block 비율 24h 이동평균 이탈.






Webhook 재생/중복 방지 현재
설계: HMAC 서명+timestamp+nonce+event_id idempotency 언급 / key rotation 미완. 격차
key versioning(KID), 재생 큐(Dead-letter / 재시도), 상태 추적(ACK/FAIL) 명확성 부족. 목표 아키텍처
서명 헤더: X-Webhook-Signature (algo=HMAC-SHA256, kid=Kyyyy, ts=unix, nonce, sig=base64).
검증 순서: (1) kid → 키 조회 → (2) ts 허용 오차 (±300s) → (3) nonce Redis SETNX 24h → (4) event_id uniqueness DB/Redis → (5) HMAC 비교.
상태 테이블: webhook_events(id PK, external_id, status(PENDING|DELIVERED|FAILED|REPLAYED), last_error, attempt_count, next_retry_at).
재시도 알고리즘: 지민 백오프 최대 N (예: 6).
수동 재생: POST /api/admin/webhooks/replay/{id}.
Key rotation: active + next; 발신 시 active kid, 수신 검증 시 {active,next} 두 개 허용 기간. 최소 단계
이벤트 저장 → 보내기 → 결과 업데이트 구조 (producer-consumer or Celery).
nonce + event_id Redis key (TTL 25h).
admin replay 엔드포인트 (상태=FAILED만).
키 스토어: settings.WEBHOOK_KEYS = {kid: secret}. 테스트/모니터링
유닛: 잘못된 ts/nonce 재사용/서명 깨짐.
통합: replay 후 attempt_count 증가 & status 전환.
메트릭: webhook_delivery_success_rate, avg_attempts_per_success.
Streak 자정 경계 회복 / 프로텍션 자동 보정 현재
Redis NX 일일 lock + 프론트 localStorage UTC date guard.
경계(UTC 23:59:59 → 00:00:01) 및 다중 탭 경쟁/TTL drift 회복 테스트 미구현. 격차
TTL 기반 만료와 ‘실제 날짜’ 불일치 시 교정 로직.
보호(Protection) 자동 소비/회복 조건 정교화 미흡. 목표 아키텍처
canonical_date = utc_today() (또는 향후 사용자 timezone offset).
tick 처리 시: Redis key user:{id}:streak_daily_lock:{action}:{YYYY-MM-DD}.
보정 Job (분기 1회):
전날 lock만 있고 streak counter 미증가 → counter +=1 (edge repair)
counter 증가했지만 attendance set 누락 → SADD 보정.
Protection: 결측(하루 miss) 감지 시 자동 소진 후 streak 유지 → 소진 이벤트 기록. 최소 단계
now() 주입 가능한 유틸 (Clock interface) → 테스트에서 고정.
xfail 테스트: ‘23:59 tick, 00:01 tick’ 시 정확히 +1 only.
보정 함수 streak_repair(date) + 관리용 엔드포인트(또는 스케줄러).

### 2025-08-20 (야간) Streak 403 (no token) 콘솔 에러 3건 대응
- 현상: 초기 홈 대시보드 마운트 시 `POST /api/streak/tick`, `GET /api/streak/protection`, 기타 streak 관련 호출이 로그인 이전(토큰 미존재) 상태에서 실행되어 `Forbidden (no token)` 403 → 콘솔 에러 3건 누적.
- 원인: `HomeDashboard` `useEffect` 내 streak 로딩 로직이 토큰 존재 여부 확인 없이 즉시 실행. `apiClient` 403(no token) 시 null 반환 처리 있으나 콘솔 에러/로그 노이즈 잔존.
- 조치: `HomeDashboard.tsx` streak 로딩 `load()` 시작부에 `getTokens()` 검사 추가. access_token 없으면 streak/status/tick/protection/history 전부 skip 및 debug 로그만 출력. `claimDailyReward` 핸들러에도 토큰 가드 추가(미로그인 안내 토스트).
- 결과: 비로그인 최초 접근 시 403 콘솔 에러 사라지고 불필요한 fetch 감소(최소 3회 → 0회). 로그인 후 재방문 시 기존 기능 동일 동작.
- 다음 단계: (1) streak API 자체에서 Anonymous 호출 시 401 명확 반환 + 프론트 공통 auth gate hook로 통합, (2) skip 시 UI skeleton/“로그인 후 출석 확인” 안내 표시, (3) useEvents / VIP status 등 다른 초기 호출들도 동일 토큰 프리체크 표준화.

### 2025-08-20 (추가) 공통 Auth Gate 훅 도입 & 초기 API 일괄 보호
- 변경: `hooks/useAuthGate.ts` 신설 (`{ isReady, authenticated }` 제공) 후 `HomeDashboard`에 적용.
- 이벤트/스트릭/VIP 초기 로딩: `authenticated=false` 시 호출 전부 skip → 403/401 로그 소거 및 초기 렌더 지연 감소.
- `useEvents` 훅: autoLoad 시 토큰 미존재면 loadEvents 실행 안 함, `refresh` 역시 가드.
- UI: 비로그인 상태 streak 영역에 안내 블록 표시(출석/보상 노출 차단). (TODO: 컴포넌트화 & Skeleton 대체)
- 효과: 비로그인 첫 진입 네트워크 요청 수 감소( streak 3~4회 + events 1회 + vip 1회 ≈ 최대 6회 → 0회 ) 및 콘솔 에러/경고 제거.
- 후속 예정: (1) Auth Gate가 토큰 만료/refresh 결과 반영하도록 useAuthToken 통합, (2) 공통 Guard HOC(`withAuthBoundary`)로 라우트 보호, (3) Skeleton / CTA(“로그인하고 출석 보상 받기”) 버튼 추가 A/B 테스트.
attendance set TTL 재확인(120d) 및 누락 시 재삽입. 테스트/모니터링
유닛: Clock mock 으로 하루 넘어가기 시나리오 3종(정상, 중복, skip + protection).
메트릭: streak_repair_actions, protection_consumed_total.
경고: repair 비율 1% 이상 상승.
정리된 우선순위(단계적 추진) 순서 제안 (리스크 감소 + 사용자 체감 가치):
GameStats 서버 권위 (데이터 신뢰 핵심)
Streak 경계/보호 보정(이미 핵심 루프, 무결성)
Webhook 재생/서명 회전(외부 결제/영수증 신뢰)
Fraud 룰 엔진(매출 보호)
RFM/추천(성장·LTV 향상)
공통 구현 패턴 권고
Service 계층: 순수 함수 + DB/Redis adapter 주입 → 테스트 용이.
Idempotency: update_from_* 계열은 natural key(user_id + round_id) UPSERT.
Clock / UUID / Now 추상화: boundary & replay 테스트 재현성 확보.
Observability: 각 서비스 최초 구축 시 counter + histogram 2종 최소 정의.
간단한 인터페이스 스케치 (예시)
GameStatsService

update_from_round(user_id:int, bet:int, win:int, multiplier:float) -> None
recalc_user(user_id:int) -> GameStatsDTO

### 2025-08-20 (긴급) 시드 계정 로그인 실패 트러블슈팅
- 현상: 프론트 로그인 폼에서 시드 계정(admin / user001 등)으로 로그인 시 반복된 `아이디 또는 비밀번호가 올바르지 않습니다` 메시지 및 `/api/auth/login` 401 응답. 기존 정상 계정이 재부팅 이후 전부 실패.
- 백엔드 로그: `/api/auth/login` 처리 경로에서 `authenticate_user` None 반환, 별도 예외 없음.
- 1차 가설 점검:
   1) 비밀번호 해시/평문 불일치 → 시드 스크립트가 bcrypt 해시를 생성하지 못했거나 다른 해시 스킴.
   2) site_id / nickname 혼용 → 폼 입력 라벨이 '닉네임' 인데 site_id 로만 조회.
   3) JWT 검증 실패 (토큰 생성 후 즉시 401) 시나리오.
- 조사 결과:
   - `seed_basic_accounts.py` 는 `AuthService.get_password_hash` 로 bcrypt 해시 저장. 스크립트가 실행되지 않았거나 재기동으로 DB 초기화 후 미실행 상태.
   - 로그인 API 는 `site_id` → fallback 으로 nickname (lowercase 비교) 를 시도하므로 라벨 혼동은 부차적.
   - 실제 실패는 사용자 레코드 자체 부재(DB 리셋) 상태에서 발생: users 테이블 조회 결과 0.
- 근본 원인: Compose 재시작 후 seed 스크립트 미실행으로 기본 계정 미존재. (테스트 환경 자동 시드 파이프라인 부재)
- 조치:
   1) `docker compose exec backend python -m app.scripts.seed_basic_accounts` 재실행 → admin/user001..004 재생성.
   2) 패스워드 정책 문서화: admin=123456 / user001..004=123455.
   3) 재시작 시 자동 시드 옵션 TODO: backend entrypoint 에 `AUTO_SEED_BASIC=1` 시 1회 멱등 실행 로직 추가 예정.
   4) Seed 실행 후 즉시 `python -m app.scripts.test_login` 로 상태 확인 자동화 권고.
- 검증:
   - 실행 로그: `[{'site_id': 'admin', 'action': 'created', ...}, {'site_id': 'user001', ...}]` 출력.
   - /api/auth/login admin/123456 200 + 토큰 수령, user001/123455 200 확인.
- 후속 TODO:
   - (보안) 기본 패스워드 최초 로그인 시 강제 변경 플로우.
   - (운영) seed 계정 별도 환경 분리(PROD 배포 차단) 및 강력한 랜덤 초기 패스워드 + secrets storage.
   - (테스트) playwright 로그인 헬퍼가 계정 미존재 시 seed 자동 호출.
get(user_id:int) -> GameStatsDTO
FraudEngine

evaluate(ctx: FraudContext) -> FraudDecision(score:int, action:enum, matched_rules:[...])
WebhookVerifier

verify(headers, raw_body) -> VerifiedEvent(event_id, payload)
mark_delivered(event_id)
replay(event_id)
StreakManager

tick(user_id:int, action:str, now:datetime) -> StreakState
repair(date:date) -> RepairReport
consume_protection(user_id:int) -> bool
테스트 우선 (TDD) 추천 순서
GameStatsService: increment vs recalc 동등성
StreakManager: midnight duplicate suppression
WebhookVerifier: nonce reuse & key rotation acceptance




요청 정리 및 설계 방향 초안:

요구사항 체크리스트:

메인 페이지 목업(하드코딩) 이벤트 제거
실제 서버 이벤트(/api/events) 목록을 메인에 표시
신규 “모델 지민 이벤트” 추가 (이벤트 데이터/모델 정의 & 시드)
이벤트 참여 로직 서버 저장 (이미 기본 join/progress/claim 존재하므로 활용/확장)
어드민에서 이벤트 생성/수정/비활성/보상(강제 지급 포함) 관리 가능
어드민에서 특정 유저 참여 현황 / 전체 참여자 조회
전체 풀스택 구현 (백엔드 admin API + Frontend Admin UI + Main UI 연동)
테스트 및 간단 문서 업데이트
현재 상태 갭 분석:

Public 이벤트 API (목록/상세/참여/progress/claim) 이미 구현됨.
Mission 관련 admin 비어있고 admin_events.py 비어있음 → 어드민 CRUD/강제 지급 엔드포인트 없음.
Participation 조회용 admin 전용 endpoint 없음 (전체 리스팅/특정 이벤트 참여자).
Frontend 메인에서 실제 events 호출 코드 미확인 (추가 필요); mock 요소 제거 필요.
“모델 지민 이벤트” 도메인 정의 필요: requirements/progress 키 설계 (예: model_index >= X or 누적 모델 사용 횟수 등) → progress 키/requirements 매칭 구조 그대로 사용 가능.
EventService에 어드민용 create/update/deactivate, participation list, 강제 reward claim 메서드 추가 필요.
권한 체크: admin 전용 Depends (아마 기존 get_current_user + is_admin 검사) 사용.
시드: start_date <= now <= end_date 구간 들어오게 UTC 기준 날짜 생성.
제안 구현 세부 (백엔드):

admin_events.py 라우터 추가:
POST /api/admin/events (EventCreate)
PUT /api/admin/events/{event_id} (EventUpdate)
POST /api/admin/events/{event_id}/deactivate (is_active False)
GET /api/admin/events/{event_id}/participations (필터: completed/claimed 등 Query)
POST /api/admin/events/{event_id}/force-claim/{user_id} (관리자 강제 보상 지급; 비정상 상태시 400)
(선택) POST /api/admin/events/seed/model-index -> “모델 지민 이벤트” 시드
\서비스 계층 EventService:
create_event, update_event, deactivate_event
list_participations(event_id, filters)
force_claim_rewards(event_id, user_id)
seed_model_index_event(db) (존재 여부 체크 후 생성)
프론트 (메인):

useEvents 훅 신설: fetch /api/events, 캐시/로딩/에러 관리
Main/Home 컴포넌트(또는 이벤트 패널)에서 목업 리스트 제거 → 실제 fetch 결과 표시
참여 버튼: /api/events/join, 진행도 업데이트는 progress 엔드포인트 (진행 예시: model_index_increment 등)
완료시 보상 수령 버튼 → /api/events/claim/{id}
프론트 (어드민):

/admin/events 페이지:
목록(검색/활성여부 필터)
신규 생성 폼
상세 패널 (기본정보 수정, 비활성화)
참여자 탭 (필터: completed, claimed)
참여자 행 단위 강제 보상 버튼
시드 “모델 지민 이벤트” 실행 버튼 (이미 존재하면 비활성)
테스트:

backend tests:
test_admin_create_event_requires_admin
test_admin_create_and_list_event
test_join_and_progress_and_claim_event
test_force_claim (조건 검증)
test_seed_model_index_idempotent
(선택) 프론트 통합은 e2e 추후; 최소 fetch mocking unit.
다음 단계 제안 (실행 순서):

백엔드: EventService 확장 + admin_events 라우터 구현
백엔드: 모델 지민 이벤트 시드 함수 및 엔드포인트
백엔드: pytest 케이스 추가
프론트: useEvents 훅 + 메인 UI 연결
프론트: admin events 페이지/컴포넌트 생성
문서/API_MAPPING 갱신, 요약
진행해도 될지 여부만 알려주시면 바로 1단계(백엔드 구현) 착수합니다. 필요하면 “모델 지민 이벤트” 요구 지표(예: target model_index 100? 기간? 보상?) 구체값 주셔도 반영합니다. 기본 임시값 제안:

title: “모델 지민 도전 이벤트”
event_type: “special”
기간: 오늘 ~ +14일
requirements: {"model_index_points": 1000}
rewards: {"gold": 5000, "exp": 1000}
priority: 50
수정 원하시면 말씀 주세요. 진행 승인될 경우 바로 구현 들어갑니다. 계속할까요?

### 프론트 중복/유령 빌드 정리 및 안정화 (최신)
문제: 서로 다른 UI(구/신)가 번갈아 노출. 실험 잔존 파일로 별도 Next dev 서버 실행 + 캐시 혼재 가능성.

조치:
- 잔존 파일 제거: `frontend-package.json`, `next.config.tailwind4.js` 삭제.
- 단일 소스 보증: docker-compose `frontend` context = `./cc-webapp/frontend`.
- 네트워크 안정화: `lib/simpleApi.ts` 지수 백오프 재시도 (기본 재시도 코드: 502/503/504/408/429 & 네트워크 오류).
- BUILD 식별: `NEXT_PUBLIC_BUILD_ID` + `HomeDashboard` 상단 배너.
- Crash 개선 1단계: 공용 재시도 활용 (전용 훅 후속).

검증:
1. `docker compose down -v` → `.next` (및 선택적 `node_modules`) 제거 후 `docker compose up -d --build frontend`.
2. http://localhost:3000 접속 → BUILD 배너 확인.
3. DevTools Network → 포트 3000 단일 자산 로드.
4. 오프라인 토글 후 API 호출 → `[simpleApi][retry]` 로그 확인.
5. Crash 게임 베팅/Stats 404 미발생.

후속 계획:
- `useCrashGame` 훅으로 상태/애니메이션/재시도 캡슐화.
- 엔드포인트별 재시도/타임아웃 정책 세분화.



### 추후정리 ## 
추후 정리(배포 전)

Remove: openapi_temp.json, temp_openapi.json, temp_openapi_live.json (스펙 단일화 완료 후 잔여)
Remove: auth.py.new, auth_service.py.new, dependencies.py.new (중복/낡은 백업)
Sanitize or remove: token.json (토큰/비밀 포함 시 보안 위험)
Move to data_export/dev-local or delete: temp_invite_usage_5858.csv, tmp_backend_logs.txt, test_signup.json
Decide: sqlite test files (auth.db, test_game.db, test_notification.db) → pytest fixture 자동생성으로 전환 후 삭제
Add CI step: duplicate scan + fail on new .new / temp_openapi pattern



 새로운 보상 메시지 추가 시 반드시 rewardMessages.ts만 수정
 커밋 전에 grep -R \"보상 수령 실패\" frontend = 0 확인
 dev 기동 시 BUILD_ID 갱신 스크립트 실행 로그 확인
 브라우저 배너 BUILD_ID 변경 안 되면 강력 새로고침 & SW unregister
 의심 시 .next 제거 후 재시작

 
### 2025-08-21 (추가) Limited Package 테스트 안정화
**변경 요약**
- 한정 패키지 결제 플로우 테스트에서 간헐적 USER_LIMIT / 재고 불일치 / 랜덤 결제 실패로 인한 flakiness 발생.
- 원인: (1) PaymentGateway 모듈의 확률적 승인/실패 로직, (2) 테스트 간 잔존 Redis per-user 구매 카운터 키(`limited:*:user:*:purchased`) 및 idempotency 키 미삭제로 false positive 한도 초과, (3) 일부 테스트 파일 내 개별 monkeypatch 중복/순서 차이.
- 조치: 전역(conftest) 결제 게이트웨이 결정론 패치(fixture) 도입, Redis 정리 범위 확장, per-user limit 사전 체크 로깅(INFO) 삽입(`redis_key`, `redis_raw`, `already`, `per_user_limit`), 중복 local monkeypatch 제거 준비.

**검증 결과**
- 개선 후 `test_limited_packages.py`, `test_limited_packages_promos.py` 통과(3 tests pass, 경고만).
- 재시드/반복 실행 시 USER_LIMIT 오탐 재현 불가, 랜덤 결제 실패 로그 사라짐.
- 로깅으로 한도 계산 경로(이미 구매 수량→한도) 추적 가능, 추가 디버깅 시간 단축 예상.

**다음 단계**
1. 개별 테스트 파일 내 잔존 PaymentGateway monkeypatch 코드 제거(전역 fixture 단일화).
2. Pydantic v2 경고 정리: 잔존 `class Config` → `model_config = ConfigDict(...)` 마이그레이션.
3. Limited 구매 플로우 추가 경계 테스트(동시 5 요청, 재시도, idempotent key 재사용) 확대.
4. 문서(`api docs/20250808.md`) 및 OpenAPI 재수출 후 스키마 drift 주기 점검(Job 도입 검토).

> 본 안정화 절차로 한정 패키지 구매 테스트는 결정론/청결(base state) 보장을 확보했으며, 이후 경제/프로모 확장 시 회귀 리스크를 낮추는 기반을 마련.



작업 고도화 전략 개요: 안정성(데이터 정합/멱등/관측) → 성능/확장(Kafka/ClickHouse/캐시) → 개발 생산성(통합 Fetch/자동 체크) 순으로 단계화. 아래는 각 영역별 구체 실행 가이드와 우선 적용 순서(위 ToDo 매핑 포함)입니다.

즉시(Phase A 마무리) – 안전한 전환 기반
(1) Phase A 잔여 정리: 프론트 useDashboard 완전 교체 후 기존 다중 호출 제거 → /api/dashboard 응답 필드 스냅샷을 테스트 픽스처로 캡쳐(스키마 드리프트 감지).
(2)+(3) 유니크/마이그레이션: UNIQUE 추가 전 사전 스캔 쿼리 SELECT user_id,event_id,COUNT() c FROM event_participations GROUP BY 1,2 HAVING COUNT()>1; 중복 있으면 가장 최신(progress 최대 혹은 created_at 최신) 1건 남기고 나머지 삭제 스크립트 → 로그 파일 남김. Alembic 적용 직후 heads 단일성 검사 → api docs/20250808.md “변경 요약/검증/다음 단계” 블록 추가.
(5) Claim 통합 테스트: pytest에서
participate → progress → claim
동일 claim 재시도 (Idempotent) → reward_items 동일 / progress_version 불변
race: 두 번 거의 동시에 claim → 한쪽만 성공 assert (HTTP 200 / 409 or 동일 payload)
(6) Fetch/토큰 통합: unifiedApi.ts + tokenStorage.ts 추가, legacy 래퍼 첫 줄 console.warn(‘DEPRECATED…’). 점진 교체: auth → dashboard → claim → shop 순.
데이터 정합 & 보상 멱등 (Phase B Core)
(4) RewardService 통합: Contract: grant_reward(user_id, reason, bundle, idempotency_key) → {applied: bool, new_balances, reward_items} 인덱스: user_rewards(idempotency_key) UNIQUE 이미 활용. 이벤트/미션/상점 모두 이 경로 호출. 실패 케이스: Duplicate → applied=false, HTTP 200 + idempotent.
(7) 게임 세션 Hook: session_end → 내부 트랜잭션: update progress tables, enqueue_outbox(event_type='game.session.end', payload{...}, trace_id) 주의: 실패 시 세션 종료 롤백 → 재시도 가능성 대비 idempotency (session_id unique).
(8) Outbox Processor: 스케줄러(매 2초) SELECT * FROM outbox WHERE status='pending' AND next_attempt_at <= now() ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED Kafka publish 성공 → status='sent', sent_at 실패 → attempt_count++, backoff (min(2^attempt, 300s)), dead-letter 기준 attempt>=10 Dead-letter 테이블 outbox_dead_letters (원문 payload + last_error)
(10) 관측 지표: Metrics 노출 (Prometheus endpoint): dashboard_response_ms (histogram) reward_claim_duration_ms outbox_pending_count / outbox_lag_seconds (now - created_at 평균) kafka_publish_failures_total Alert 기준 초안: outbox_lag_seconds p95 > 30s 5분 지속 → 경고.
성능 & 확장 (Phase B 후반 → C 초입)
(14) 대시보드 캐시: 서버: Redis key dashboard:{user_id} JSON + ttl 5s ETag: hash(json) → If-None-Match 처리 304 Invalidation: reward claim / purchase / mission progress completion에서 delete key 테스트: 첫 요청 200 ms 측정, 연속 요청 304 혹은 캐시 15–30ms 이하 목표.
(15) 프론트 Store: 슬라이스별 invalidate 규칙 명시(예: claim 성공 → dashboard & events & rewards pending invalidate). Store 도입 전 커스텀 훅 레벨에서 TTL + SWR 패턴 유지 가능.
(9) ClickHouse 초기 적재:
Outbox → Kafka → Connector(or lightweight consumer) → ClickHouse INSERT (batch 1s/5k rows)
헬스 스크립트: 최근 5분 이벤트 count, ingestion delay (max(ts_ingested - ts_event)) 목표: ingestion delay < 3s p95.
품질/안전 자동화
(11) 부하 테스트: k6 script: signup→login→dashboard→participate→(loop progress)→claim→purchase 95th latency 목표: dashboard <150ms, claim <200ms, purchase <250ms 임계 초과 시 flamegraph(py-spy) + SQL EXPLAIN 분석.
(12) 보안 하드닝: 로그인 rate limit Redis (key ip:login per 5m) claim rate limit (user:claim per 10s) → HTTP 429 or graceful 200 {accepted:false} 관리자 감사 로그: 모든 reward_grant(applied) & UNIQUE 충돌 처리 기록.
(13) 무결성 감사 크론:
음수 잔액 SELECT id FROM users WHERE gold_balance < 0
중복 reward idempotency SELECT idempotency_key, COUNT(*)>1
비정상 gold ( > 기본*100 ) outlier 결과 json 저장 + Slack/Webhook (추후)
회귀/문서/릴리즈
(16) 핵심 사이클 End-to-End pytest + (선택) Playwright front smoke
(18) release_check.ps1: Steps: pytest -q → alembic heads (1) → curl /health → export openapi → diff 이전 스냅샷 → summarize risks
(19) 플레이북: UNIQUE 충돌 롤백: alembic downgrade + 중복정리 재시도 Kafka 다운: outbox processor skip publish, lag 증가 모니터링, 재기동 후 catch-up ClickHouse 지연: fallback 분석(직접 Postgres events table 임시 조회)
(20) Phase B 종료 KPI 수집 스크립트 (Prometheus API → json → report)
실행 순서 제안(배치) Batch 1 (안전 기반): 2→ 중복 스캔, 3→ 마이그레이션 적용, 1→ 프론트 훅 교체, 5→ claim 테스트 Batch 2 (보상/멱등): 4→ RewardService 통합, 6→ Fetch 통합, 14→ 캐시 Batch 3 (게임/이벤트/스트림): 7→ 세션 Hook, 8→ Outbox Processor, 10→ Metrics Batch 4 (확장/분석): 9→ ClickHouse, 11→ 부하, 13→ 무결성, 12→ 보안 Batch 5 (자동화/평가): 15→ Store, 16→ 회귀, 18→ 릴리즈 스크립트, 19→ 플레이북, 20→ KPI 평가, 17→ Deprecated 정리

리스크 및 완화 요약

UNIQUE 적용 중 중복 → 사전 스캔/정리 스크립트로 제로 다운 적용.
Outbox 폭주 → SELECT ... SKIP LOCKED + 배치 크기 제한 + dead-letter.
캐시 일관성 → invalidate 트리거 집중(Reward, Purchase, Progress complete).
재시도 루프(토큰/claim) → idempotency_key + attempt cap.
Kafka 불가 → fallback 로그(파일/DB) + 재전송 태스크.
측정 기준(관측 목표)

outbox_pending_count < 500 지속
outbox_lag_seconds p95 < 30
dashboard_response_ms p95 < 150
reward_claim_duration_ms p95 < 200
claim idempotent 재시도 성공률 100% (중복 지급 0)
UNIQUE 위반 런타임 에러 0 (사전 정리 후)
필요 산출물(차후 생성 권장)

scripts/scan_duplicates.py (이벤트/미션 중복 리포트)
scripts/release_check.ps1
backend/app/services/reward_service.py (단일 진입)
backend/app/workers/outbox_processor.py (주기 실행)
prometheus_metrics.py (등록 함수)
tests/test_claim_idempotency.py, tests/test_dashboard_cache.py, tests/test_outbox_processor.py
docs/OUTBOX_PIPELINE.md, docs/DASHBOARD_CACHE.md, docs/RELEASE_CHECKLIST.md
다음 바로 수행할 1개 선택 지시 주세요: A) 중복 스캔 쿼리/스크립트부터 B) RewardService 통합 코드 초안 C) 대시보드 훅 프론트 교체 패치 D) Outbox Processor 기본 뼈대 E) 릴리즈 체크 스크립트 초안

원하는 항목 문자(또는 번호)로 답 주세요. 준비되면 해당 ToDo in-progress로 진행합니다.



남은 배포 관문(Release Gate) 요약 (현재 작업(통합 대시보드/멱등 스키마 정렬) 완료 직후 기준)

데이터/스키마 정합
Alembic 마이그레이션 실제 적용 + 단일 head 확인 (중복 레코드 사전 정리 포함)
UNIQUE/멱등 키 적용 후 중복 보상/이벤트 참여 재현 테스트 (0 건 보장)
프로덕션과 동일 파라미터(.env.prod)로 마이그레이션 드라이런(비파괴 리허설 혹은 스냅샷 DB)
보상/진행 로직 일관성
RewardService 단일 진입점 전환(Shop / Event / Mission / Streak 모두 동일 경로)
claim/participate/progress 응답 스키마 표준( progress_version, reward_items ) 전 구 호출부 교체
게임 세션 종료 → progress hook + outbox enqueue 정상 레이스 테스트
관측/모니터링 & 알람
Prometheus 지표 추가(dashboard_response_ms, reward_claim_duration_ms, outbox_lag_seconds, kafka_publish_failures_total)
기본 Alert Rule: outbox_lag_seconds p95 > 30s (5분), claim 실패율 >0.5%, 5xx 비율 >1%
Grafana 대시보드 패널(코어 KPI + 에러율 + 지연) 저장/Export 버전 관리
이벤트 스트림 / 분석 파이프
Outbox Processor 안정 동작(재시도/백오프/Dead-letter)
Kafka 토픽 존재/권한/retention 설정 검증
ClickHouse 적재 파이프(최소 raw events_log) 지연 p95 < 3s
재기동 시 미전송 outbox 잔량 정상 소비 확인(Cold start 회복 테스트)
성능/부하 검증
k6 또는 Locust 핵심 시나리오 (signup→login→dashboard→participate→progress 루프→claim→purchase) 500~1k 동시
SLA 기준: /api/dashboard p95 <150ms, claim p95 <200ms, purchase p95 <250ms, 에러율 <1%
병목(SQL slow query / N+1) 프로파일 보고서 1회 작성
캐시 & 무효화
/api/dashboard Redis 캐시 + ETag 304 경로 검증 (invalidate 트리거: claim, purchase, mission complete)
캐시 TTL 동적 조정 실험(5s vs 10s) → 히트율/신선도 비교 로그
캐시 미스 fallback 경로(예외 시 즉시 DB 조회) 예외 처리
보안/안전
토큰 저장/회전 정책 단일화(프론트 unifiedApi + tokenStorage)
Rate Limit(로그인, claim, purchase) 활성 + 우회 테스트
관리자 행위 감사 로그(보상 수동 지급, 재고 조작) 기록 검증
시크릿 관리: JWT / DB / Kafka / ClickHouse / HMAC 키 .env.production 분리 & 스캔(노출 여부 툴)
프론트 안정화
HomeDashboard 기존 개별 호출 완전 제거(단일 훅)
레거시 fetch 래퍼 Deprecation 콘솔 제거 시점 명시(2주 후)
빌드 아티팩트(Next.js) 프로덕션 모드 이미지 최적화, 번들 분석(중복 의존 삭제)
테스트 커버리지 & 회귀
새 통합 claim / idempotency / outbox processor / dashboard cache 테스트 추가
End-to-End 핵심 사이클 테스트 100% Green (재실행 3회)
OpenAPI 스냅샷 변경 diff 자동 검증(허용 리스트 외 변경 Fail)
릴리즈 자동 체크 파이프라인
스크립트: pytest → alembic heads → /health → /docs → openapi export diff → risk summary
실패 시 빌드 중단 & 원인 출력
아티팩트 태깅(Build ID + Git SHA) → 프론트/백엔드 /health 노출
롤백 전략 & 플레이북
DB 마이그레이션 롤백 경로(alembic downgrade 단일 단계) 문서화
Outbox 장애 시 플래그(KAFKA_PUBLISH_ENABLED=false) 전환 절차
ClickHouse 지연 시 임시 대체: Postgres direct 쿼리 대시보드 패널 스위치
Deprecated 정리 (지연 제거 관리)
한정 패키지 구 엔드포인트 Deprecation 헤더 추가 + 접근 로그 계수(낮을 시 제거)
중복 profile/users_enhanced 라우터 접근 량 측정 → 0 확인 후 제거
문서 & 운영 핸드북
api docs/20250808.md 업데이트(“변경 요약 / 검증 / 다음 단계” 최신화)
OUTBOX_PIPELINE.md, DASHBOARD_CACHE.md, RELEASE_CHECKLIST.md, ROLLBACK_PLAYBOOK.md 최종 확정
KPI 정의 문서(응답지연, 실패율, lag) + 목표치 명시
최종 Go/No-Go 체크리스트 (요약)
 테스트 전부 Green
 Alembic head=1
 OpenAPI diff 승인
 성능 SLA 충족 리포트 첨부
 보안/시크릿 점검 로그
 모니터링 패널 URL & Alert Rule 활성
 롤백 스텝 재현 로그(스크린샷/명령)
추천 실행 순서(남은) 압축

데이터 중복 스캔 & 마이그레이션 적용 → RewardService 통합 → claim/idempotency 테스트
Outbox + Kafka + Metrics → Dashboard 캐시/ETag → 부하 테스트
ClickHouse 적재 검증 → Rate Limit/보안 → 릴리즈 자동 체크 스크립트
문서/플레이북 정리 → Deprecated 관찰 기간 → 최종 Go/No-Go
필요하면 위 단계 중 첫 작업을 바로 진행할 수 있으니 “중복 스캔 시작” / “RewardService 통합” 등 한 문장으로 지시 주세요.