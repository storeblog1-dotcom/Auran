import uuid
from typing import Any
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, desc, update, literal, union_all
from sqlalchemy.orm import aliased

from app.common.response import ApiResponse
from app.common.client_ip import get_client_ip
from app.common.exceptions import NotFoundException, BadRequestException
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_admin_user
from app.modules.auth.models import User
from app.modules.audit.models import AuditEvent, CommentRevision, PostRevision
import json
from app.modules.posts.models import Post, Comment, PostLike
from app.modules.community.models import CommunityBoard
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
    revision_ids = [x.revision_id for x in rows if x.revision_id]
    post_revisions = (
        await db.execute(select(PostRevision).where(PostRevision.id.in_(revision_ids)))
    ).scalars().all() if revision_ids else []
    comment_revisions = (
        await db.execute(select(CommentRevision).where(CommentRevision.id.in_(revision_ids)))
    ).scalars().all() if revision_ids else []
    revision_number_map = {
        str(revision.id): f"P-{revision.display_number:06d}"
        for revision in post_revisions
        if revision.display_number
    }
    revision_number_map.update({
        str(revision.id): (
            f"P-{revision.post_display_number:06d}-"
            + (
                f"C-{revision.parent_display_number:03d}-R-{revision.display_number:03d}"
                if revision.parent_display_number and revision.display_number
                else f"C-{revision.display_number:03d}"
            )
        )
        for revision in comment_revisions
        if revision.post_display_number and revision.display_number
    })
    user_ids = [x.user_id for x in rows if x.user_id]
    users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all() if user_ids else []
    user_map = {u.id: u for u in users}
    data = [{
        "id": str(x.id),
        "user_id": str(x.user_id) if x.user_id else None,
        "username": user_map[x.user_id].username if x.user_id in user_map else "알 수 없음",
        "nickname": user_map[x.user_id].nickname if x.user_id in user_map else None,
        "event_type": x.event_type,
        "target_type": x.target_type,
        "target_id": x.target_id,
        "revision_id": str(x.revision_id) if x.revision_id else None,
        "content_number": revision_number_map.get(str(x.revision_id)) if x.revision_id else post_numbers.get(x.target_id or ""),
        "ip_address": x.ip_address,
        "snapshot": json.loads(x.snapshot) if x.snapshot else None,
        "created_at": x.created_at.isoformat(),
    } for x in rows if x.event_type != "admin_audit_view"]
    return ApiResponse.paginated(data=data, total=total or 0)


def _comment_number(revision: CommentRevision) -> str | None:
    if not revision.post_display_number or not revision.display_number:
        return None
    if revision.parent_display_number:
        return (
            f"P-{revision.post_display_number:06d}-"
            f"C-{revision.parent_display_number:03d}-R-{revision.display_number:03d}"
        )
    return f"P-{revision.post_display_number:06d}-C-{revision.display_number:03d}"


@router.get("/content-revisions/{revision_id}", summary="관리자 전용 보존 콘텐츠 상세")
async def get_content_revision(
    revision_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict[str, Any]]:
    post_revision = (
        await db.execute(select(PostRevision).where(PostRevision.id == revision_id))
    ).scalar_one_or_none()
    if post_revision:
        author = (
            await db.execute(select(User).where(User.id == post_revision.user_id))
        ).scalar_one_or_none()
        rows = (
            await db.execute(
                select(CommentRevision)
                .where(
                    CommentRevision.post_id == post_revision.post_id,
                    CommentRevision.event_at <= post_revision.event_at,
                )
                .order_by(CommentRevision.comment_id, desc(CommentRevision.version))
            )
        ).scalars().all()
        latest: dict[uuid.UUID, CommentRevision] = {}
        for row in rows:
            latest.setdefault(row.comment_id, row)
        comments = sorted(
            latest.values(), key=lambda row: (row.source_created_at, str(row.comment_id))
        )
        return ApiResponse.ok({
            "kind": "post",
            "revision_id": str(post_revision.id),
            "target_id": str(post_revision.post_id),
            "version": post_revision.version,
            "lifecycle_event": post_revision.lifecycle_event,
            "content_number": f"P-{post_revision.display_number:06d}" if post_revision.display_number else None,
            "board_label": post_revision.board_name or ("익명게시판" if post_revision.board_type == "anonymous" else (post_revision.board_type or "피드")),
            "title": post_revision.title,
            "caption": post_revision.caption,
            "location": post_revision.location,
            "visibility": post_revision.visibility,
            "media": post_revision.media_manifest,
            "author": {
                "id": str(post_revision.user_id),
                "username": author.username if author else "알 수 없음",
                "nickname": author.nickname if author else None,
                "profile_image_url": author.profile_image_url if author else None,
            },
            "event_ip": post_revision.event_ip,
            "event_at": post_revision.event_at.isoformat(),
            "retention_until": post_revision.retention_until.isoformat(),
            "legal_hold": post_revision.legal_hold,
            "comments": [{
                "id": str(comment.comment_id),
                "content_number": _comment_number(comment),
                "content_type": "대댓글" if comment.parent_id else "댓글",
                "content": comment.content,
                "lifecycle_event": comment.lifecycle_event,
                "event_ip": comment.event_ip,
                "created_at": comment.source_created_at.isoformat(),
            } for comment in comments],
        })

    comment_revision = (
        await db.execute(select(CommentRevision).where(CommentRevision.id == revision_id))
    ).scalar_one_or_none()
    if not comment_revision:
        raise NotFoundException("보존 콘텐츠")
    author = (
        await db.execute(select(User).where(User.id == comment_revision.user_id))
    ).scalar_one_or_none()
    source_post = (
        await db.execute(
            select(PostRevision)
            .where(
                PostRevision.post_id == comment_revision.post_id,
                PostRevision.event_at <= comment_revision.event_at,
            )
            .order_by(desc(PostRevision.version))
            .limit(1)
        )
    ).scalar_one_or_none()
    return ApiResponse.ok({
        "kind": "comment",
        "revision_id": str(comment_revision.id),
        "target_id": str(comment_revision.comment_id),
        "version": comment_revision.version,
        "lifecycle_event": comment_revision.lifecycle_event,
        "content_number": _comment_number(comment_revision),
        "content_type": "대댓글" if comment_revision.parent_id else "댓글",
        "content": comment_revision.content,
        "post": {
            "id": str(comment_revision.post_id),
            "content_number": f"P-{source_post.display_number:06d}" if source_post and source_post.display_number else None,
            "title": source_post.title if source_post else None,
            "caption": source_post.caption if source_post else None,
            "board_label": (
                source_post.board_name
                or ("익명게시판" if source_post.board_type == "anonymous" else (source_post.board_type or "피드"))
            ) if source_post else None,
        },
        "author": {
            "id": str(comment_revision.user_id),
            "username": author.username if author else "알 수 없음",
            "nickname": author.nickname if author else None,
            "profile_image_url": author.profile_image_url if author else None,
        },
        "event_ip": comment_revision.event_ip,
        "event_at": comment_revision.event_at.isoformat(),
        "retention_until": comment_revision.retention_until.isoformat(),
        "legal_hold": comment_revision.legal_hold,
    })


