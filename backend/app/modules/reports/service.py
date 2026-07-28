import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.exceptions import BadRequestException, ConflictException, NotFoundException
from app.modules.audit.models import AuditEvent, CommentRevision, PostRevision
from app.modules.auth.models import User
from app.modules.community.models import CommunityBoard
from app.modules.posts.models import Comment, Post
from app.modules.reports.models import HiddenContent, Report
from app.modules.reports.schemas import ReportCreate


REPORTS_PER_DAY = 10


def retention_deadline() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=365)


async def _post_snapshot(db: AsyncSession, post: Post) -> dict:
    board_name = None
    if post.board_id:
        board_name = await db.scalar(select(CommunityBoard.name).where(CommunityBoard.id == post.board_id))
    revision = (
        await db.execute(
            select(PostRevision)
            .where(PostRevision.post_id == post.id)
            .order_by(PostRevision.event_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return {
        "target_type": "post",
        "post_id": str(post.id),
        "display_number": post.display_number,
        "title": post.title,
        "caption": post.caption,
        "board_type": post.board_type or "feed",
        "board_id": str(post.board_id) if post.board_id else None,
        "board_name": board_name,
        "visibility": post.visibility,
        "author": {
            "id": str(post.user.id),
            "username": post.user.username,
            "nickname": post.user.nickname,
            "full_name": post.user.full_name,
        },
        "author_id": str(post.user_id),
        "content_ip": revision.event_ip if revision else None,
        "media": [
            {
                "url": media.media_url,
                "detail_url": media.detail_media_url,
                "type": media.media_type,
                "order": media.order,
            }
            for media in post.media
        ],
        "created_at": post.created_at.isoformat(),
        "updated_at": post.updated_at.isoformat(),
    }


async def build_snapshot(db: AsyncSession, target_type: str, target_id: uuid.UUID) -> tuple[uuid.UUID, dict]:
    if target_type == "post":
        post = (
            await db.execute(
                select(Post)
                .options(selectinload(Post.user), selectinload(Post.media))
                .where(Post.id == target_id)
            )
        ).scalar_one_or_none()
        if not post:
            raise NotFoundException("Post")
        return post.user_id, await _post_snapshot(db, post)

    if target_type == "comment":
        comment = (
            await db.execute(
                select(Comment)
                .options(
                    selectinload(Comment.user),
                    selectinload(Comment.post).selectinload(Post.user),
                    selectinload(Comment.post).selectinload(Post.media),
                )
                .where(Comment.id == target_id)
            )
        ).scalar_one_or_none()
        if not comment:
            raise NotFoundException("Comment")
        revision = (
            await db.execute(
                select(CommentRevision)
                .where(CommentRevision.comment_id == comment.id)
                .order_by(CommentRevision.event_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        snapshot = await _post_snapshot(db, comment.post)
        snapshot.update(
            {
                "target_type": "comment",
                "comment_id": str(comment.id),
                "comment_display_number": comment.display_number,
                "parent_id": str(comment.parent_id) if comment.parent_id else None,
                "comment_content": comment.content,
                "comment_author": {
                    "id": str(comment.user.id),
                    "username": comment.user.username,
                    "nickname": comment.user.nickname,
                },
                "comment_ip": revision.event_ip if revision else None,
                "comment_created_at": comment.created_at.isoformat(),
            }
        )
        return comment.user_id, snapshot

    user = await db.scalar(select(User).where(User.id == target_id))
    if not user:
        raise NotFoundException("User")
    signup = (
        await db.execute(
            select(AuditEvent)
            .where(AuditEvent.user_id == user.id, AuditEvent.event_type == "signup")
            .order_by(AuditEvent.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return user.id, {
        "target_type": "profile",
        "profile_id": str(user.id),
        "username": user.username,
        "nickname": user.nickname,
        "full_name": user.full_name,
        "bio": user.bio,
        "profile_image_url": user.profile_image_url,
        "signup_ip": signup.ip_address if signup else None,
        "created_at": user.created_at.isoformat(),
    }


async def create_report(
    db: AsyncSession,
    *,
    reporter: User,
    data: ReportCreate,
    reporter_ip: str | None,
) -> Report:
    target_user_id, snapshot = await build_snapshot(db, data.target_type, data.target_id)
    if target_user_id == reporter.id:
        raise BadRequestException("본인의 콘텐츠나 프로필은 신고할 수 없습니다.")

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    count = await db.scalar(
        select(func.count(Report.id)).where(
            Report.reporter_id == reporter.id, Report.created_at >= since
        )
    )
    if (count or 0) >= REPORTS_PER_DAY:
        raise BadRequestException("24시간 신고 한도(10건)를 초과했습니다.")

    report = Report(
        reporter_id=reporter.id,
        target_type=data.target_type,
        target_id=data.target_id,
        target_user_id=target_user_id,
        reason_code=data.reason_code,
        detail=(data.detail or "").strip() or None,
        priority=1 if data.reason_code in {"illegal", "privacy"} else 0,
        snapshot=snapshot,
        reporter_ip=reporter_ip,
        retention_until=retention_deadline(),
    )
    db.add(report)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictException("이미 신고한 대상입니다.")
    await db.refresh(report)
    return report


async def hide_report_target(db: AsyncSession, *, user: User, report_id: uuid.UUID) -> None:
    report = await db.scalar(
        select(Report).where(Report.id == report_id, Report.reporter_id == user.id)
    )
    if not report:
        raise NotFoundException("Report")
    existing = await db.scalar(
        select(HiddenContent).where(
            HiddenContent.user_id == user.id,
            HiddenContent.target_type == report.target_type,
            HiddenContent.target_id == report.target_id,
        )
    )
    if not existing:
        db.add(
            HiddenContent(
                user_id=user.id,
                target_type=report.target_type,
                target_id=report.target_id,
            )
        )
        await db.commit()
