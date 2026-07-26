from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.response import ApiResponse
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    GoogleLoginRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserMe,
)
from app.modules.auth import service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/register",
    response_model=ApiResponse[UserMe],
    status_code=status.HTTP_201_CREATED,
    summary="회원가입",
)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[UserMe]:
    user = await service.register(db, body)
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

