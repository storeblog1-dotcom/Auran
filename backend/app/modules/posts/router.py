from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from app.common.client_ip import get_client_ip
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.response import ApiResponse
from app.core.database import get_db
from app.modules.auth.dependencies import (
    get_current_active_user,
    get_optional_current_user,
)
from app.modules.auth.models import User
from app.modules.posts import service
from app.modules.posts.schemas import (
    CommentCreateRequest,
    CommentLikeToggleResponse,
    CommentResponse,
    CommentUpdateRequest,
    PostBookmarkToggleResponse,
    PostCreateRequest,
    PostLikeToggleResponse,
    PostRepostToggleResponse,
    PostResponse,
    PostUpdateRequest,
    PostUserSummary,
)

router = APIRouter(prefix="/posts", tags=["Posts"])
users_posts_router = APIRouter(prefix="/users", tags=["Posts"])



@router.post(
    "",
    response_model=ApiResponse[PostResponse],
    status_code=status.HTTP_201_CREATED,
    summary="새 게시물 작성",
)
async def create_post(
    body: PostCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PostResponse]:
    post = await service.create_post(db, current_user=current_user, data=body, ip_address=get_client_ip(request))
    return ApiResponse.ok(post)


@router.get(
    "/feed",
    response_model=ApiResponse[list[PostResponse]],
    summary="피드(타임라인) 게시물 목록 조회",
)
async def get_feed_posts(
    page: int = Query(1, ge=1, description="페이지 번호"),
    size: int = Query(20, ge=1, le=100, description="페이지당 개수"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PostResponse]]:
    offset = (page - 1) * size
    posts, total = await service.get_feed_posts(
        db, current_user=current_user, limit=size, offset=offset
    )
    has_more = (offset + len(posts)) < total
    return ApiResponse.paginated(data=posts, total=total, has_more=has_more)


@router.get(
    "/explore",
    response_model=ApiResponse[list[PostResponse]],
    summary="탐색 피드 게시물 목록 조회",
)
async def get_explore_posts(
    page: int = Query(1, ge=1, description="페이지 번호"),
    size: int = Query(30, ge=1, le=100, description="페이지당 개수"),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PostResponse]]:
    offset = (page - 1) * size
    posts, total = await service.get_explore_posts(
        db, current_user=current_user, limit=size, offset=offset
    )
    has_more = (offset + len(posts)) < total
    return ApiResponse.paginated(data=posts, total=total, has_more=has_more)


@router.get(
    "/community",
    response_model=ApiResponse[list[PostResponse]],
    summary="커뮤니티 게시판 게시물 목록 조회",
)
async def get_community_posts(
    board_type: str | None = Query(None, description="기존 게시판 구분"),
    board_id: UUID | None = Query(None, description="게시판 ID"),
    parent_board_id: UUID | None = Query(None, description="상위 게시판 ID의 모든 하위 게시글"),
    page: int = Query(1, ge=1, description="페이지 번호"),
    size: int = Query(30, ge=1, le=100, description="페이지당 개수"),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PostResponse]]:
    offset = (page - 1) * size
    posts, total = await service.get_community_posts(
        db, board_type=board_type, board_id=board_id, parent_board_id=parent_board_id, current_user=current_user, limit=size, offset=offset
    )
    has_more = (offset + len(posts)) < total
    return ApiResponse.paginated(data=posts, total=total, has_more=has_more)


@router.get(
    "/{post_id}",
    response_model=ApiResponse[PostResponse],
    summary="특정 게시물 상세 조회",
)
async def get_post_detail(
    post_id: UUID,
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PostResponse]:
    post = await service.get_post_by_id(db, post_id=post_id, current_user=current_user)
    return ApiResponse.ok(post)


@router.patch(
    "/{post_id}",
    response_model=ApiResponse[PostResponse],
    summary="게시물 문구 및 위치 수정",
)
async def update_post(
    post_id: UUID,
    body: PostUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PostResponse]:
    post = await service.update_post(
        db, post_id=post_id, current_user=current_user, data=body, ip_address=get_client_ip(request)
    )
    return ApiResponse.ok(post)


