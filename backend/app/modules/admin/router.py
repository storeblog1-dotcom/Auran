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
from app.modules.audit.models import (
    AuditEvent,
    CommentRevision,
    PostRevision,
    WithdrawnAccount,
)
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


@router.get("/activity-users", summary="관리자 전용 사용자별 활동 요약")
async def activity_users(
    q: str | None = Query(None, description="아이디 또는 닉네임 검색"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[list[dict[str, Any]]]:
    activity_summary = (
        select(
            AuditEvent.user_id.label("user_id"),
            func.max(AuditEvent.created_at).label("latest_activity_at"),
            func.count(AuditEvent.id).label("activity_count"),
        )
        .where(
            AuditEvent.user_id.is_not(None),
            AuditEvent.event_type != "admin_audit_view",
        )
        .group_by(AuditEvent.user_id)
        .subquery()
    )
    query = (
        select(
            User,
            activity_summary.c.latest_activity_at,
            activity_summary.c.activity_count,
            WithdrawnAccount.requested_at,
            WithdrawnAccount.finalized_at,
            WithdrawnAccount.personal_data_purged_at,
        )
        .join(activity_summary, activity_summary.c.user_id == User.id)
        .outerjoin(WithdrawnAccount, WithdrawnAccount.user_id == User.id)
    )
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(
            (User.username.ilike(pattern)) | (User.nickname.ilike(pattern))
        )
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.execute(
            query.order_by(desc(activity_summary.c.latest_activity_at))
            .offset((page - 1) * size)
            .limit(size)
        )
    ).all()
    data = []
    for user, latest_activity_at, activity_count, requested_at, finalized_at, purged_at in rows:
        withdrawal_status = (
            "purged"
            if purged_at
            else "finalized"
            if finalized_at
            else "pending"
            if requested_at
            else None
        )
        data.append({
            "user_id": str(user.id),
            "username": user.username,
            "nickname": user.nickname,
            "latest_activity_at": latest_activity_at.isoformat(),
            "activity_count": activity_count,
            "withdrawal_status": withdrawal_status,
        })
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


async def _comment_states_at(
    db: AsyncSession,
    post_id: uuid.UUID,
    event_at,
    *,
    include_deleted: bool,
) -> tuple[list[CommentRevision], dict[uuid.UUID, User]]:
    rows = (
        await db.execute(
            select(CommentRevision)
            .where(
                CommentRevision.post_id == post_id,
                CommentRevision.event_at <= event_at,
            )
            .order_by(CommentRevision.comment_id, desc(CommentRevision.version))
        )
    ).scalars().all()
    latest: dict[uuid.UUID, CommentRevision] = {}
    for row in rows:
        latest.setdefault(row.comment_id, row)
    comments = [
        row
        for row in latest.values()
        if include_deleted or row.lifecycle_event != "deleted"
    ]
    comments.sort(key=lambda row: (row.source_created_at, str(row.comment_id)))
    author_ids = list({row.user_id for row in comments})
    authors = (
        await db.execute(select(User).where(User.id.in_(author_ids)))
    ).scalars().all() if author_ids else []
    return comments, {author.id: author for author in authors}


def _revision_comments(
    comments: list[CommentRevision],
    author_map: dict[uuid.UUID, User],
) -> list[dict[str, Any]]:
    return [{
        "id": str(comment.comment_id),
        "content_number": _comment_number(comment),
        "content_type": "대댓글" if comment.parent_id else "댓글",
        "content": comment.content,
        "lifecycle_event": comment.lifecycle_event,
        "event_ip": comment.event_ip,
        "created_at": comment.source_created_at.isoformat(),
        "author": {
            "id": str(comment.user_id),
            "username": author_map[comment.user_id].username if comment.user_id in author_map else "알 수 없음",
            "nickname": author_map[comment.user_id].nickname if comment.user_id in author_map else None,
        },
    } for comment in comments]


def _latest_revision_map(rows: list[Any], target_attribute: str) -> dict[uuid.UUID, Any]:
    latest: dict[uuid.UUID, Any] = {}
    for row in rows:
        target_id = getattr(row, target_attribute)
        current = latest.get(target_id)
        if current is None or row.version > current.version:
            latest[target_id] = row
    return latest


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
        comments, comment_authors = await _comment_states_at(
            db,
            post_revision.post_id,
            post_revision.event_at,
            include_deleted=post_revision.lifecycle_event == "deleted",
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
            "comments": _revision_comments(comments, comment_authors),
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
    comments, comment_authors = await _comment_states_at(
        db,
        comment_revision.post_id,
        comment_revision.event_at,
        include_deleted=False,
    )
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
            "location": source_post.location if source_post else None,
            "visibility": source_post.visibility if source_post else None,
            "media": source_post.media_manifest if source_post else [],
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
        "comments": _revision_comments(comments, comment_authors),
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
    target_user_id = revision.user_id
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
    withdrawal = (
        await db.execute(
            select(WithdrawnAccount).where(
                WithdrawnAccount.user_id == target_user_id
            )
        )
    ).scalar_one_or_none()
    if withdrawal:
        if enabled:
            withdrawal.legal_hold = True
        else:
            held_post = await db.scalar(
                select(PostRevision.id)
                .where(
                    PostRevision.user_id == target_user_id,
                    PostRevision.legal_hold.is_(True),
                )
                .limit(1)
            )
            held_comment = await db.scalar(
                select(CommentRevision.id)
                .where(
                    CommentRevision.user_id == target_user_id,
                    CommentRevision.legal_hold.is_(True),
                )
                .limit(1)
            )
            withdrawal.legal_hold = bool(held_post or held_comment)
    await db.commit()
    return ApiResponse.ok({"revision_id": str(revision_id), "legal_hold": enabled})


@router.patch("/withdrawals/{user_id}/legal-hold", summary="탈퇴 계정 법적 보존 설정")
async def set_withdrawal_legal_hold(
    user_id: uuid.UUID,
    enabled: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict[str, Any]]:
    withdrawal = (
        await db.execute(
            select(WithdrawnAccount).where(WithdrawnAccount.user_id == user_id)
        )
    ).scalar_one_or_none()
    if not withdrawal:
        raise NotFoundException("탈퇴 계정")
    withdrawal.legal_hold = enabled
    await db.commit()
    return ApiResponse.ok({
        "user_id": str(user_id),
        "legal_hold": enabled,
    })


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
            Comment.post_id.label("post_id"),
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
        CommentRevision.post_id.label("post_id"),
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
    post_ids = [row.id for row in posts]
    comment_ids = [row.id for row in comments]
    post_revision_counts = dict((
        await db.execute(
            select(PostRevision.post_id, func.count(PostRevision.id))
            .where(PostRevision.post_id.in_(post_ids))
            .group_by(PostRevision.post_id)
        )
    ).all()) if post_ids else {}
    comment_revision_counts = dict((
        await db.execute(
            select(CommentRevision.comment_id, func.count(CommentRevision.id))
            .where(CommentRevision.comment_id.in_(comment_ids))
            .group_by(CommentRevision.comment_id)
        )
    ).all()) if comment_ids else {}
    post_revisions = (
        await db.execute(
            select(PostRevision).where(PostRevision.post_id.in_(post_ids))
        )
    ).scalars().all() if post_ids else []
    comment_revisions = (
        await db.execute(
            select(CommentRevision).where(CommentRevision.comment_id.in_(comment_ids))
        )
    ).scalars().all() if comment_ids else []
    latest_post_revisions = _latest_revision_map(post_revisions, "post_id")
    latest_comment_revisions = _latest_revision_map(
        comment_revisions,
        "comment_id",
    )
    post_media_res = (
        await db.execute(
            select(PostMedia).where(PostMedia.post_id.in_(post_ids)).order_by(PostMedia.order)
        )
    ).scalars().all() if post_ids else []
    post_media_map: dict[uuid.UUID, list[dict[str, Any]]] = {}
    for pm in post_media_res:
        post_media_map.setdefault(pm.post_id, []).append({
            "id": str(pm.id),
            "media_url": pm.media_url,
            "detail_media_url": pm.detail_media_url or pm.media_url,
            "media_type": pm.media_type,
            "order": pm.order,
        })

    account_events = (
        await db.execute(
            select(AuditEvent)
            .where(
                AuditEvent.user_id == user_id,
                AuditEvent.event_type.in_([
                    "signup",
                    "withdrawal_requested",
                    "withdrawal_cancelled",
                ]),
            )
            .order_by(desc(AuditEvent.created_at))
            .limit(50)
        )
    ).scalars().all()
    return ApiResponse.ok({
        "user": {"id": str(user.id), "username": user.username, "nickname": user.nickname},
        "account_events": [{
            "id": str(event.id),
            "event_type": event.event_type,
            "ip_address": event.ip_address,
            "created_at": event.created_at.isoformat(),
        } for event in account_events],
        "posts": [{
            "id": str(row.id),
            "revision_id": str(row.revision_id) if row.revision_id else None,
            "content_number": f"P-{row.display_number:06d}" if row.display_number else None,
            "content_type": "삭제 게시물" if row.deleted else "게시물",
            "board_type": row.board_type,
            "board_name": row.board_name,
            "board_label": row.board_name or ("익명게시판" if row.board_type == "anonymous" else (row.board_type or "피드")),
            "title": row.title,
            "caption": row.caption,
            "display_text": row.title if row.title else row.caption,
            "media": post_media_map.get(row.id, []) if not row.deleted else (
                latest_post_revisions[row.id].media_manifest if row.id in latest_post_revisions else []
            ),
            "created_at": row.created_at.isoformat(),
            "deleted": row.deleted,
            "revision_count": post_revision_counts.get(row.id, 0),
            "latest_event_type": latest_post_revisions[row.id].lifecycle_event if row.id in latest_post_revisions else None,
            "latest_event_ip": latest_post_revisions[row.id].event_ip if row.id in latest_post_revisions else None,
            "latest_event_at": latest_post_revisions[row.id].event_at.isoformat() if row.id in latest_post_revisions else None,
            "latest_revision_id": str(latest_post_revisions[row.id].id) if row.id in latest_post_revisions else None,
        } for row in posts],
        "comments": [{
            "id": str(row.id),
            "post_id": str(row.post_id),
            "revision_id": str(row.revision_id) if row.revision_id else None,
            "content_number": (
                f"P-{row.post_display_number:06d}-C-{row.parent_display_number:03d}-R-{row.display_number:03d}"
                if row.parent_display_number
                else f"P-{row.post_display_number:06d}-C-{row.display_number:03d}"
            ) if row.post_display_number and row.display_number else None,
            "content_type": ("삭제 대댓글" if row.deleted else "대댓글") if row.parent_id else ("삭제 댓글" if row.deleted else "댓글"),
            "board_label": row.board_name or ("익명게시판" if row.board_type == "anonymous" else (row.board_type or "피드")),
            "content": row.content,
            "display_text": row.content,
            "created_at": row.created_at.isoformat(),
            "deleted": row.deleted,
            "revision_count": comment_revision_counts.get(row.id, 0),
            "latest_event_type": latest_comment_revisions[row.id].lifecycle_event if row.id in latest_comment_revisions else None,
            "latest_event_ip": latest_comment_revisions[row.id].event_ip if row.id in latest_comment_revisions else None,
            "latest_event_at": latest_comment_revisions[row.id].event_at.isoformat() if row.id in latest_comment_revisions else None,
            "latest_revision_id": str(latest_comment_revisions[row.id].id) if row.id in latest_comment_revisions else None,
        } for row in comments],
        "pagination": {
            "post_page": post_page,
            "comment_page": comment_page,
            "size": size,
            "posts_has_more": len(post_rows) > size,
            "comments_has_more": len(comment_rows) > size,
        },
    })


@router.get(
    "/content-history/{content_type}/{content_id}",
    summary="관리자 전용 콘텐츠 변경 이력",
)
async def get_content_history(
    content_type: str,
    content_id: uuid.UUID,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[list[dict[str, Any]]]:
    if content_type == "post":
        query = select(PostRevision).where(PostRevision.post_id == content_id)
        total = await db.scalar(
            select(func.count(PostRevision.id)).where(PostRevision.post_id == content_id)
        )
        rows = (
            await db.execute(
                query.order_by(desc(PostRevision.version))
                .offset((page - 1) * size)
                .limit(size)
            )
        ).scalars().all()
        data = [{
            "revision_id": str(row.id),
            "target_id": str(row.post_id),
            "content_type": "post",
            "version": row.version,
            "lifecycle_event": row.lifecycle_event,
            "event_at": row.event_at.isoformat(),
            "event_ip": row.event_ip,
            "display_text": row.title or row.caption,
        } for row in rows]
    elif content_type == "comment":
        query = select(CommentRevision).where(CommentRevision.comment_id == content_id)
        total = await db.scalar(
            select(func.count(CommentRevision.id)).where(
                CommentRevision.comment_id == content_id
            )
        )
        rows = (
            await db.execute(
                query.order_by(desc(CommentRevision.version))
                .offset((page - 1) * size)
                .limit(size)
            )
        ).scalars().all()
        data = [{
            "revision_id": str(row.id),
            "target_id": str(row.comment_id),
            "content_type": "comment",
            "version": row.version,
            "lifecycle_event": row.lifecycle_event,
            "event_at": row.event_at.isoformat(),
            "event_ip": row.event_ip,
            "display_text": row.content,
        } for row in rows]
    else:
        raise BadRequestException("콘텐츠 종류는 post 또는 comment여야 합니다.")
    return ApiResponse.paginated(data=data, total=total or 0)


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
    withdrawal_rows = []
    if users:
        withdrawal_rows = (
            await db.execute(
                select(WithdrawnAccount).where(
                    WithdrawnAccount.user_id.in_([user.id for user in users])
                )
            )
        ).scalars().all()
    withdrawals_by_user = {row.user_id: row for row in withdrawal_rows}

    user_list = []
    for u in users:
        withdrawal = withdrawals_by_user.get(u.id)
        if withdrawal is None:
            withdrawal_status = None
        elif withdrawal.personal_data_purged_at is not None:
            withdrawal_status = "purged"
        elif withdrawal.finalized_at is not None:
            withdrawal_status = "finalized"
        else:
            withdrawal_status = "pending"

        user_list.append({
            "id": str(u.id),
            "username": u.username,
            "nickname": u.nickname,
            "email": u.email,
            "full_name": u.full_name,
            "profile_image_url": u.profile_image_url,
            "is_active": u.is_active,
            "is_admin": u.is_admin,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "withdrawal_status": withdrawal_status,
            "withdrawal_requested_at": (
                withdrawal.requested_at.isoformat() if withdrawal else None
            ),
            "withdrawal_cancelable_until": (
                withdrawal.cancelable_until.isoformat() if withdrawal else None
            ),
            "withdrawal_finalized_at": (
                withdrawal.finalized_at.isoformat()
                if withdrawal and withdrawal.finalized_at
                else None
            ),
            "personal_data_retention_until": (
                withdrawal.retention_until.isoformat() if withdrawal else None
            ),
            "personal_data_legal_hold": (
                withdrawal.legal_hold if withdrawal else False
            ),
            "personal_data_purged_at": (
                withdrawal.personal_data_purged_at.isoformat()
                if withdrawal and withdrawal.personal_data_purged_at
                else None
            ),
        })
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
    withdrawal = (
        await db.execute(
            select(WithdrawnAccount).where(WithdrawnAccount.user_id == user_id)
        )
    ).scalar_one_or_none()
    if withdrawal:
        raise BadRequestException(
            "탈퇴 대기 또는 최종 탈퇴 계정은 관리자 활성화 기능으로 복구할 수 없습니다."
        )

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
    scope: str = Query("all", pattern="^(all|feed|community)$"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[list[dict[str, Any]]]:
    scope_clause = (
        Post.board_type.is_(None) if scope == "feed"
        else Post.board_type.is_not(None) if scope == "community"
        else True
    )
    total = await db.scalar(select(func.count(Post.id)).where(scope_clause))
    stmt = select(Post).where(scope_clause).order_by(desc(Post.created_at)).offset((page - 1) * size).limit(size)
    res = await db.execute(stmt)
    posts = res.scalars().all()

    post_list = []
    for p in posts:
        # Load user for post
        user_stmt = select(User).where(User.id == p.user_id)
        user_res = await db.execute(user_stmt)
        author = user_res.scalar_one_or_none()

        board_name = None
        if p.board_id:
            board_name = await db.scalar(select(CommunityBoard.name).where(CommunityBoard.id == p.board_id))

        # Load media for post
        from app.modules.posts.models import PostMedia
        media_stmt = select(PostMedia).where(PostMedia.post_id == p.id).order_by(PostMedia.order)
        media_res = await db.execute(media_stmt)
        medias = media_res.scalars().all()

        post_list.append({
            "id": str(p.id),
            "content_number": f"P-{p.display_number:06d}" if p.display_number else None,
            "title": p.title,
            "board_type": p.board_type,
            "board_name": board_name,
            "moderation_hidden": p.moderation_hidden,
            "caption": p.caption,
            "media": [
                {
                    "id": str(m.id),
                    "media_url": m.media_url,
                    "detail_media_url": m.detail_media_url or m.media_url,
                    "media_type": m.media_type,
                    "order": m.order,
                }
                for m in medias
            ],
            "author": {
                "id": str(author.id) if author else "",
                "username": author.username if author else "알 수 없음",
                "nickname": author.nickname if author else "알 수 없음",
                "is_admin": author.is_admin if author else False,
            },
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })

    return ApiResponse.paginated(data=post_list, total=total or 0)


@router.patch("/posts/{post_id}/moderation-visibility", summary="관리자 권한 게시물 숨김 상태 변경")
async def set_admin_post_moderation_visibility(
    post_id: uuid.UUID,
    hidden: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict[str, Any]]:
    post = await db.scalar(select(Post).where(Post.id == post_id).with_for_update())
    if not post:
        raise NotFoundException("게시물")

    post.moderation_hidden = hidden
    await db.commit()
    return ApiResponse.ok({
        "post_id": str(post.id),
        "moderation_hidden": post.moderation_hidden,
    })


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
