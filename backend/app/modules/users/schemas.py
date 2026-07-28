import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


# ─── Request Schemas ─────────────────────────────────────────

class UserUpdateProfileRequest(BaseModel):
    nickname: str | None = Field(None, min_length=1, max_length=50, examples=["Aura"])
    full_name: str | None = Field(None, min_length=1, max_length=100, examples=["John Doe"])
    bio: str | None = Field(None, max_length=500, examples=["Hello, world!"])
    profile_image_url: str | None = Field(None, max_length=500, examples=["https://example.com/profile.jpg"])


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1, examples=["CurrentP@ss1"])
    new_password: str = Field(..., min_length=8, max_length=128, examples=["NewP@ssw0rd2"])

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("비밀번호에 대문자가 하나 이상 포함되어야 합니다")
        if not any(c.isdigit() for c in v):
            raise ValueError("비밀번호에 숫자가 하나 이상 포함되어야 합니다")
        return v


# ─── Response Schemas ────────────────────────────────────────

class UserSummaryResponse(BaseModel):
    """사용자 목록 / 검색 결과 요약 정보"""
    id: uuid.UUID
    username: str
    nickname: str | None = None
    full_name: str
    profile_image_url: str | None = None
    is_following: bool = False

    model_config = {"from_attributes": True}


class UserProfileResponse(BaseModel):
    """상세 프로필 정보"""
    id: uuid.UUID
    username: str
    nickname: str | None = None
    full_name: str
    bio: str | None = None
    profile_image_url: str | None = None
    age: int | None = None
    gender: str | None = None
    sexual_orientation: str | None = None
    height: int | None = None
    body_type: str | None = None
    profile_visibility: str = "mutual_followers"
    posts_count: int = 0
    followers_count: int = 0
    following_count: int = 0
    is_following: bool = False
    is_mutual_following: bool = False
    is_me: bool = False
    is_admin: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class FollowStatusResponse(BaseModel):
    """팔로우/언팔로우 처리 결과"""
    is_following: bool
    followers_count: int
