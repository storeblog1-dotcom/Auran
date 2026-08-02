import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator
from app.modules.governance.schemas import PolicyAcceptance


# ─── Request Schemas ─────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str = Field(
        ...,
        min_length=3,
        max_length=30,
        pattern=r"^[a-zA-Z0-9_.]+$",
        examples=["john_doe"],
    )
    email: EmailStr = Field(..., examples=["john@example.com"])
    password: str = Field(..., min_length=8, max_length=128, examples=["password123"])
    nickname: str = Field(..., min_length=1, max_length=50, examples=["Aura"])
    full_name: str = Field(..., min_length=1, max_length=100, examples=["Aura"])
    age: int | None = Field(None, ge=14, le=120)
    gender: str | None = Field(None, max_length=30)
    sexual_orientation: str | None = Field(None, max_length=30)
    sexual_orientations: list[str] = Field(default_factory=list, max_length=10)
    height: int | None = Field(None, ge=50, le=250)
    body_type: str | None = Field(None, max_length=50)
    bio: str | None = Field(None, max_length=500)
    profile_image_url: str | None = Field(None, max_length=500)
    profile_visibility: str = Field("mutual_followers", pattern=r"^(public|mutual_followers|private)$")
    installation_id: str = Field(..., min_length=12, max_length=128)
    policy_acceptances: list[PolicyAcceptance] = Field(..., min_length=4, max_length=10)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v.strip()) < 8:
            raise ValueError("비밀번호는 최소 8자 이상이어야 합니다")
        return v


class LoginRequest(BaseModel):
    """email 또는 username으로 로그인"""
    identifier: str = Field(
        ...,
        description="이메일 또는 사용자명",
        examples=["john@example.com"],
    )
    password: str = Field(..., min_length=1, examples=["S3cur3P@ss"])


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="발급받은 Refresh JWT")


class WithdrawalRequest(BaseModel):
    password: str | None = Field(None, min_length=1)
    google_token: str | None = None
    confirmation: str = Field(..., pattern="^탈퇴$")


class GoogleLoginRequest(BaseModel):
    """Google OAuth 로그인 요청 DTO"""
    token: str | None = Field(None, description="Google ID Token")
    email: EmailStr | None = Field(None, description="Google 이메일")
    full_name: str | None = Field(None, description="이름")
    google_id: str | None = Field(None, description="Google 고유 Sub ID")
    profile_image_url: str | None = Field(None, description="프로필 사진 URL")
    installation_id: str | None = Field(None, min_length=12, max_length=128)
    policy_acceptances: list[PolicyAcceptance] = Field(default_factory=list, max_length=10)


# ─── Response Schemas ────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    withdrawal_pending: bool = False
    withdrawal_deadline: datetime | None = None


class UserMe(BaseModel):
    """현재 로그인된 사용자 정보 (비밀번호 제외)"""
    id: uuid.UUID
    username: str
    email: str
    full_name: str
    nickname: str | None = None
    age: int | None = None
    gender: str | None = None
    sexual_orientation: str | None = None
    sexual_orientations: list[str] | None = None
    height: int | None = None
    body_type: str | None = None
    profile_visibility: str = "mutual_followers"
    bio: str | None
    profile_image_url: str | None
    is_active: bool
    is_verified: bool
    is_private: bool = False
    allow_message_requests: bool = True
    is_admin: bool = False
    admin_role: str = "member"
    suspended_until: datetime | None = None
    permanently_suspended_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NicknameAvailabilityResponse(BaseModel):
    nickname: str
    available: bool
