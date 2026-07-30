from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class BoardCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    parent_id: UUID | None = None
    is_anonymous: bool = False
    sort_order: int = 0


class BoardUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    slug: str | None = Field(None, min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    parent_id: UUID | None = None
    is_anonymous: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class BoardReorderRequest(BaseModel):
    direction: str = Field(pattern=r"^(up|down)$")


class BoardResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    parent_id: UUID | None = None
    is_anonymous: bool
    is_default: bool = False
    is_active: bool
    sort_order: int
    created_at: datetime
    model_config = {"from_attributes": True}


class NoticeCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=3000)
    board_id: UUID | None = None


class NoticeUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    content: str | None = Field(None, min_length=1, max_length=3000)
    board_id: UUID | None = None


class NoticeResponse(BaseModel):
    id: UUID
    title: str
    content: str
    board_id: UUID | None = None
    created_at: datetime
    model_config = {"from_attributes": True}
