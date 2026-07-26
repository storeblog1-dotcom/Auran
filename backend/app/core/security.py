from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# ─── Password Hashing ────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """평문 비밀번호를 bcrypt 해시로 반환"""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """평문과 해시를 비교 검증"""
    return pwd_context.verify(plain, hashed)


# ─── JWT ─────────────────────────────────────────────────────
def _create_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    payload = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    payload.update({"exp": expire})
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(data: dict[str, Any]) -> str:
    """Access JWT 생성 (기본 만료: ACCESS_TOKEN_EXPIRE_MINUTES)"""
    return _create_token(
        data,
        timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(data: dict[str, Any]) -> str:
    """Refresh JWT 생성 (기본 만료: REFRESH_TOKEN_EXPIRE_DAYS)"""
    return _create_token(
        {**data, "type": "refresh"},
        timedelta(days=settings.refresh_token_expire_days),
    )


def decode_token(token: str) -> dict[str, Any]:
    """
    JWT 디코딩 및 서명/만료 검증.
    유효하지 않으면 JWTError 발생.
    """
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
