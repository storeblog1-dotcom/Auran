from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.modules.posts.schemas import PostUserSummary


class StoryCreateRequest(BaseModel):
    """스토리 생성 요청 DTO"""

    media_url: str = Field(..., max_length=500, description="스토리 미디어 URL")
    media_type: str = Field(default="image", description="미디어 타입 (image/video)")
    caption: Optional[str] = Field(None, max_length=500, description="스토리 문구")


class StoryResponse(BaseModel):
    """스토리 응답 DTO"""

    id: UUID
    user: PostUserSummary
    media_url: str
    media_type: str
    caption: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    views_count: int = 0
    has_viewed: bool = False

    model_config = ConfigDict(from_attributes=True)


class UserStoryGroupResponse(BaseModel):
    """유저별 스토리 그룹 응답 DTO"""

    user: PostUserSummary
    stories: List[StoryResponse]
    has_unviewed: bool = False
    is_self: bool = False


class StoryViewResponse(BaseModel):
    """스토리 읽음 처리 응답 DTO"""

    story_id: UUID
    has_viewed: bool
    views_count: int
