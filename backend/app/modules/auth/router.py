from fastapi import APIRouter, Depends, Query, Request, status
from datetime import timedelta
from app.common.client_ip import get_client_ip
from app.modules.audit.service import record
from app.modules.audit.models import WithdrawnAccount
from app.core.security import verify_password
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.response import ApiResponse
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_active_user, get_optional_current_user
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    GoogleLoginRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserMe,
    NicknameAvailabilityResponse,
    WithdrawalRequest,
)
from app.modules.auth import service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/nickname-availability", response_model=ApiResponse[NicknameAvailabilityResponse])
async def nickname_availability(
    nickname: str = Query(..., min_length=1, max_length=50),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[NicknameAvailabilityResponse]:
    clean_nickname = nickname.strip()
    available = await service.is_nickname_available(
        db, clean_nickname, current_user.id if current_user else None
    )
    return ApiResponse.ok(NicknameAvailabilityResponse(nickname=clean_nickname, available=available))


@router.post(
    "/register",
    response_model=ApiResponse[UserMe],
    status_code=status.HTTP_201_CREATED,
    summary="회원가입",
)
async def register(
    body: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[UserMe]:
    user = await service.register(db, body)
    await record(db, user_id=user.id, event_type="signup", ip_address=get_client_ip(request), target_type="user", target_id=user.id)
    await db.commit()
    return ApiResponse.ok(UserMe.model_validate(user))


@router.post(
    "/login",
    response_model=ApiResponse[TokenResponse],
    summary="로그인 (Access + Refresh Token 발급)",
)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TokenResponse]:
    tokens = await service.login(db, body)
    return ApiResponse.ok(tokens)


@router.post(
    "/google",
    response_model=ApiResponse[TokenResponse],
    summary="Google OAuth 로그인 / 자동 회원가입",
)
async def google_login(
    body: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TokenResponse]:
    tokens = await service.google_login(db, body)
    return ApiResponse.ok(tokens)


@router.post(
    "/refresh",
    response_model=ApiResponse[TokenResponse],
    summary="Access Token 갱신",
)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TokenResponse]:
    tokens = await service.refresh_tokens(db, body.refresh_token)
    return ApiResponse.ok(tokens)


@router.get(
    "/me",
    response_model=ApiResponse[UserMe],
    summary="내 정보 조회 (인증 필요)",
)
async def me(
    current_user: User = Depends(get_current_active_user),
) -> ApiResponse[UserMe]:
    return ApiResponse.ok(UserMe.model_validate(current_user))


@router.post("/withdraw", summary="계정 탈퇴 및 보존 처리")
async def withdraw(
    body: WithdrawalRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    if not current_user.hashed_password or not verify_password(body.password, current_user.hashed_password):
        from app.common.exceptions import UnauthorizedException
        raise UnauthorizedException("비밀번호가 올바르지 않습니다")
    current_user.is_active = False
    db.add(WithdrawnAccount(user_id=current_user.id, retention_until=__import__("datetime").datetime.now(__import__("datetime").timezone.utc) + timedelta(days=365 * 3)))
    await record(db, user_id=current_user.id, event_type="withdrawal", ip_address=get_client_ip(request), target_type="user", target_id=current_user.id)
    await db.commit()
    return ApiResponse.ok({"message": "탈퇴 처리되었습니다. 보존된 기록은 관리자만 열람할 수 있습니다."})