@router.delete(
    "/{post_id}",
    response_model=ApiResponse[dict],
    summary="게시물 삭제",
)
async def delete_post(
    post_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    await service.delete_post(
        db,
        post_id=post_id,
        current_user=current_user,
        ip_address=get_client_ip(request),
    )
    return ApiResponse.ok({"message": "게시물이 성공적으로 삭제되었습니다."})


# ─── LIKES ENDPOINTS ─────────────────────────────────────────────────────────


@router.post(
    "/{post_id}/like",
    response_model=ApiResponse[PostLikeToggleResponse],
    summary="게시물 좋아요 토글 (추가/취소)",
)
async def toggle_like_post(
    post_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PostLikeToggleResponse]:
    result = await service.toggle_like_post(db, post_id=post_id, current_user=current_user)
    return ApiResponse.ok(result)


@router.get(
    "/{post_id}/likes",
    response_model=ApiResponse[list[PostUserSummary]],
    summary="특정 게시물 좋아요 누른 사용자 목록 조회",
)
async def get_post_likes(
    post_id: UUID,
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PostUserSummary]]:
    users = await service.get_post_likes(db, post_id=post_id)
    return ApiResponse.ok(users)


# ─── COMMENTS ENDPOINTS ──────────────────────────────────────────────────────


@router.post(
    "/{post_id}/comments",
    response_model=ApiResponse[CommentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="게시물 댓글 작성",
)
async def create_comment(
    post_id: UUID,
    body: CommentCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CommentResponse]:
    comment = await service.create_comment(
        db,
        post_id=post_id,
        current_user=current_user,
        data=body,
        ip_address=get_client_ip(request),
    )
    return ApiResponse.ok(comment)


@router.get(
    "/{post_id}/comments",
    response_model=ApiResponse[list[CommentResponse]],
    summary="특정 게시물 댓글 목록 조회",
)
async def get_post_comments(
    post_id: UUID,
    page: int = Query(1, ge=1, description="페이지 번호"),
    size: int = Query(50, ge=1, le=100, description="페이지당 개수"),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[CommentResponse]]:
    offset = (page - 1) * size
    comments = await service.get_post_comments(
        db, post_id=post_id, current_user=current_user, limit=size, offset=offset
    )
    return ApiResponse.ok(comments)


@router.patch(
    "/comments/{comment_id}",
    response_model=ApiResponse[CommentResponse],
    summary="댓글 수정",
)
async def update_comment(
    comment_id: UUID,
    body: CommentUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CommentResponse]:
    comment = await service.update_comment(
        db,
        comment_id=comment_id,
        current_user=current_user,
        data=body,
        ip_address=get_client_ip(request),
    )
    return ApiResponse.ok(comment)


@router.delete(
    "/comments/{comment_id}",
    response_model=ApiResponse[dict],
    summary="댓글 삭제",
)
async def delete_comment(
    comment_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    await service.delete_comment(
        db,
        comment_id=comment_id,
        current_user=current_user,
        ip_address=get_client_ip(request),
    )
    return ApiResponse.ok({"message": "댓글이 성공적으로 삭제되었습니다."})


@router.post(
    "/comments/{comment_id}/like",
    response_model=ApiResponse[CommentLikeToggleResponse],
    summary="댓글 좋아요 토글 (추가/취소)",
)
async def toggle_comment_like(
    comment_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CommentLikeToggleResponse]:
    res = await service.toggle_comment_like(db, comment_id=comment_id, current_user=current_user)
    return ApiResponse.ok(res)


@users_posts_router.get(
    "/{username}/posts",
    response_model=ApiResponse[list[PostResponse]],
    summary="특정 사용자의 게시물 목록 조회",
)
async def get_user_posts(
    username: str,
    page: int = Query(1, ge=1, description="페이지 번호"),
    size: int = Query(20, ge=1, le=100, description="페이지당 개수"),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PostResponse]]:
    offset = (page - 1) * size
    posts, total = await service.get_user_posts(
        db, username=username, current_user=current_user, limit=size, offset=offset
    )
    has_more = (offset + len(posts)) < total
    return ApiResponse.paginated(data=posts, total=total, has_more=has_more)




# ─── BOOKMARK ENDPOINTS ──────────────────────────────────────────────────────


@router.post(
    "/{post_id}/bookmark",
    response_model=ApiResponse[PostBookmarkToggleResponse],
    summary="게시물 북마크(저장) 토글 (추가/취소)",
)
async def toggle_bookmark_post(
    post_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PostBookmarkToggleResponse]:
    res = await service.toggle_bookmark_post(
        db, post_id=post_id, current_user=current_user
    )
    return ApiResponse.ok(res)


@users_posts_router.get(
    "/me/saved-posts",
    response_model=ApiResponse[list[PostResponse]],
    summary="로그인한 사용자의 저장(북마크) 게시물 목록 조회",
)
async def get_saved_posts(
    page: int = Query(1, ge=1, description="페이지 번호"),
    size: int = Query(20, ge=1, le=100, description="페이지당 개수"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PostResponse]]:
    offset = (page - 1) * size
    posts, total = await service.get_saved_posts(
        db, current_user=current_user, limit=size, offset=offset
    )
    has_more = (offset + len(posts)) < total
    return ApiResponse.paginated(data=posts, total=total, has_more=has_more)


# ─── REPOST ENDPOINTS ────────────────────────────────────────────────────────


@router.post(
    "/{post_id}/repost",
    response_model=ApiResponse[PostRepostToggleResponse],
    summary="게시물 리포스트 토글 (추가/취소)",
)
async def toggle_repost_post(
    post_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PostRepostToggleResponse]:
    res = await service.toggle_repost_post(
        db, post_id=post_id, current_user=current_user
    )
    return ApiResponse.ok(res)


@users_posts_router.get(
    "/me/reposted-posts",
    response_model=ApiResponse[list[PostResponse]],
    summary="로그인한 사용자의 리포스트 게시물 목록 조회",
)
async def get_my_reposted_posts(
    page: int = Query(1, ge=1, description="페이지 번호"),
    size: int = Query(20, ge=1, le=100, description="페이지당 개수"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PostResponse]]:
    offset = (page - 1) * size
    posts, total = await service.get_reposted_posts(
        db, current_user=current_user, limit=size, offset=offset
    )
    has_more = (offset + len(posts)) < total
    return ApiResponse.paginated(data=posts, total=total, has_more=has_more)


@users_posts_router.get(
    "/{username}/reposted-posts",
    response_model=ApiResponse[list[PostResponse]],
    summary="특정 사용자의 리포스트 게시물 목록 조회",
)
async def get_user_reposted_posts(
    username: str,
    page: int = Query(1, ge=1, description="페이지 번호"),
    size: int = Query(20, ge=1, le=100, description="페이지당 개수"),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PostResponse]]:
    offset = (page - 1) * size
    posts, total = await service.get_user_reposted_posts(
        db, username=username, current_user=current_user, limit=size, offset=offset
    )
    has_more = (offset + len(posts)) < total
    return ApiResponse.paginated(data=posts, total=total, has_more=has_more)


from pydantic import BaseModel

class ReportRequest(BaseModel):
    reason: str

@router.post("/{post_id}/report", summary="게시물 신고")
async def report_post(
    post_id: UUID,
    body: ReportRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.reports.schemas import ReportCreate
    from app.modules.reports.service import create_report

    report = await create_report(
        db,
        reporter=current_user,
        data=ReportCreate(
            target_type="post",
            target_id=post_id,
            reason_code="other",
            detail=body.reason,
        ),
        reporter_ip=get_client_ip(request),
    )
    return ApiResponse.ok({"message": "post reported successfully", "report_id": report.id})