@router.patch("/content-revisions/{revision_id}/legal-hold", summary="보존 콘텐츠 법적 보존 설정")
async def set_content_revision_legal_hold(
    revision_id: uuid.UUID,
    enabled: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict[str, Any]]:
    revision = (
        await db.execute(select(PostRevision).where(PostRevision.id == revision_id))
    ).scalar_one_or_none()
    if revision is None:
        revision = (
            await db.execute(select(CommentRevision).where(CommentRevision.id == revision_id))
        ).scalar_one_or_none()
    if revision is None:
        raise NotFoundException("보존 콘텐츠")
    if isinstance(revision, PostRevision):
        post_revision_ids = (
            await db.execute(
                select(PostRevision.id).where(PostRevision.post_id == revision.post_id)
            )
        ).scalars().all()
        comment_revision_ids = (
            await db.execute(
                select(CommentRevision.id).where(CommentRevision.post_id == revision.post_id)
            )
        ).scalars().all()
        await db.execute(
            update(PostRevision)
            .where(PostRevision.post_id == revision.post_id)
            .values(legal_hold=enabled)
        )
        await db.execute(
            update(CommentRevision)
            .where(CommentRevision.post_id == revision.post_id)
            .values(legal_hold=enabled)
        )
        affected_revision_ids = [*post_revision_ids, *comment_revision_ids]
    else:
        affected_revision_ids = (
            await db.execute(
                select(CommentRevision.id).where(
                    CommentRevision.comment_id == revision.comment_id
                )
            )
        ).scalars().all()
        await db.execute(
            update(CommentRevision)
            .where(CommentRevision.comment_id == revision.comment_id)
            .values(legal_hold=enabled)
        )
    if affected_revision_ids:
        await db.execute(
            update(AuditEvent)
            .where(AuditEvent.revision_id.in_(affected_revision_ids))
            .values(legal_hold=enabled)
        )
    await db.commit()
    return ApiResponse.ok({"revision_id": str(revision_id), "legal_hold": enabled})


