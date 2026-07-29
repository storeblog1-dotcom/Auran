import uuid
from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SenderSummary(BaseModel):
    id: uuid.UUID
    username: str
    nickname: Optional[str] = None
    full_name: str
    profile_image_url: Optional[str] = None
    is_admin: bool = False

    model_config = ConfigDict(from_attributes=True)


class NotificationRead(BaseModel):
    id: uuid.UUID
    recipient_id: uuid.UUID
    sender: SenderSummary
    type: str
    message: Optional[str] = None
    post_id: Optional[uuid.UUID] = None
    comment_id: Optional[str] = None
    direct_message_id: Optional[str] = None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationUnreadCountResponse(BaseModel):
    unread_count: int


class NotificationListResponse(BaseModel):
    items: List[NotificationRead]
    unread_count: int


class PushTokenCreate(BaseModel):
    expo_push_token: str = Field(min_length=20, max_length=255)
    device_id: str = Field(min_length=8, max_length=128)
    platform: Literal["android", "ios"]
    app_version: Optional[str] = Field(default=None, max_length=32)

    @field_validator("expo_push_token")
    @classmethod
    def validate_expo_push_token(cls, value: str) -> str:
        value = value.strip()
        if not (
            value.startswith("ExponentPushToken[")
            or value.startswith("ExpoPushToken[")
        ) or not value.endswith("]"):
            raise ValueError("Invalid Expo push token")
        return value


class PushTokenRead(BaseModel):
    id: uuid.UUID
    device_id: str
    platform: str
    app_version: Optional[str] = None
    is_active: bool
    last_seen_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PushTokenDeactivateResponse(BaseModel):
    deactivated: bool


class PushReceiptSyncResponse(BaseModel):
    checked: int
    delivered: int
    failed: int
