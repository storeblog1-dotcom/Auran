import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.exceptions import (
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.core.security import hash_password, verify_password
from app.modules.auth.models import User
from app.modules.posts.models import Post
from app.modules.users.models import Follow
from app.modules.users.schemas import (
    FollowStatusResponse,
    PasswordChangeRequest,
    UserProfileResponse,
    UserSummaryResponse,
    UserUpdateProfileRequest,
)


async def get_user_by_username(db: AsyncSession, username: str) -> User:
    """username으로 사용자를 조회하며 없으면 NotFoundException을 발생시킵니다."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("User")
    return user


async def get_user_profile(
    db: AsyncSession,
    target_username: str,
    current_user: User | None = None,
) -> UserProfileResponse:
    """사용자의 상세 프로필 정보를 조회합니다."""
    target_user = await get_user_by_username(db, target_username)
    if target_user.is_admin and (
        current_user is None or not current_user.is_admin
    ):
        raise ForbiddenException("관리자 계정의 프로필은 공개되지 않습니다.")

    # 게시글 수, 팔로워 수 및 팔로잉 수 구하기
    posts_count_res = await db.execute(
        select(func.count(Post.id)).where(Post.user_id == target_user.id)
    )
    posts_count = posts_count_res.scalar() or 0

    followers_count_res = await db.execute(
        select(func.count(Follow.id)).where(Follow.following_id == target_user.id)
    )
    followers_count = followers_count_res.scalar() or 0

    following_count_res = await db.execute(
        select(func.count(Follow.id)).where(Follow.follower_id == target_user.id)
    )
    following_count = following_count_res.scalar() or 0

    # 본인 여부 및 팔로우 여부 확인
    is_me = False
    is_following = False
    is_mutual_following = False

    if current_user:
        if current_user.id == target_user.id:
            is_me = True
        else:
            follow_res = await db.execute(
                select(Follow).where(
                    Follow.follower_id == current_user.id,
                    Follow.following_id == target_user.id,
                )
            )
            is_following = follow_res.scalar_one_or_none() is not None

            if is_following:
                reverse_follow_res = await db.execute(
                    select(Follow).where(
                        Follow.follower_id == target_user.id,
                        Follow.following_id == current_user.id,
                    )
                )
                is_mutual_following = reverse_follow_res.scalar_one_or_none() is not None

    can_view_sensitive_profile = (
        is_me
        or (current_user is not None and current_user.is_admin)
        or target_user.profile_visibility == "public"
        or (
            target_user.profile_visibility == "mutual_followers"
            and is_mutual_following
        )
    )

    return UserProfileResponse(
        id=target_user.id,
        username=target_user.username,
        nickname=target_user.nickname,
        full_name=target_user.full_name,
        bio=target_user.bio,
        profile_image_url=target_user.profile_image_url,
        age=target_user.age if can_view_sensitive_profile else None,
        gender=target_user.gender if can_view_sensitive_profile else None,
        sexual_orientation=target_user.sexual_orientation if can_view_sensitive_profile else None,
        height=target_user.height if can_view_sensitive_profile else None,
        body_type=target_user.body_type if can_view_sensitive_profile else None,
        profile_visibility=target_user.profile_visibility,
        posts_count=posts_count,
        followers_count=followers_count,
        following_count=following_count,
        is_following=is_following,
        is_mutual_following=is_mutual_following,
        is_me=is_me,
        is_admin=target_user.is_admin,
        created_at=target_user.created_at,
    )


async def update_user_profile(
    db: AsyncSession,
    current_user: User,
    data: UserUpdateProfileRequest,
) -> User:
    """로그인한 사용자의 프로필 정보를 수정합니다."""
    if data.nickname is not None:
        clean_nickname = data.nickname.strip()
        nickname_exists = await db.execute(
            select(User.id).where(
                func.lower(User.nickname) == clean_nickname.lower(),
                User.id != current_user.id,
            )
        )
        if nickname_exists.scalar_one_or_none():
            raise ConflictException("이미 사용 중인 닉네임입니다.")
        current_user.nickname = clean_nickname
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.bio is not None:
        current_user.bio = data.bio
    if data.profile_image_url is not None:
        current_user.profile_image_url = data.profile_image_url

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user


async def change_password(
    db: AsyncSession,
    current_user: User,
    data: PasswordChangeRequest,
) -> None:
    """사용자의 비밀번호를 변경합니다."""
    if not verify_password(data.current_password, current_user.hashed_password):
        raise BadRequestException("현재 비밀번호가 일치하지 않습니다")

    current_user.hashed_password = hash_password(data.new_password)
    db.add(current_user)
    await db.commit()


async def search_users(
    db: AsyncSession,
    query: str,
    current_user: User | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[UserSummaryResponse]:
    """username 또는 full_name 키워드로 사용자를 검색합니다."""
    if not query.strip():
        return []

    pattern = f"%{query.strip()}%"
    stmt = (
        select(User)
        .where(
            User.is_active == True,
            or_(User.username.ilike(pattern), User.full_name.ilike(pattern)),
        )
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    users = result.scalars().all()

    if not users:
        return []

    # 현재 로그인 유저가 있는 경우 팔로우 여부 일괄 확인
    following_ids = set()
    if current_user:
        user_ids = [u.id for u in users]
        follow_stmt = select(Follow.following_id).where(
            Follow.follower_id == current_user.id,
            Follow.following_id.in_(user_ids),
        )
        follow_res = await db.execute(follow_stmt)
        following_ids = set(follow_res.scalars().all())

    summaries = []
    for user in users:
        summaries.append(
            UserSummaryResponse(
                id=user.id,
                username=user.username,
                nickname=user.nickname,
                full_name=user.full_name,
                profile_image_url=user.profile_image_url,
                is_following=(user.id in following_ids),
                is_admin=user.is_admin,
            )
        )
    return summaries


async def follow_user(
    db: AsyncSession,
    current_user: User,
    target_username: str,
) -> FollowStatusResponse:
    """대상 사용자를 팔로우합니다."""
    target_user = await get_user_by_username(db, target_username)

    if current_user.id == target_user.id:
        raise BadRequestException("자기 자신을 팔로우할 수 없습니다")

    # 기존 팔로우 여부 확인
    existing = await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.following_id == target_user.id,
        )
    )
    if not existing.scalar_one_or_none():
        new_follow = Follow(follower_id=current_user.id, following_id=target_user.id)
        db.add(new_follow)
        await db.commit()

        from app.modules.notifications.models import NotificationType
        from app.modules.notifications.service import create_notification

        await create_notification(
            db,
            recipient_id=target_user.id,
            sender_id=current_user.id,
            type=NotificationType.FOLLOW.value,
            message=f"{current_user.nickname or current_user.username}님이 회원님을 팔로우하기 시작했습니다.",
        )

    followers_count_res = await db.execute(
        select(func.count(Follow.id)).where(Follow.following_id == target_user.id)
    )
    followers_count = followers_count_res.scalar() or 0

    return FollowStatusResponse(is_following=True, followers_count=followers_count)


async def unfollow_user(
    db: AsyncSession,
    current_user: User,
    target_username: str,
) -> FollowStatusResponse:
    """대상 사용자를 언팔로우합니다."""
    target_user = await get_user_by_username(db, target_username)

    if current_user.id == target_user.id:
        raise BadRequestException("자기 자신을 언팔로우할 수 없습니다")

    existing = await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.following_id == target_user.id,
        )
    )
    follow_obj = existing.scalar_one_or_none()
    if follow_obj:
        await db.delete(follow_obj)
        await db.commit()

    followers_count_res = await db.execute(
        select(func.count(Follow.id)).where(Follow.following_id == target_user.id)
    )
    followers_count = followers_count_res.scalar() or 0

    return FollowStatusResponse(is_following=False, followers_count=followers_count)


async def get_followers(
    db: AsyncSession,
    username: str,
    current_user: User | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[UserSummaryResponse]:
    """해당 사용자의 팔로워 목록을 조회합니다."""
    target_user = await get_user_by_username(db, username)

    stmt = (
        select(User)
        .join(Follow, Follow.follower_id == User.id)
        .where(Follow.following_id == target_user.id)
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    followers = result.scalars().all()

    if not followers:
        return []

    following_ids = set()
    if current_user:
        user_ids = [u.id for u in followers]
        follow_stmt = select(Follow.following_id).where(
            Follow.follower_id == current_user.id,
            Follow.following_id.in_(user_ids),
        )
        follow_res = await db.execute(follow_stmt)
        following_ids = set(follow_res.scalars().all())

    return [
        UserSummaryResponse(
            id=u.id,
            username=u.username,
            nickname=u.nickname,
            full_name=u.full_name,
            profile_image_url=u.profile_image_url,
            is_following=(u.id in following_ids),
            is_admin=u.is_admin,
        )
        for u in followers
    ]


async def get_following(
    db: AsyncSession,
    username: str,
    current_user: User | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[UserSummaryResponse]:
    """해당 사용자가 팔로잉 중인 사용자 목록을 조회합니다."""
    target_user = await get_user_by_username(db, username)

    stmt = (
        select(User)
        .join(Follow, Follow.following_id == User.id)
        .where(Follow.follower_id == target_user.id)
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    following_users = result.scalars().all()

    if not following_users:
        return []

    following_ids = set()
    if current_user:
        user_ids = [u.id for u in following_users]
        follow_stmt = select(Follow.following_id).where(
            Follow.follower_id == current_user.id,
            Follow.following_id.in_(user_ids),
        )
        follow_res = await db.execute(follow_stmt)
        following_ids = set(follow_res.scalars().all())

    return [
        UserSummaryResponse(
            id=u.id,
            username=u.username,
            nickname=u.nickname,
            full_name=u.full_name,
            profile_image_url=u.profile_image_url,
            is_following=(u.id in following_ids),
            is_admin=u.is_admin,
        )
        for u in following_users
    ]


async def get_mutual_followers(
    db: AsyncSession,
    current_user: User,
    limit: int = 50,
    offset: int = 0,
) -> list[UserSummaryResponse]:
    """현재 사용자와 서로 팔로우(맞팔로우) 중인 유저 목록 조회"""
    f1 = select(Follow.following_id).where(Follow.follower_id == current_user.id)
    f2 = select(Follow.follower_id).where(Follow.following_id == current_user.id)

    stmt = (
        select(User)
        .where(
            User.id.in_(f1),
            User.id.in_(f2),
            User.is_active == True,
        )
        .limit(limit)
        .offset(offset)
    )
    res = await db.execute(stmt)
    users = res.scalars().all()

    return [
        UserSummaryResponse(
            id=u.id,
            username=u.username,
            nickname=u.nickname,
            full_name=u.full_name,
            profile_image_url=u.profile_image_url,
            is_following=True,
            is_admin=u.is_admin,
        )
        for u in users
    ]
