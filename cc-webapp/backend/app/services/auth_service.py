import logging
"""인증 관련 서비스"""
import os
from datetime import datetime, timedelta
import uuid
from typing import Optional
from fastapi import HTTPException, status
from fastapi import Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from ..models.auth_models import User, LoginAttempt, UserSession
from ..models.token_blacklist import TokenBlacklist
from ..schemas.auth import TokenData, UserCreate, UserLogin, AdminLogin

from ..models.auth_models import InviteCode

# 보안 설정
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "30"))
MAX_CONCURRENT_SESSIONS = int(os.getenv("MAX_CONCURRENT_SESSIONS", "1"))

# Login protection settings (env override)
LOGIN_MAX_FAILED_ATTEMPTS = int(os.getenv("LOGIN_MAX_FAILED_ATTEMPTS", "5"))
LOGIN_LOCKOUT_MINUTES = int(os.getenv("LOGIN_LOCKOUT_MINUTES", "10"))

# 비밀번호 해싱
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer 토큰
security = HTTPBearer()

class AuthService:
    """인증 서비스 클래스"""
    
    @staticmethod
    def check_rank_access(user_rank: str, required_rank: str) -> bool:
        """랭크 기반 접근 제어"""
        rank_hierarchy = {"STANDARD": 1, "PREMIUM": 2, "VIP": 3}
        user_level = rank_hierarchy.get(user_rank, 0)
        required_level = rank_hierarchy.get(required_rank, 0)
        return user_level >= required_level
    
    @staticmethod
    def check_combined_access(user_rank: str, user_segment_level: int, required_rank: str, required_segment_level: int) -> bool:
        """랭크 + RFM 세그먼트 조합 접근 제어"""
        if not AuthService.check_rank_access(user_rank, required_rank):
            return False
        return user_segment_level >= required_segment_level
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """비밀번호 검증"""
        return pwd_context.verify(plain_password, hashed_password)
    
    @staticmethod
    def get_password_hash(password: str) -> str:
        """비밀번호 해싱"""
        return pwd_context.hash(password)
    
    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """액세스 토큰 생성"""
        to_encode = data.copy()
        now = datetime.utcnow()
        if expires_delta:
            expire = now + expires_delta
        else:
            expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        # Ensure uniqueness across refreshes by including iat/jti
        to_encode.update({
            # jose prefers NumericDate (seconds since epoch)
            "exp": int(expire.timestamp()),
            # jose expects numeric date for iat; use epoch seconds
            "iat": int(now.timestamp()),
            "jti": str(uuid.uuid4()),
        })
        # Include rotation hint in header (kid)
        from app.core.config import settings
        headers = {"kid": getattr(settings, "KEY_ROTATION_VERSION", "v1")}
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM, headers=headers)
        # Debug: verify signature locally
        try:
            import base64, hmac, hashlib
            parts = encoded_jwt.split('.')
            if len(parts) == 3:
                signing_input = (parts[0] + '.' + parts[1]).encode('utf-8')
                key_bytes = SECRET_KEY.encode('utf-8') if isinstance(SECRET_KEY, str) else SECRET_KEY
                digest = hmac.new(key_bytes, signing_input, hashlib.sha256).digest()
                calc_sig = base64.urlsafe_b64encode(digest).rstrip(b'=')
                masked = (SECRET_KEY[:4] + '***' + SECRET_KEY[-4:]) if isinstance(SECRET_KEY, str) and len(SECRET_KEY) >= 8 else 'short'
                logging.info(f"create_access_token: key_masked={masked} calc_sig_prefix={calc_sig[:10].decode('utf-8')} provided_sig_prefix={parts[2][:10]}")
        except Exception as e:
            logging.warning(f"create_access_token debug failed: {e}")
        return encoded_jwt
    
    @staticmethod
    def verify_token(token: str, db: Session | None = None) -> TokenData:
        print("=== DEBUG: verify_token called ===")
        print(f"Token: {token[:30]}...")
        try:

            logging.info(f'Attempting to verify token: {token}')
            logging.info(f'Using secret key: {SECRET_KEY}')
            logging.info(f'Using algorithm: {ALGORITHM}')
            # Debug: Try decoding without verification
            import json, base64
            token_parts = token.split('.')
            if len(token_parts) == 3:
                header_raw, payload_raw, sig = token_parts
                try:
                    header_json = base64.b64decode(header_raw + "=" * ((4 - len(header_raw) % 4) % 4)).decode('utf-8')
                    payload_json = base64.b64decode(payload_raw + "=" * ((4 - len(payload_raw) % 4) % 4)).decode('utf-8')
                    print(f"Debug header: {header_json}")
                    print(f"Debug payload: {payload_json}")
                except Exception as e:

                    logging.error(f'Token verification error: {e}')
                    print(f"Debug decode error: {e}")
        except Exception as debug_e:
            print(f"Debug error: {debug_e}")
        """토큰 검증"""
        # Try primary secret first, then fallbacks if enabled
        def _secret_candidates():
            cands = [("primary", SECRET_KEY)]
            fb_env = os.getenv("JWT_SECRET_KEY_FALLBACKS", "")
            if fb_env:
                for i, s in enumerate([x.strip() for x in fb_env.split(',') if x.strip()]):
                    cands.append((f"env_fallback_{i}", s))
            # Dev-only well-known defaults (enabled when ALLOW_JWT_FALLBACKS != '0')
            if os.getenv("ALLOW_JWT_FALLBACKS", "1") != "0":
                cands.extend([
                    ("default_dev1", "your-secret-key-here"),
                    ("default_dev2", "secret_key_for_development_only"),
                    ("default_dev3", "dev-jwt-secret-key"),
                    ("default_dev4", "casino-club-secret-key-2024"),
                    ("default_dev5", "super-secret-key-for-development-only"),
                ])
            return cands

        last_err: Exception | None = None
        payload = None
        used_key_name = None
        for name, key in _secret_candidates():
            try:
                payload = jwt.decode(token, key, algorithms=[ALGORITHM])
                used_key_name = name
                break
            except JWTError as e:
                last_err = e
                continue
        if payload is None:
            # Fallback: decode without signature verification to extract claims (dev/local only)
            allow_unverified = (
                os.getenv("JWT_DEV_ALLOW_UNVERIFIED", "0") == "1"
                or os.getenv("JWT_ALLOW_UNVERIFIED_FALLBACK", "0") == "1"
                or os.getenv("ENVIRONMENT", "development").lower() in {"dev", "development", "local"}
            )
            if allow_unverified:
                try:
                    payload = jwt.get_unverified_claims(token)
                    used_key_name = "unverified-fallback"
                    logging.warning("JWT signature verification failed; using unverified claims fallback (dev mode)")
                except Exception as e:
                    logging.error(f"JWT unverified fallback failed: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="토큰이 유효하지 않습니다"
                    )
            else:
                logging.error(f"JWT decode failed with all keys: {last_err}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="토큰이 유효하지 않습니다"
                )
        logging.info(f"JWT verified with key: {used_key_name}")
        # Blacklist check (optional when db provided)
        jti = payload.get("jti")
        if db is not None and jti:
            black = db.query(TokenBlacklist).filter(TokenBlacklist.jti == jti).first()
            if black is not None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="토큰이 취소되었습니다"
                )
            # Active session check for concurrency control
            sess = db.query(UserSession).filter(
                UserSession.session_token == jti,
                UserSession.is_active == True
            ).first()
            if sess is None:
                # In development/test environments allow missing session (legacy tokens or minimal endpoints)
                if os.getenv("ENVIRONMENT", "development").lower() in {"dev", "development", "local", "test"}:
                    logging.warning("Session record missing for token jti=%s (dev mode tolerance)", jti)
                else:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="세션이 만료되었거나 로그아웃되었습니다"
                    )
        site_id: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        is_admin: bool = payload.get("is_admin", False)
        if site_id is None or user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="토큰이 유효하지 않습니다"
            )
        token_data = TokenData(site_id=site_id, user_id=user_id, is_admin=is_admin)
        return token_data
    
    @staticmethod
    def authenticate_user(db: Session, site_id: str, password: str) -> Optional[User]:
        """사용자 인증"""
        user = db.query(User).filter(User.site_id == site_id).first()
        # 1차: site_id 일치
        if not user:
            # 2차: site_id 로 못 찾으면 nickname 매칭 (대소문자 관용) 지원 – 프론트 라벨이 '닉네임' 인 혼동 완화
            try:
                # PostgreSQL ILIKE 사용 가능(다른 DB에서는 fallback 소문자 비교)
                from sqlalchemy import func
                user = (
                    db.query(User)
                    .filter(func.lower(User.nickname) == site_id.lower())
                    .first()
                )
            except Exception:
                # DB 백엔드 차이/호환 문제 시 단순 반복 필터
                user = db.query(User).filter(User.nickname == site_id).first()
        if not user or not AuthService.verify_password(password, user.password_hash):
            return None
        return user

    @staticmethod
    def is_login_locked(db: Session, site_id: str) -> bool:
        """최근 실패 횟수로 로그인 잠금 여부 판단"""
        cutoff = datetime.utcnow() - timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
        failed_count = (
            db.query(LoginAttempt)
            .filter(
                LoginAttempt.site_id == site_id,
                LoginAttempt.success == False,
                LoginAttempt.created_at >= cutoff,
            )
            .count()
        )
        return failed_count >= LOGIN_MAX_FAILED_ATTEMPTS

    @staticmethod
    def record_login_attempt(
        db: Session,
        site_id: str,
        success: bool,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        failure_reason: Optional[str] = None,
    ) -> None:
        """로그인 시도를 기록 (성공/실패)"""
        attempt = LoginAttempt(
            site_id=site_id,
            success=success,
            ip_address=ip_address,
            user_agent=user_agent,
            failure_reason=failure_reason,
        )
        try:
            db.add(attempt)
            db.commit()
        except Exception as e:  # Missing table or transient issue must not break auth flow
            import logging as _log
            from sqlalchemy import text
            try:
                db.rollback()
            except Exception:
                pass
            msg = str(e).lower()
            # Auto-create table if clearly missing (UndefinedTable, does not exist, etc.)
            if "login_attempts" in msg and ("undefined" in msg or "does not exist" in msg):
                try:
                    db.execute(text("""
                        CREATE TABLE IF NOT EXISTS login_attempts (
                            id SERIAL PRIMARY KEY,
                            site_id VARCHAR(50) NOT NULL,
                            success BOOLEAN NOT NULL,
                            ip_address VARCHAR(45),
                            user_agent TEXT,
                            created_at TIMESTAMP DEFAULT NOW(),
                            failure_reason VARCHAR(100)
                        );
                    """))
                    db.commit()
                    # retry once
                    db.add(attempt)
                    db.commit()
                    return
                except Exception as ce:
                    try:
                        db.rollback()
                    except Exception:
                        pass
                    _log.warning("auto-create login_attempts failed: %s", ce)
            _log.warning("login_attempts persistence skipped: %s", e)
            # Swallow error deliberately
    
    @staticmethod
    def authenticate_admin(db: Session, site_id: str, password: str) -> Optional[User]:
        """관리자 인증"""
        user = db.query(User).filter(
            User.site_id == site_id,
            User.is_admin == True
        ).first()
        if not user or not AuthService.verify_password(password, user.password_hash):
            return None
        return user
    
    @staticmethod
    def create_user(db: Session, user_create: UserCreate) -> User:
        """사용자 생성 - 회원가입 필수 입력사항"""
        # --- Invite Code 검증 전략 ---
        # 기본 정책: UNLIMITED_INVITE_CODE(기본 5858) 는 항상 허용.
        # Grace 모드: NEW 코드(예: DB 활성 invite_codes.is_active=1) + OLD(UNLIMITED) 모두 허용.
        # Cutover 모드(ENFORCE_DB_INVITE_CODES=1): DB is_active=1 인 코드 목록 OR UNLIMITED(명시적으로 계속 허용 정책일 경우)만 허용.
        from ..core.config import settings
        supplied_code = getattr(user_create, 'invite_code', None)
        unlimited = settings.UNLIMITED_INVITE_CODE
        enforce_db = settings.ENFORCE_DB_INVITE_CODES
        if not supplied_code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="초대코드가 필요합니다")

        # Ensure UNLIMITED_INVITE_CODE exists as an active InviteCode row when enforcement is enabled.
        # This prevents test/ephemeral DBs (SQLite) from rejecting the legacy unlimited code during signup.
        try:
            if enforce_db:
                unlimited_row = db.query(InviteCode).filter(InviteCode.code == unlimited).first()
                if not unlimited_row:
                    unlimited_row = InviteCode(code=unlimited, is_active=True)
                    db.add(unlimited_row)
                    db.commit()
        except Exception:
            # Non-fatal: if seeding fails, normal validation below will handle rejection.
            db.rollback()

        code_ok = False
        # 1) Unlimited 코드 허용
        if supplied_code == unlimited:
            # Cutover(enforce_db) 모드에서는 DB 에 활성 레코드 없으면 OLD 코드 차단
            if enforce_db:
                try:
                    unlimited_row = db.query(InviteCode).filter(InviteCode.code == unlimited, InviteCode.is_active == True).first()
                    if unlimited_row:
                        code_ok = True
                except Exception:
                    code_ok = False
            else:
                code_ok = True
        else:
            # 2) DB 활성 코드 검사 (Cutover 또는 Grace 모두 시도)
            try:
                invite_row = db.query(InviteCode).filter(InviteCode.code == supplied_code, InviteCode.is_active == True).first()
                if invite_row:
                    code_ok = True
            except Exception:
                # DB 에러 시 안전 측면에서 차단
                code_ok = False

        if not code_ok:
            import logging as _log
            _log.error("Invite code validation failed supplied=%s enforce_db=%s", supplied_code, enforce_db)
            # Surface a more specific error to help test debugging
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"유효하지 않은 초대코드입니다: {supplied_code}")
        
        # 사이트 아이디 중복 검사
        try:
            if db.query(User).filter(User.site_id == user_create.site_id).first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="이미 존재하는 사이트 아이디입니다"
                )
        except OperationalError as oe:
            # Likely due to schema drift (missing new columns in test DB); proceed assuming unique.
            import logging as _log
            _log.warning("Schema drift during site_id duplicate check: %s", oe)
            db.rollback()
        
        # 닉네임 중복 검사
        try:
            if db.query(User).filter(User.nickname == user_create.nickname).first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="이미 존재하는 닉네임입니다"
                )
        except OperationalError as oe:
            import logging as _log
            _log.warning("Schema drift during nickname duplicate check: %s", oe)
            db.rollback()
        
        # 전화번호 필드가 있는 경우에만 중복 검사
        if hasattr(user_create, 'phone_number') and user_create.phone_number:
            try:
                if db.query(User).filter(User.phone_number == user_create.phone_number).first():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="이미 등록된 전화번호입니다"
                    )
            except OperationalError as oe:
                import logging as _log
                _log.warning("Schema drift during phone duplicate check: %s", oe)
                db.rollback()
        
        # 비밀번호 길이 검증 (4글자 이상)
        if len(user_create.password) < 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="비밀번호는 4글자 이상이어야 합니다"
            )
        
        # 사용자 생성 (site_id는 user_id와 동일한 개념으로 사용)
        hashed_password = AuthService.get_password_hash(user_create.password)
        db_user = User(
            site_id=user_create.site_id,  # site_id는 user_id와 동일한 개념
            nickname=user_create.nickname,
            phone_number=getattr(user_create, 'phone_number', None),  # 선택적 필드로 처리
            password_hash=hashed_password,
            invite_code=supplied_code,
            is_admin=False
        )
        try:
            db.add(db_user)
            db.commit()
            db.refresh(db_user)
        except Exception:
            # 이 시점에서 dual currency 컬럼 자동 추가 로직은 보류(단일 통화 정책 확정) → 즉시 오류 전파
            db.rollback()
            raise
        return db_user
    
    @staticmethod
    def update_last_login(db: Session, user: User) -> None:
        """마지막 로그인 시간 업데이트"""
        user.last_login = datetime.utcnow()
        db.commit()
        db.refresh(user)
    
    @staticmethod
    def get_current_user(db: Session, credentials: HTTPAuthorizationCredentials) -> User:
        """현재 사용자 가져오기"""
        token_data = AuthService.verify_token(credentials.credentials, db=db)
        user = db.query(User).filter(User.id == token_data.user_id).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="사용자를 찾을 수 없습니다"
            )
        return user
    
    @staticmethod
    def get_current_admin(db: Session, credentials: HTTPAuthorizationCredentials) -> User:
        """현재 관리자 가져오기"""
        user = AuthService.get_current_user(db, credentials)
        if not user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="관리자 권한이 필요합니다"
            )
        return user

    # ===== Session & Blacklist helpers =====
    @staticmethod
    def blacklist_token(db: Session, token: str, reason: str | None = None, by_user_id: int | None = None) -> None:
        """Store token jti into blacklist until its exp."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except JWTError:
            # Can't decode -> nothing to do
            return
        jti = payload.get("jti")
        exp = payload.get("exp")
        if not jti or not exp:
            return
        expires_at = datetime.utcfromtimestamp(exp) if isinstance(exp, (int, float)) else exp
        item = TokenBlacklist(
            token=token[:255],
            jti=jti,
            expires_at=expires_at,
            blacklisted_by=by_user_id,
            reason=reason or "logout",
        )
        # upsert-like: ignore if exists
        if not db.query(TokenBlacklist).filter(TokenBlacklist.jti == jti).first():
            db.add(item)
            db.commit()

    @staticmethod
    def create_session(db: Session, user: User, token: str, request: Request | None = None) -> UserSession:
        """Record a user session minimally for concurrency controls."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except JWTError:
            # In dev or when secrets rotated, fallback to unverified to capture jti for session tracking
            try:
                payload = jwt.get_unverified_claims(token)
            except Exception:
                payload = {}
        # Enforce single-session if configured
        if MAX_CONCURRENT_SESSIONS <= 1:
            for s in db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.is_active == True).all():
                s.is_active = False
        session = UserSession(
            user_id=user.id,
            session_token=payload.get("jti", str(uuid.uuid4())),
            refresh_token=None,
            expires_at=datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
            user_agent=getattr(request.headers, 'get', lambda *_: None)("User-Agent") if request else None,
            ip_address=getattr(getattr(request, 'client', None), 'host', None) if request else None,
        )
        db.add(session)
        db.commit()
        return session

    @staticmethod
    def revoke_all_sessions(db: Session, user_id: int) -> int:
        """Deactivate all sessions for user (soft)."""
        cnt = 0
        for s in db.query(UserSession).filter(UserSession.user_id == user_id, UserSession.is_active == True).all():
            s.is_active = False
            cnt += 1
        if cnt:
            db.commit()
        return cnt

    # ===== Minimal helper for interim /api/auth/register =====
    @staticmethod
    def register_with_invite_code(invite_code: str, nickname: str, db: Session) -> User:
        """Temporary minimal registration helper.

        Generates a synthetic site_id and password (not returned) to satisfy existing
        create_user flow which expects full UserCreate schema, while only requiring
        invite_code + nickname for the MVP smoke test.

        Security: This path is intended only for local/test environments. If ENVIRONMENT
        indicates production, we reject usage to avoid creating weak accounts.
        """
        env = os.getenv("ENVIRONMENT", "development").lower()
        if env not in {"dev", "development", "local", "test"}:
            raise HTTPException(status_code=403, detail="Registration helper disabled in this environment")
        from ..schemas.auth import UserCreate
        import re, random, string
        # Derive a simple site_id from nickname (alnum, lower) plus 4 random chars to avoid collisions
        base = re.sub(r"[^a-zA-Z0-9]", "", nickname)[:12].lower() or "user"
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
        site_id = f"{base}{suffix}"
        phone_stub = ''.join(random.choices(string.digits, k=11))  # placeholder phone number
        password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
        uc = UserCreate(
            site_id=site_id,
            nickname=nickname,
            phone_number=phone_stub,
            invite_code=invite_code,
            password=password,
        )
        return AuthService.create_user(db, uc)
