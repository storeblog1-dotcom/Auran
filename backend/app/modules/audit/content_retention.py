from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User  # Ensures ORM relationship targets are registered.
from app.modules.audit.models import AuditEvent, CommentRevision, PostRevision
from app.modules.community.models import CommunityBoard
from app.modules.posts.models import Comment, Post, PostMedia


RETENTION_DAYS = 365


def retention_deadline(event_at: datetime | None = None) -> datetime:
    base = event_at or datetime.now(timezone.utc)
    return base + timedelta(days=RETENTION_DAYS)


async def preserve_post(
    db: AsyncSession,
    post: Post,
    *,
    lifecycle_event: str,
    ip_address: str | None,
) -> PostRevision:
    version = (
        await db.scalar(
            select(func.coalesce(func.max(PostRevision.version), 0)).where(
                PostRevision.post_id == post.id
            )
        )
        or 0
    ) + 1
    media = (
        await db.execute(
            select(PostMedia)
            .where(PostMedia.post_id == post.id)
            .order_by(PostMedia.order)
        )
    ).scalars().all()
    board_name = None
    if post.board_id:
        board_name = await db.scalar(
            select(CommunityBoard.name).where(CommunityBoard.id == post.board_id)
        )
    now = datetime.now(timezone.utc)
    revision = PostRevision(
        post_id=post.id,
        version=version,
        lifecycle_event=lifecycle_event,
        user_id=post.user_id,
        display_number=post.display_number,
        title=post.title,
        board_type=post.board_type,
        board_id=post.board_id,
        board_name=board_name,
        caption=post.caption,
        location=post.location,
        visibility=post.visibility,
        media_manifest=[
            {
                "id": str(item.id),
                "media_url": item.media_url,
                "detail_media_url": item.detail_media_url or item.media_url,
                "media_type": item.media_type,
                "order": item.order,
            }
            for item in media
        ],
        source_created_at=post.created_at,
        source_updated_at=post.updated_at,
        event_ip=ip_address,
        event_at=now,
        retention_until=retention_deadline(now),
    )
    db.add(revision)
    await db.flush()
    return revision


async def preserve_comment(
    db: AsyncSession,
    comment: Comment,
    *,
    lifecycle_event: str,
    ip_address: str | None,
) -> CommentRevision:
    version = (
        await db.scalar(
            select(func.coalesce(func.max(CommentRevision.version), 0)).where(
                CommentRevision.comment_id == comment.id
            )
        )
        or 0
    ) + 1
    post_display_number = await db.scalar(
        select(Post.display_number).where(Post.id == comment.post_id)
    )
    parent_display_number = None
    if comment.parent_id:
        parent_display_number = await db.scalar(
            select(Comment.display_number).where(Comment.id == comment.parent_id)
        )
    now = datetime.now(timezone.utc)
    revision = CommentRevision(
        comment_id=comment.id,
        post_id=comment.post_id,
        version=version,
        lifecycle_event=lifecycle_event,
        user_id=comment.user_id,
        post_display_number=post_display_number,
        display_number=comment.display_number,
        parent_id=comment.parent_id,
        parent_display_number=parent_display_number,
        reply_to_user_id=comment.reply_to_user_id,
        reply_to_display_name=comment.reply_to_display_name,
        content=comment.content,
        source_created_at=comment.created_at,
        source_updated_at=comment.updated_at,
        event_ip=ip_address,
        event_at=now,
        retention_until=retention_deadline(now),
    )
    db.add(revision)
    await db.flush()
    return revision


async def preserve_post_comments_for_deletion(
    db: AsyncSession,
    post_id: uuid.UUID,
    *,
    ip_address: str | None,
) -> None:
    comments = (
        await db.execute(
            select(Comment)
            .where(Comment.post_id == post_id)
            .order_by(Comment.created_at, Comment.id)
            .with_for_update()
        )
    ).scalars().all()
    for comment in comments:
        await preserve_comment(
            db,
            comment,
            lifecycle_event="deleted",
            ip_address=ip_address,
        )


async def preserve_comment_tree_for_deletion(
    db: AsyncSession,
    root: Comment,
    *,
    ip_address: str | None,
) -> list[CommentRevision]:
    comments = (
        await db.execute(
            select(Comment)
            .where(Comment.post_id == root.post_id)
            .order_by(Comment.created_at, Comment.id)
            .with_for_update()
        )
    ).scalars().all()
    descendant_ids = {root.id}
    changed = True
    while changed:
        changed = False
        for comment in comments:
            if comment.parent_id in descendant_ids and comment.id not in descendant_ids:
                descendant_ids.add(comment.id)
                changed = True
    revisions = []
    for comment in comments:
        if comment.id in descendant_ids:
            revisions.append(
                await preserve_comment(
                    db,
                    comment,
                    lifecycle_event="deleted",
                    ip_address=ip_address,
                )
            )
    return revisions


async def purge_expired_revisions(
    db: AsyncSession, *, now: datetime | None = None
) -> dict[str, int]:
    cutoff = now or datetime.now(timezone.utc)
    audit_result = await db.execute(
        delete(AuditEvent)
        .where(
            AuditEvent.retention_until < cutoff,
            AuditEvent.legal_hold.is_(False),
        )
        .returning(AuditEvent.id)
    )
    comment_result = await db.execute(
        delete(CommentRevision)
        .where(
            CommentRevision.retention_until < cutoff,
            CommentRevision.legal_hold.is_(False),
        )
        .returning(CommentRevision.id)
    )
    post_result = await db.execute(
        delete(PostRevision)
        .where(
            PostRevision.retention_until < cutoff,
            PostRevision.legal_hold.is_(False),
        )
        .returning(PostRevision.id)
    )
    await db.commit()
    return {
        "audit_events": len(audit_result.scalars().all()),
        "comment_revisions": len(comment_result.scalars().all()),
        "post_revisions": len(post_result.scalars().all()),
    }
