from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.response import ApiResponse
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.models import User
from app.modules.stories import service
from app.modules.stories.schemas import (
    StoryCreateRequest,
    StoryResponse,
    StoryViewResponse,
    UserStoryGroupResponse,
)

router = APIRouter(prefix="/stories", tags=["Stories"])


@router.post(
    "",
    response_model=ApiResponse[StoryResponse],
    status_code=status.HTTP_201_CREATED,
    summary="새 스토리 작성",
)
async def create_story(
    body: StoryCreateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[StoryResponse]:
    story = await service.create_story(db, current_user=current_user, data=body)
    return ApiResponse.ok(story)


@router.get(
    "/feed",
    response_model=ApiResponse[list[UserStoryGroupResponse]],
    summary="스토리 피드 목록 조회 (유저별 그룹화)",
)
async def get_stories_feed(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[UserStoryGroupResponse]]:
    groups = await service.get_stories_feed(db, current_user=current_user)
    return ApiResponse.ok(groups)


@router.post(
    "/{story_id}/view",
    response_model=ApiResponse[StoryViewResponse],
    summary="스토리 읽음 처리",
)
async def view_story(
    story_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[StoryViewResponse]:
    has_viewed, views_count = await service.record_story_view(
        db, story_id=story_id, current_user=current_user
    )
    return ApiResponse.ok(
        StoryViewResponse(
            story_id=story_id,
            has_viewed=has_viewed,
            views_count=views_count,
        )
    )


@router.delete(
    "/{story_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="스토리 삭제",
)
async def delete_story(
    story_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await service.delete_story(db, story_id=story_id, current_user=current_user)
    return None