@router.get("/users/{user_id}/content", summary="관리자 전용 사용자 작성 콘텐츠")
async def get_admin_user_content(
    user_id: uuid.UUID,
    post_page: int = Query(1, ge=1),
    comment_page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict[str, Any]]:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise NotFoundException("사용자")
    live_posts = (
        select(
            Post.id.label("id"),
            Post.display_number.label("display_number"),
            Post.board_type.label("board_type"),
            CommunityBoard.name.label("board_name"),
            Post.title.label("title"),
            Post.caption.label("caption"),
            Post.created_at.label("created_at"),
            literal(False).label("deleted"),
            literal(None).label("revision_id"),
        )
        .outerjoin(CommunityBoard, CommunityBoard.id == Post.board_id)
        .where(Post.user_id == user_id)
    )
    deleted_posts = select(
        PostRevision.post_id.label("id"),
        PostRevision.display_number.label("display_number"),
        PostRevision.board_type.label("board_type"),
        PostRevision.board_name.label("board_name"),
        PostRevision.title.label("title"),
        PostRevision.caption.label("caption"),
        PostRevision.source_created_at.label("created_at"),
        literal(True).label("deleted"),
        PostRevision.id.label("revision_id"),
    ).where(
        PostRevision.user_id == user_id,
        PostRevision.lifecycle_event == "deleted",
    )
    posts_union = union_all(live_posts, deleted_posts).subquery()
    post_rows = (await db.execute(
        select(posts_union)
        .order_by(desc(posts_union.c.created_at))
        .offset((post_page - 1) * size)
        .limit(size + 1)
    )).all()
    parent_comment = aliased(Comment)
    comment_board = aliased(CommunityBoard)
    live_comments = (
        select(
            Comment.id.label("id"),
            Post.display_number.label("post_display_number"),
            Comment.display_number.label("display_number"),
            Comment.parent_id.label("parent_id"),
            parent_comment.display_number.label("parent_display_number"),
            Post.board_type.label("board_type"),
            comment_board.name.label("board_name"),
            Comment.content.label("content"),
            Comment.created_at.label("created_at"),
            literal(False).label("deleted"),
            literal(None).label("revision_id"),
        )
        .join(Post, Post.id == Comment.post_id)
        .outerjoin(comment_board, comment_board.id == Post.board_id)
        .outerjoin(parent_comment, parent_comment.id == Comment.parent_id)
        .where(Comment.user_id == user_id)
    )
    retained_board_name = (
        select(PostRevision.board_name)
        .where(PostRevision.post_id == CommentRevision.post_id)
        .order_by(desc(PostRevision.version))
        .limit(1)
        .scalar_subquery()
    )
    retained_board_type = (
        select(PostRevision.board_type)
        .where(PostRevision.post_id == CommentRevision.post_id)
        .order_by(desc(PostRevision.version))
        .limit(1)
        .scalar_subquery()
    )
    deleted_comments = select(
        CommentRevision.comment_id.label("id"),
        CommentRevision.post_display_number.label("post_display_number"),
        CommentRevision.display_number.label("display_number"),
        CommentRevision.parent_id.label("parent_id"),
        CommentRevision.parent_display_number.label("parent_display_number"),
        retained_board_type.label("board_type"),
        retained_board_name.label("board_name"),
        CommentRevision.content.label("content"),
        CommentRevision.source_created_at.label("created_at"),
        literal(True).label("deleted"),
        CommentRevision.id.label("revision_id"),
    ).where(
        CommentRevision.user_id == user_id,
        CommentRevision.lifecycle_event == "deleted",
    )
    comments_union = union_all(live_comments, deleted_comments).subquery()
    comment_rows = (await db.execute(
        select(comments_union)
        .order_by(desc(comments_union.c.created_at))
        .offset((comment_page - 1) * size)
        .limit(size + 1)
    )).all()
    posts = post_rows[:size]
    comments = comment_rows[:size]
    return ApiResponse.ok({
        "user": {"id": str(user.id), "username": user.username, "nickname": user.nickname},
        "posts": [{
            "id": str(row.id),
            "revision_id": str(row.revision_id) if row.revision_id else None,
            "content_number": f"P-{row.display_number:06d}" if row.display_number else None,
            "content_type": "삭제 게시물" if row.deleted else "게시물",
            "board_label": row.board_name or ("익명게시판" if row.board_type == "anonymous" else (row.board_type or "피드")),
            "title": row.title,
            "display_text": row.title if row.title else row.caption,
            "created_at": row.created_at.isoformat(),
            "deleted": row.deleted,
        } for row in posts],
        "comments": [{
            "id": str(row.id),
            "revision_id": str(row.revision_id) if row.revision_id else None,
            "content_number": (
                f"P-{row.post_display_number:06d}-C-{row.parent_display_number:03d}-R-{row.display_number:03d}"
                if row.parent_display_number
                else f"P-{row.post_display_number:06d}-C-{row.display_number:03d}"
            ) if row.post_display_number and row.display_number else None,
            "content_type": ("삭제 대댓글" if row.deleted else "대댓글") if row.parent_id else ("삭제 댓글" if row.deleted else "댓글"),
            "board_label": row.board_name or ("익명게시판" if row.board_type == "anonymous" else (row.board_type or "피드")),
            "display_text": row.content,
            "created_at": row.created_at.isoformat(),
            "deleted": row.deleted,
        } for row in comments],
        "pagination": {
            "post_page": post_page,
            "comment_page": comment_page,
            "size": size,
            "posts_has_more": len(post_rows) > size,
            "comments_has_more": len(comment_rows) > size,
        },
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
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict[str, str]]:
    from app.modules.posts.service import delete_post
    await delete_post(
        db,
        post_id=post_id,
        current_user=admin,
        ip_address=get_client_ip(request),
        record_audit=False,
    )
    return ApiResponse.ok({"message": "게시물이 성공적으로 강제 삭제되었습니다."})
