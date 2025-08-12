"""간단한 API 로깅 미들웨어"""
import logging
import time
import uuid
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("api")

# API 엔드포인트별 기능 타이틀 매핑
API_TITLES = {
    # 🔐 인증 관련
    "POST /api/auth/signup": "👤 회원가입",
    "POST /api/auth/login": "🔑 로그인",
    "POST /api/auth/logout": "👋 로그아웃",
    "POST /api/auth/refresh": "🔄 토큰갱신",
    "POST /api/auth/admin/login": "👑 관리자로그인",
    
    # 👤 사용자 관련
    "GET /api/users/profile": "📋 프로필조회",
    "PUT /api/users/profile": "✏️ 프로필수정",
    "GET /api/users/balance": "💰 잔액조회",
    "GET /api/users/stats": "📊 통계조회",
    "GET /api/users/info": "ℹ️ 사용자정보",
    "POST /api/users/tokens/add": "💎 토큰추가",
    
    # 🎮 게임 관련
    "GET /api/games": "🎲 게임목록",
    "POST /api/games/slot/spin": "🎰 슬롯게임",
    "POST /api/games/gacha/pull": "🎁 가챠뽑기",
    "POST /api/games/rps/play": "✂️ 가위바위보",
    "POST /api/games/prize-roulette/spin": "🎡 룰렛게임",
    "GET /api/games/prize-roulette/info": "🎡 룰렛정보",
    
    # 🛒 상점 관련
    "GET /api/shop": "🛒 상점목록",
    "POST /api/shop/buy": "💳 상품구매",
    "GET /api/rewards": "🎁 보상목록",
    "POST /api/rewards/claim": "🎁 보상수령",
    
    # 📱 관리 관련
    "GET /api/admin": "👑 관리자패널",
    "GET /api/dashboard": "📊 대시보드",
    "GET /api/analytics": "📈 분석데이터",
    
    # 📝 기타
    "GET /docs": "📚 API문서",
    "GET /health": "💚 상태체크",
    "GET /": "🏠 홈페이지",
}

class SimpleLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        request_id = str(uuid.uuid4())

        # API 엔드포인트 키 생성
        endpoint_key = f"{request.method} {request.url.path}"

        # 기능 타이틀 가져오기
        title = API_TITLES.get(endpoint_key, f"🔧 {request.method} {request.url.path}")

        # API 시도 로그 (기능 타이틀 포함)
        logger.info(
            f"🚀 {title} - 시도",
            extra={"request_id": request_id, "path": request.url.path, "method": request.method},
        )

        try:
            response = await call_next(request)

            # 요청 추적을 위해 응답 헤더에 Request ID 부여
            try:
                response.headers["X-Request-ID"] = request_id
            except Exception:
                # 일부 StreamingResponse 등에서는 헤더 설정이 제한될 수 있음
                pass

            # 처리 시간 계산
            process_time = time.time() - start_time

            # 성공/실패 로그
            extra = {
                "request_id": request_id,
                "path": request.url.path,
                "method": request.method,
                "status_code": response.status_code,
                "duration_ms": round(process_time * 1000, 2),
            }
            if response.status_code < 400:
                logger.info(f"✅ {title} - 성공 ({response.status_code}) ({process_time:.2f}s)", extra=extra)
            else:
                logger.warning(f"⚠️ {title} - 실패 ({response.status_code}) ({process_time:.2f}s)", extra=extra)

            return response

        except Exception as e:
            process_time = time.time() - start_time
            logger.error(
                f"❌ {title} - 에러: {str(e)} ({process_time:.2f}s)",
                extra={
                    "request_id": request_id,
                    "path": request.url.path,
                    "method": request.method,
                    "status_code": 500,
                    "duration_ms": round(process_time * 1000, 2),
                },
            )
            raise
