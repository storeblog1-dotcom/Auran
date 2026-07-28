import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.exceptions import ForbiddenException, UnauthorizedException
from app.core.database import get_db
from app.core.security import decode_token
from app.modules.auth.models import User
from app.modules.auth.service import get_user_by_id
from app.modules.audit.withdrawal import get_withdrawal, is_cancelable

# Bearer 토큰 추출기 (auto_error=False → 직접 예외 처리)
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Authorization: Bearer <token> 헤더에서 Access JWT를 검증하고
    대응하는 User 객체를 반환합니다.
    """
    if not credentials:
        raise UnauthorizedException("인증 토큰이 필요합니다")

    token = credentials.credentials

    try:
        payload = decode_token(token)
    except JWTError:
        raise UnauthorizedException("유효하지 않거나 만료된 토큰입니다")

    # refresh token으로 API 호출 방지
    if payload.get("type") == "refresh":
        raise UnauthorizedException("Access Token이 필요합니다")
    if payload.get("purpose") == "withdrawal_cancel":
        raise UnauthorizedException("탈퇴 취소 전용 토큰으로는 서비스를 이용할 수 없습니다")

    user_id_str: str | None = payload.get("sub")
    if not user_id_str:
        raise UnauthorizedException("토큰에 유저 정보가 없습니다")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise UnauthorizedException("토큰의 유저 ID가 올바르지 않습니다")

    return await get_user_by_id(db, user_id)


async def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """토큰이 있으면 유저를 반환하고, 없거나 유효하지 않은 토큰이어도 None을 반환합니다."""
    if not credentials:
        return None

    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("type") == "refresh":
            return None

        user_id_str: str | None = payload.get("sub")
        if not user_id_str:
            return None

        user_id = uuid.UUID(user_id_str)
        user = await get_user_by_id(db, user_id)
        if not user.is_active:
            return None
        return user
    except Exception:
        return None


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """is_active 상태인 사용자만 허용"""
    if not current_user.is_active:
        raise UnauthorizedException("비활성화된 계정입니다")
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """is_admin=True 인 사용자만 허용"""
    if not current_user.is_admin:
        raise ForbiddenException("관리자 권한이 필요합니다")
    return current_user


async def get_current_withdrawal_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise UnauthorizedException("탈퇴 취소 인증 토큰이 필요합니다")
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise UnauthorizedException("유효하지 않거나 만료된 토큰입니다")
    if (
        payload.get("type") == "refresh"
        or payload.get("purpose") != "withdrawal_cancel"
        or not payload.get("sub")
    ):
        raise UnauthorizedException("탈퇴 취소 전용 토큰이 아닙니다")
    try:
        user_id = uuid.UUID(payload["sub"])
    except (TypeError, ValueError):
        raise UnauthorizedException("토큰의 사용자 정보가 올바르지 않습니다")
    user = await get_user_by_id(db, user_id)
    withdrawal = await get_withdrawal(db, user.id)
    if not withdrawal or not is_cancelable(withdrawal):
        raise UnauthorizedException("탈퇴 취소 가능 기간이 지났습니다")
    return user
