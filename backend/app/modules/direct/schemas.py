from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SenderResponse(BaseModel):
    id: UUID
    username: str
    nickname: str | None = None
    full_name: str
    profile_image_url: str | None = None
    is_admin: bool = False

    model_config = ConfigDict(from_attributes=True)


class ChatRoomCreate(BaseModel):
    target_user_id: UUID


class ChatMessageCreate(BaseModel):
    client_message_id: UUID | None = Field(
        default=None,
        description="Client-generated UUID used to make retries idempotent",
    )
    content: str | None = None
    message_type: str = Field(default="TEXT", description="TEXT, IMAGE, POST 등")
    media_url: str | None = None
    shared_post_id: UUID | None = None


class ChatMessageResponse(BaseModel):
    id: UUID
    room_id: UUID
    client_message_id: UUID | None = None
    sender: SenderResponse
    content: str | None = None
    message_type: str
    media_url: str | None = None
    shared_post_id: UUID | None = None
    delivery_status: str = "SENT"
    delivered_at: datetime | None = None
    read_at: datetime | None = None
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
    request_status: str = "ACCEPTED"
    is_outgoing_request: bool = False
    request_message_count: int = 0
    request_message_limit: int = 5
    can_send_message: bool = True
    can_share_post: bool = True
    message_permission_reason: str | None = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DirectMessageEligibilityResponse(BaseModel):
    target_user: SenderResponse
    room_id: UUID | None = None
    request_status: str
    is_outgoing_request: bool = False
    request_message_count: int = 0
    request_message_limit: int = 5
    can_send_message: bool
    can_share_post: bool
    message_permission_reason: str | None = None


class MessageCheckpointUpdate(BaseModel):
    through_message_id: UUID | None = None


class MessageCheckpointResponse(BaseModel):
    user_id: UUID
    delivered_at: datetime | None = None
    read_at: datetime | None = None


class DirectPresenceResponse(BaseModel):
    user_id: UUID
    last_active_at: datetime


class RealtimeConfigResponse(BaseModel):
    supabase_url: str
    supabase_anon_key: str
    access_token: str
    expires_at: datetime
    channel_topic: str | None = None
    presence_topic: str
    peer_presence_topics: list[str] = Field(default_factory=list)
    user_id: UUID
    last_seen_at: datetime
