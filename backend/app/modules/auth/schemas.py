import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


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
    password: str = Field(..., min_length=4, max_length=128, examples=["password123"])
    full_name: str = Field(..., min_length=1, max_length=100, examples=["John Doe"])

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v.strip()) < 4:
            raise ValueError("비밀번호는 최소 4자 이상이어야 합니다")
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


class GoogleLoginRequest(BaseModel):
    """Google OAuth 로그인 요청 DTO"""
    token: str | None = Field(None, description="Google ID Token")
    email: EmailStr | None = Field(None, description="Google 이메일")
    full_name: str | None = Field(None, description="이름")
    google_id: str | None = Field(None, description="Google 고유 Sub ID")
    profile_image_url: str | None = Field(None, description="프로필 사진 URL")


# ─── Response Schemas ────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserMe(BaseModel):
    """현재 로그인된 사용자 정보 (비밀번호 제외)"""
    id: uuid.UUID
    username: str
    email: str
    full_name: str
    bio: str | None
    profile_image_url: str | None
    is_active: bool
    is_verified: bool
    is_admin: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}
