from datetime import datetime, timedelta, timezone
from typing import List, Tuple
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.models import User
from app.modules.posts.schemas import PostUserSummary
from app.modules.stories.models import Story, StoryView
from app.modules.stories.schemas import (
    StoryCreateRequest,
    StoryResponse,
    UserStoryGroupResponse,
)
from app.modules.users.models import Follow


async def _can_view_story(
    db: AsyncSession, story: Story, current_user: User
) -> bool:
    if current_user.is_admin or story.user_id == current_user.id:
        return True
    return False


async def create_story(
    db: AsyncSession, current_user: User, data: StoryCreateRequest
) -> StoryResponse:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=24)

    story = Story(
        user_id=current_user.id,
        media_url=data.media_url,
        media_type=data.media_type,
        caption=data.caption,
        created_at=now,
        expires_at=expires_at,
    )
    db.add(story)
    await db.commit()
    await db.refresh(story)

    user_summary = PostUserSummary.model_validate(current_user)

    return StoryResponse(
        id=story.id,
        user=user_summary,
        media_url=story.media_url,
        media_type=story.media_type,
        caption=story.caption,
        created_at=story.created_at,
        expires_at=story.expires_at,
        views_count=0,
        has_viewed=False,
    )


async def get_stories_feed(
    db: AsyncSession, current_user: User
) -> List[UserStoryGroupResponse]:
    now = datetime.now(timezone.utc)

    # 1. 팔로잉 유저 ID 목록 조회
    followings_stmt = select(Follow.following_id).where(
        Follow.follower_id == current_user.id
    )
    res = await db.execute(followings_stmt)
    following_ids = list(res.scalars().all())

    # 내 ID도 포함
    if current_user.is_admin:
        all_users_res = await db.execute(select(User.id).where(User.is_active.is_(True)))
        target_user_ids = list(all_users_res.scalars().all())
    else:
        candidate_ids = list(set([current_user.id] + following_ids))
        visible_users_res = await db.execute(
            select(User.id).where(
                User.id.in_(candidate_ids),
                (User.id == current_user.id) | User.is_private.is_(False),
            )
        )
        target_user_ids = list(visible_users_res.scalars().all())

    # 2. 만료되지 않은 스토리 조회
    stmt = (
        select(Story)
        .where(
            and_(
                Story.user_id.in_(target_user_ids),
                Story.expires_at > now,
            )
        )
        .options(selectinload(Story.user), selectinload(Story.views))
        .order_by(Story.created_at.asc())
    )
    res = await db.execute(stmt)
    stories = list(res.scalars().all())

    # 3. 유저별로 스토리 그룹화
    user_stories_map = {}
    for story in stories:
        uid = story.user_id
        if uid not in user_stories_map:
            user_stories_map[uid] = {
                "user": story.user,
                "stories": [],
            }

        # view 정보 확인
        views_count = len(story.views)
        has_viewed = any(v.user_id == current_user.id for v in story.views)

        story_resp = StoryResponse(
            id=story.id,
            user=PostUserSummary.model_validate(story.user),
            media_url=story.media_url,
            media_type=story.media_type,
            caption=story.caption,
            created_at=story.created_at,
            expires_at=story.expires_at,
            views_count=views_count,
            has_viewed=has_viewed,
        )
        user_stories_map[uid]["stories"].append(story_resp)

    # 4. UserStoryGroupResponse 변환
    groups: List[UserStoryGroupResponse] = []
    for uid, data in user_stories_map.items():
        st_list = data["stories"]
        is_self = current_user.is_admin or uid == current_user.id
        has_unviewed = any(not s.has_viewed for s in st_list)

        group = UserStoryGroupResponse(
            user=PostUserSummary.model_validate(data["user"]),
            stories=st_list,
            has_unviewed=has_unviewed,
            is_self=is_self,
        )
        groups.append(group)

    # 5. 정렬: 1순위 본인 스토리, 2순위 안 읽은 스토리가 있는 유저, 3순위 작성 시간 최신순
    groups.sort(
        key=lambda g: (
            0 if g.is_self else (1 if g.has_unviewed else 2),
            -g.stories[-1].created_at.timestamp() if g.stories else 0,
        )
    )

    return groups


async def record_story_view(
    db: AsyncSession, story_id: UUID, current_user: User
) -> Tuple[bool, int]:
    stmt = select(Story).where(Story.id == story_id).options(selectinload(Story.views))
    res = await db.execute(stmt)
    story = res.scalar_one_or_none()

    if not story:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="스토리를 찾을 수 없습니다.",
        )

    if not await _can_view_story(db, story, current_user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story is not available to this user.",
        )

    # 이미 보았는지 확인
    existing_view = any(v.user_id == current_user.id for v in story.views)
    if not existing_view:
        new_view = StoryView(story_id=story_id, user_id=current_user.id)
        db.add(new_view)
        await db.commit()
        views_count = len(story.views) + 1
    else:
        views_count = len(story.views)

    return True, views_count


async def delete_story(db: AsyncSession, story_id: UUID, current_user: User) -> None:
    stmt = select(Story).where(Story.id == story_id)
    res = await db.execute(stmt)
    story = res.scalar_one_or_none()

    if not story:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="스토리를 찾을 수 없습니다.",
        )

    if story.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="본인의 스토리만 삭제할 수 있습니다.",
        )

    await db.delete(story)
    await db.commit()
