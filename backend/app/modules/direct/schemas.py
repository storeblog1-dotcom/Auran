from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SenderResponse(BaseModel):
    id: UUID
    username: str
    full_name: str
    profile_image_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ChatRoomCreate(BaseModel):
    target_user_id: UUID


class ChatMessageCreate(BaseModel):
    content: str | None = None
    message_type: str = Field(default="TEXT", description="TEXT, IMAGE, POST 등")
    media_url: str | None = None
    shared_post_id: UUID | None = None


class ChatMessageResponse(BaseModel):
    id: UUID
    room_id: UUID
    sender: SenderResponse
    content: str | None = None
    message_type: str
    media_url: str | None = None
    shared_post_id: UUID | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatRoomResponse(BaseModel):
    id: UUID
    is_group: bool
    name: str | None = None
    target_user: SenderResponse | None = None  # 1:1 대화 상대 유저
    members: list[SenderResponse] = []
    last_message: ChatMessageResponse | None = None
    unread_count: int = 0
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
