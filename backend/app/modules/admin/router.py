import uuid
from typing import Any
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, desc

from app.common.response import ApiResponse
from app.common.exceptions import NotFoundException, BadRequestException
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_admin_user
from app.modules.auth.models import User
from app.modules.posts.models import Post, Comment, PostLike
from app.modules.stories.models import Story

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stats", summary="서비스 종합 지표 통계")
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict[str, Any]]:
    # Total Users
    users_count = await db.scalar(select(func.count(User.id)))
    # Active Users
    active_users_count = await db.scalar(select(func.count(User.id)).where(User.is_active.is_(True)))
    # Total Posts
    posts_count = await db.scalar(select(func.count(Post.id)))
    # Total Comments
    comments_count = await db.scalar(select(func.count(Comment.id)))
    # Total Stories
    stories_count = await db.scalar(select(func.count(Story.id)))

    stats = {
        "total_users": users_count or 0,
        "active_users": active_users_count or 0,
        "total_posts": posts_count or 0,
        "total_comments": comments_count or 0,
        "total_stories": stories_count or 0,
    }
    return ApiResponse.ok(stats)


@router.get("/users", summary="관리자 전용 사용자 목록 및 검색")
async def get_admin_users(
    q: str | None = Query(None, description="사용자명 또는 이름 검색어"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[list[dict[str, Any]]]:
    query = select(User)
    if q:
        search_pattern = f"%{q}%"
        query = query.where((User.username.ilike(search_pattern)) | (User.full_name.ilike(search_pattern)))

    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    query = query.order_by(desc(User.created_at)).offset((page - 1) * size).limit(size)

    res = await db.execute(query)
    users = res.scalars().all()

    user_list = [
        {
            "id": str(u.id),
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "profile_image_url": u.profile_image_url,
            "is_active": u.is_active,
            "is_admin": u.is_admin,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]
    return ApiResponse.paginated(data=user_list, total=total or 0)


@router.patch("/users/{user_id}/toggle-active", summary="사용자 계정 활성화/정지 토글")
async def toggle_user_active(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict[str, Any]]:
    if user_id == admin.id:
        raise BadRequestException("자기 자신 계정은 정지할 수 없습니다.")

    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise NotFoundException("사용자")

    user.is_active = not user.is_active
    await db.commit()
    await db.refresh(user)

    return ApiResponse.ok({
        "id": str(user.id),
        "username": user.username,
        "is_active": user.is_active,
    })


@router.get("/posts", summary="관리자 전용 게시물 목록 모니터링")
async def get_admin_posts(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[list[dict[str, Any]]]:
    total = await db.scalar(select(func.count(Post.id)))
    stmt = select(Post).order_by(desc(Post.created_at)).offset((page - 1) * size).limit(size)
    res = await db.execute(stmt)
    posts = res.scalars().all()

    post_list = []
    for p in posts:
        # Load user for post
        user_stmt = select(User).where(User.id == p.user_id)
        user_res = await db.execute(user_stmt)
        author = user_res.scalar_one_or_none()

        # Load media for post
        from app.modules.posts.models import PostMedia
        media_stmt = select(PostMedia).where(PostMedia.post_id == p.id).order_by(PostMedia.order)
        media_res = await db.execute(media_stmt)
        medias = media_res.scalars().all()

        post_list.append({
            "id": str(p.id),
            "caption": p.caption,
            "media": [
                {
                    "id": str(m.id),
                    "media_url": m.media_url,
                    "media_type": m.media_type,
                    "order": m.order,
                }
                for m in medias
            ],
            "author": {
                "id": str(author.id) if author else "",
                "username": author.username if author else "알 수 없음",
            },
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })

    return ApiResponse.paginated(data=post_list, total=total or 0)


@router.delete("/posts/{post_id}", summary="관리자 권한 게시물 강제 삭제")
async def admin_delete_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict[str, str]]:
    stmt = select(Post).where(Post.id == post_id)
    res = await db.execute(stmt)
    post = res.scalar_one_or_none()
    if not post:
        raise NotFoundException("게시물")

    await db.delete(post)
    await db.commit()
    return ApiResponse.ok({"message": "게시물이 성공적으로 강제 삭제되었습니다."})
