import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


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
