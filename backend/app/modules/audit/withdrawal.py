from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditEvent, CommentRevision, PostRevision, WithdrawnAccount
from app.modules.auth.models import User
from app.modules.posts.models import PostMedia


WITHDRAWAL_GRACE_DAYS = 7
PERSONAL_DATA_RETENTION_DAYS = 365


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def is_cancelable(
    withdrawal: WithdrawnAccount,
    *,
    now: datetime | None = None,
) -> bool:
    current = now or utc_now()
    return (
        withdrawal.finalized_at is None
        and withdrawal.personal_data_purged_at is None
        and current < withdrawal.cancelable_until
    )


async def get_withdrawal(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> WithdrawnAccount | None:
    query = select(WithdrawnAccount).where(WithdrawnAccount.user_id == user_id)
    if for_update:
        query = query.with_for_update()
    return (await db.execute(query)).scalar_one_or_none()


async def finalize_if_expired(
    db: AsyncSession,
    withdrawal: WithdrawnAccount,
    *,
    now: datetime | None = None,
) -> bool:
    current = now or utc_now()
    if withdrawal.finalized_at is not None or current < withdrawal.cancelable_until:
        return False
    withdrawal.finalized_at = withdrawal.cancelable_until
    withdrawal.retention_until = withdrawal.cancelable_until + timedelta(
        days=PERSONAL_DATA_RETENTION_DAYS
    )
    await db.flush()
    return True


async def process_expired_withdrawals(
    db: AsyncSession,
    *,
    now: datetime | None = None,
) -> dict[str, object]:
    current = now or utc_now()
    pending = (
        await db.execute(
            select(WithdrawnAccount)
            .where(
                WithdrawnAccount.finalized_at.is_(None),
                WithdrawnAccount.cancelable_until <= current,
            )
            .with_for_update()
        )
    ).scalars().all()
    for withdrawal in pending:
        await finalize_if_expired(db, withdrawal, now=current)

    due = (
        await db.execute(
            select(WithdrawnAccount)
            .where(
                WithdrawnAccount.finalized_at.is_not(None),
                WithdrawnAccount.personal_data_purged_at.is_(None),
                WithdrawnAccount.retention_until <= current,
                WithdrawnAccount.legal_hold.is_(False),
            )
            .with_for_update()
        )
    ).scalars().all()
    profile_urls: list[str] = []
    for withdrawal in due:
        user = (
            await db.execute(
                select(User)
                .where(User.id == withdrawal.user_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if user:
            if user.profile_image_url:
                profile_urls.append(user.profile_image_url)
            user.username = f"wd_{user.id.hex[:27]}"
            user.email = f"{user.id.hex}@withdrawn.invalid"
            user.full_name = "탈퇴한 사용자"
            user.nickname = None
            user.age = None
            user.gender = None
            user.sexual_orientation = None
            user.sexual_orientations = None
            user.height = None
            user.body_type = None
            user.bio = None
            user.profile_image_url = None
            user.google_id = None
            user.hashed_password = None
            user.profile_visibility = "private"
            user.is_private = True
            user.allow_message_requests = False
            user.is_active = False

        await db.execute(
            delete(AuditEvent).where(
                AuditEvent.user_id == withdrawal.user_id,
                AuditEvent.legal_hold.is_(False),
            )
        )
        await db.execute(
            delete(PostRevision).where(
                PostRevision.user_id == withdrawal.user_id,
                PostRevision.legal_hold.is_(False),
            )
        )
        await db.execute(
            delete(CommentRevision).where(
                CommentRevision.user_id == withdrawal.user_id,
                CommentRevision.legal_hold.is_(False),
            )
        )
        withdrawal.personal_data_purged_at = current

    await db.flush()
    safe_profile_urls: list[str] = []
    for profile_url in set(profile_urls):
        used_by_user = await db.scalar(
            select(User.id).where(User.profile_image_url == profile_url).limit(1)
        )
        used_by_post = await db.scalar(
            select(PostMedia.id).where(PostMedia.media_url == profile_url).limit(1)
        )
        used_by_revision = await db.scalar(
            select(PostRevision.id)
            .where(
                PostRevision.media_manifest.contains(
                    [{"media_url": profile_url}]
                )
            )
            .limit(1)
        )
        if not used_by_user and not used_by_post and not used_by_revision:
            safe_profile_urls.append(profile_url)

    await db.commit()
    return {
        "finalized_accounts": len(pending),
        "purged_accounts": len(due),
        "profile_urls": safe_profile_urls,
    }
