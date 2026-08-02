from fastapi import APIRouter, Depends, Query, Request, status
from datetime import datetime, timedelta, timezone
from app.common.client_ip import get_client_ip
from app.modules.audit.service import record
from app.modules.audit.models import WithdrawnAccount
from app.core.security import verify_password
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.response import ApiResponse
from app.core.database import get_db
from app.modules.auth.dependencies import (
    get_current_active_user,
    get_current_withdrawal_user,
    get_optional_current_user,
)
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
    client_ip = get_client_ip(request)
    from app.modules.governance.service import enforce_signup_risk
    await enforce_signup_risk(db, ip_address=client_ip, installation_id=body.installation_id)
    user = await service.register(db, body)
    from app.modules.governance.service import validate_and_store_consents
    await validate_and_store_consents(
        db,
        user_id=user.id,
        acceptances=body.policy_acceptances,
        ip_address=client_ip,
        installation_id=body.installation_id,
        sensitive_data_provided=bool(body.sexual_orientation or body.sexual_orientations),
    )
    await record(db, user_id=user.id, event_type="signup", ip_address=client_ip, target_type="user", target_id=user.id, snapshot={"policy_versions": {item.policy_key: item.version for item in body.policy_acceptances}, "installation_id_hmac": user.installation_id_hmac})
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
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TokenResponse]:
    tokens = await service.google_login(db, body, ip_address=get_client_ip(request))
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
    password_verified = bool(
        body.password
        and current_user.hashed_password
        and verify_password(body.password, current_user.hashed_password)
    )
    google_verified = bool(
        body.google_token
        and await service.verify_google_token_for_user(
            current_user,
            body.google_token,
        )
    )
    if not password_verified and not google_verified:
        from app.common.exceptions import UnauthorizedException
        raise UnauthorizedException("비밀번호 또는 Google 재인증이 올바르지 않습니다")
    from app.modules.audit.withdrawal import (
        PERSONAL_DATA_RETENTION_DAYS,
        WITHDRAWAL_GRACE_DAYS,
    )
    now = datetime.now(timezone.utc)
    cancelable_until = now + timedelta(days=WITHDRAWAL_GRACE_DAYS)
    current_user.is_active = False
    db.add(
        WithdrawnAccount(
            user_id=current_user.id,
            requested_at=now,
            cancelable_until=cancelable_until,
            finalized_at=None,
            retention_until=cancelable_until
            + timedelta(days=PERSONAL_DATA_RETENTION_DAYS),
        )
    )
    await record(
        db,
        user_id=current_user.id,
        event_type="withdrawal_requested",
        ip_address=get_client_ip(request),
        target_type="user",
        target_id=current_user.id,
        snapshot={"cancelable_until": cancelable_until.isoformat()},
    )
    await db.commit()
    return ApiResponse.ok({
        "message": "탈퇴 신청이 접수되었습니다. 7일 안에는 로그인 후 취소할 수 있습니다.",
        "cancelable_until": cancelable_until.isoformat(),
    })


@router.post(
    "/withdraw/cancel",
    response_model=ApiResponse[TokenResponse],
    summary="7일 이내 계정 탈퇴 취소",
)
async def cancel_withdrawal(
    request: Request,
    current_user: User = Depends(get_current_withdrawal_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TokenResponse]:
    tokens = await service.cancel_withdrawal(db, current_user)
    await record(
        db,
        user_id=current_user.id,
        event_type="withdrawal_cancelled",
        ip_address=get_client_ip(request),
        target_type="user",
        target_id=current_user.id,
    )
    await db.commit()
    return ApiResponse.ok(tokens)
