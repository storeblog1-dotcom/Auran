from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PostMediaCreate(BaseModel):
    """게시물 미디어 생성 스키마"""

    media_url: str = Field(..., max_length=500, description="미디어 URL")
    media_type: str = Field(default="image", description="미디어 타입 (image/video)")
    order: int = Field(default=0, description="표시 순서")


class PostMediaResponse(BaseModel):
    """게시물 미디어 응답 스키마"""

    id: UUID
    media_url: str
    media_type: str
    order: int

    model_config = ConfigDict(from_attributes=True)


class PostCreateRequest(BaseModel):
    """게시물 생성 요청 DTO"""

    title: Optional[str] = Field(None, max_length=255, description="게시글 제목")
    board_type: Optional[str] = Field(None, description="게시판 구분 (anonymous/info)")
    board_id: Optional[UUID] = Field(None, description="커뮤니티 게시판 ID")
    caption: Optional[str] = Field(None, description="게시물 문구")
    location: Optional[str] = Field(None, max_length=255, description="위치")
    visibility: Optional[str] = Field(
        "public",
        pattern=r"^(public|followers|private)$",
        description="공개 범위 (public: 전체공개, followers: 팔로워 공개, private: 비공개)",
    )
    media: List[PostMediaCreate] = Field(
        default=[], description="미디어 목록"
    )


class PostUpdateRequest(BaseModel):
    """게시물 수정 요청 DTO"""

    title: Optional[str] = Field(None, max_length=255, description="게시글 제목")
    board_type: Optional[str] = Field(None, description="게시판 구분 (anonymous/info)")
    board_id: Optional[UUID] = Field(None, description="커뮤니티 게시판 ID")
    caption: Optional[str] = Field(None, description="게시물 문구")
    location: Optional[str] = Field(None, max_length=255, description="위치")
    visibility: Optional[str] = Field(None, pattern=r"^(public|followers|private)$")
    media: Optional[List[PostMediaCreate]] = Field(None, description="수정할 미디어 목록")



class PostUserSummary(BaseModel):
    """게시물 작성자 정보 요약 DTO"""

    id: UUID
    username: str
    nickname: Optional[str] = None
    full_name: str
    profile_image_url: Optional[str] = None
    is_following: bool = False

    model_config = ConfigDict(from_attributes=True)


class CommentCreateRequest(BaseModel):
    """댓글 생성 요청 DTO"""

    content: str = Field(..., min_length=1, max_length=1000, description="댓글 내용")
    parent_id: Optional[UUID] = Field(None, description="대댓글 대상 댓글 ID (없으면 최상위 댓글)")


    mention_user_id: Optional[UUID] = Field(None, description="Reply or mention notification recipient ID")


class CommentUpdateRequest(BaseModel):
    """댓글 수정 요청 DTO"""

    content: str = Field(..., min_length=1, max_length=1000, description="수정할 댓글 내용")


class CommentResponse(BaseModel):
    """댓글 응답 DTO"""

    id: UUID
    post_id: UUID
    parent_id: Optional[UUID] = None
    user: PostUserSummary
    content: str
    created_at: datetime
    updated_at: datetime
    likes_count: int = 0
    is_liked: bool = False
    is_mine: bool = False
    replies_count: int = 0
    replies: List["CommentResponse"] = []

    model_config = ConfigDict(from_attributes=True)


CommentResponse.model_rebuild()


class CommentLikeToggleResponse(BaseModel):
    """댓글 좋아요 토글 응답 DTO"""

    comment_id: UUID
    is_liked: bool
    likes_count: int


class PostResponse(BaseModel):
    """게시물 상세 응답 DTO"""

    id: UUID
    user: PostUserSummary
    title: Optional[str] = None
    board_type: Optional[str] = None
    board_id: Optional[UUID] = None
    caption: Optional[str] = None
    location: Optional[str] = None
    visibility: str = "public"
    media: List[PostMediaResponse]
    likes_count: int = 0
    comments_count: int = 0
    reposts_count: int = 0
    preview_comments: List[CommentResponse] = []
    is_liked: bool = False
    is_bookmarked: bool = False
    is_reposted: bool = False
    is_mine: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PostListResponse(BaseModel):
    """게시물 목록 페이지네이션 응답 DTO"""

    items: List[PostResponse]
    total: int
    page: int
    size: int
    has_more: bool


class PostLikeToggleResponse(BaseModel):
    """좋아요 토글 응답 DTO"""

    is_liked: bool
    likes_count: int


class PostBookmarkToggleResponse(BaseModel):
    """북마크 토글 응답 DTO"""

    post_id: UUID
    is_bookmarked: bool


class PostRepostToggleResponse(BaseModel):
    """리포스트 토글 응답 DTO"""

    post_id: UUID
    is_reposted: bool
    reposts_count: int
