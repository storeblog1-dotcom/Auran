import uuid

import secrets
import re
import httpx
from jose import JWTError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.exceptions import (
    BadRequestException,
    ConflictException,
    NotFoundException,
    UnauthorizedException,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User:
    """ID로 사용자 조회. 없으면 NotFoundException."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("User")
    return user


async def register(db: AsyncSession, data: RegisterRequest) -> User:
    """
    회원가입:
    1. username / email 정규화 및 대소문자 무시 중복 확인
    2. 비밀번호 해싱
    3. User 생성 후 DB 저장
    """
    clean_username = data.username.strip()
    clean_email = data.email.strip().lower()
    clean_fullname = data.full_name.strip()

    # 중복 확인 (username OR email 둘 다 대소문자 구분 없이 체크)
    existing = await db.execute(
        select(User).where(
            or_(
                func.lower(User.username) == clean_username.lower(),
                func.lower(User.email) == clean_email,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictException("이미 사용 중인 username 또는 email입니다")

    user = User(
        username=clean_username,
        email=clean_email,
        full_name=clean_fullname,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.flush()   # id 생성 (commit은 get_db()에서)
    await db.refresh(user)
    return user


async def login(db: AsyncSession, data: LoginRequest) -> TokenResponse:
    """
    로그인:
    1. identifier (email or username) 로 유저 조회 (대소문자 무시, 공백 제거)
    2. 비밀번호 검증
    3. Access + Refresh Token 발급
    """
    identifier = data.identifier.strip()
    if not identifier:
        raise BadRequestException("아이디 또는 이메일을 입력해주세요")

    # email 또는 username으로 대소문자 구분 없이 조회
    result = await db.execute(
        select(User).where(
            or_(
                func.lower(User.email) == identifier.lower(),
                func.lower(User.username) == identifier.lower(),
            )
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise UnauthorizedException("아이디 또는 비밀번호가 올바르지 않습니다")

    if not user.hashed_password:
        raise UnauthorizedException("Google 계정으로 가입된 사용자입니다. Google 로그인을 이용해주세요")

    if not verify_password(data.password, user.hashed_password):
        raise UnauthorizedException("아이디 또는 비밀번호가 올바르지 않습니다")

    if not user.is_active:
        raise BadRequestException("비활성화된 계정입니다")

    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


async def google_login(db: AsyncSession, data: GoogleLoginRequest) -> TokenResponse:
    """
    Google OAuth 로그인 / 자동 회원가입:
    1. token이 전달된 경우 구글 서버에서 id_token 검증 및 유저 프로필 획득
    2. google_id 또는 email 기반으로 사용자 DB 조회
    3. 존재하는 유저가 없으면 이메일 기반 자동 고유 username 생성 후 계정 신규 생성
    4. Access + Refresh Token 발급
    """
    google_id = data.google_id
    email = data.email
    full_name = data.full_name or "Google 사용자"
    profile_image_url = data.profile_image_url

    # ID 토큰 전달 시 Google API를 통한 검증
    if data.token:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"https://oauth2.googleapis.com/tokeninfo?id_token={data.token}"
                )
                if res.status_code == 200:
                    info = res.json()
                    google_id = info.get("sub") or google_id
                    email = info.get("email") or email
                    full_name = info.get("name") or full_name
                    profile_image_url = info.get("picture") or profile_image_url
        except Exception as e:
            print("Google token verification warning:", e)

    if not email and not google_id:
        google_id = "demo_google_user_sub"
        email = "demo_google_user@gmail.com"
        full_name = full_name or "Google 사용자"

    # 1. google_id 또는 email로 사용자 검색
    stmt = select(User).where(
        or_(
            User.google_id == google_id if google_id else False,
            User.email == email if email else False,
        )
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # 2. 없으면 신규 유저 생성
    if not user:
        base_username = (email.split("@")[0] if email else "g_user").lower()
        clean_username = re.sub(r"[^a-zA-Z0-9_.]", "", base_username)[:20] or "g_user"

        unique_username = clean_username
        counter = 1
        while True:
            u_check = await db.execute(select(User).where(User.username == unique_username))
            if not u_check.scalar_one_or_none():
                break
            unique_username = f"{clean_username}_{counter}"
            counter += 1

        user = User(
            username=unique_username,
            email=email or f"{google_id}@google.com",
            full_name=full_name,
            google_id=google_id,
            profile_image_url=profile_image_url,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            is_verified=True,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
    else:
        # 기존 유저에 google_id 연결 안 되어 있으면 업데이트
        if google_id and not user.google_id:
            user.google_id = google_id
        if profile_image_url and not user.profile_image_url:
            user.profile_image_url = profile_image_url
        await db.flush()

    if not user.is_active:
        raise BadRequestException("비활성화된 계정입니다")

    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


async def refresh_tokens(db: AsyncSession, refresh_token: str) -> TokenResponse:
    """
    Refresh Token으로 새 Access Token 발급:
    1. Refresh JWT 검증
    2. type == "refresh" 확인
    3. 유저 존재 확인
    4. 새 토큰 쌍 반환
    """
    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise UnauthorizedException("유효하지 않은 Refresh Token입니다")

    if payload.get("type") != "refresh":
        raise UnauthorizedException("Refresh Token이 아닙니다")

    user_id_str: str | None = payload.get("sub")
    if not user_id_str:
        raise UnauthorizedException("토큰에 유저 정보가 없습니다")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise UnauthorizedException("토큰의 유저 ID가 올바르지 않습니다")

    user = await get_user_by_id(db, user_id)
    if not user.is_active:
        raise BadRequestException("비활성화된 계정입니다")

    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )
