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
from app.modules.audit.models import AuditEvent
import json
from app.modules.posts.models import Post, Comment, PostLike
from app.modules.stories.models import Story

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/activity-logs", summary="관리자 전용 가입·탈퇴 및 게시글 감사 로그")
async def activity_logs(
    q: str | None = Query(None, description="아이디 또는 닉네임 검색"),
    page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin_user),
) -> ApiResponse[list[dict[str, Any]]]:
    query = select(AuditEvent)
    if q:
        pattern = f"%{q}%"
        query = query.join(User, User.id == AuditEvent.user_id).where((User.username.ilike(pattern)) | (User.nickname.ilike(pattern)))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.order_by(desc(AuditEvent.created_at)).offset((page - 1) * size).limit(size))).scalars().all()
    post_ids = [uuid.UUID(x.target_id) for x in rows if x.target_type == "post" and x.target_id]
    post_numbers: dict[str, str] = {}
    if post_ids:
        posts = (await db.execute(select(Post).where(Post.id.in_(post_ids)))).scalars().all()
        post_numbers = {str(post.id): f"P-{post.display_number:06d}" for post in posts if post.display_number}
    user_ids = [x.user_id for x in rows if x.user_id]
    users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all() if user_ids else []
    user_map = {u.id: u for u in users}
    data = [{"id": str(x.id), "user_id": str(x.user_id) if x.user_id else None, "username": user_map[x.user_id].username if x.user_id in user_map else "알 수 없음", "nickname": user_map[x.user_id].nickname if x.user_id in user_map else None, "event_type": x.event_type, "target_type": x.target_type, "target_id": x.target_id, "content_number": post_numbers.get(x.target_id or ""), "ip_address": x.ip_address, "snapshot": json.loads(x.snapshot) if x.snapshot else None, "created_at": x.created_at.isoformat()} for x in rows if x.event_type != "admin_audit_view"]
    return ApiResponse.paginated(data=data, total=total or 0)


@router.get("/users/{user_id}/content", summary="관리자 전용 사용자 작성 콘텐츠")
async def get_admin_user_content(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict[str, Any]]:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise NotFoundException("사용자")
    posts = (await db.execute(select(Post).where(Post.user_id == user_id).order_by(desc(Post.created_at)))).scalars().all()
    comments = (await db.execute(select(Comment, Post.display_number).join(Post, Post.id == Comment.post_id).where(Comment.user_id == user_id).order_by(desc(Comment.created_at)))).all()
    parent_ids = [comment.parent_id for comment, _ in comments if comment.parent_id]
    parents = (await db.execute(select(Comment).where(Comment.id.in_(parent_ids)))).scalars().all() if parent_ids else []
    parent_numbers = {parent.id: parent.display_number for parent in parents}
    return ApiResponse.ok({
        "user": {"id": str(user.id), "username": user.username, "nickname": user.nickname},
        "posts": [{"id": str(p.id), "content_number": f"P-{p.display_number:06d}", "caption": p.caption, "created_at": p.created_at.isoformat()} for p in posts],
        "comments": [{"id": str(c.id), "content_number": f"P-{number:06d}-C-{parent_numbers[c.parent_id]:03d}-R-{c.display_number:03d}" if c.parent_id in parent_numbers else f"P-{number:06d}-C-{c.display_number:03d}", "content": c.content, "created_at": c.created_at.isoformat()} for c, number in comments],
    })


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
        query = query.where(
            (User.username.ilike(search_pattern))
            | (User.nickname.ilike(search_pattern))
            | (User.full_name.ilike(search_pattern))
        )

    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    query = query.order_by(desc(User.created_at)).offset((page - 1) * size).limit(size)

    res = await db.execute(query)
    users = res.scalars().all()

    user_list = [
        {
            "id": str(u.id),
            "username": u.username,
            "nickname": u.nickname,
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
        "nickname": user.nickname,
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
            "content_number": f"P-{p.display_number:06d}" if p.display_number else None,
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
                "nickname": author.nickname if author else "알 수 없음",
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
