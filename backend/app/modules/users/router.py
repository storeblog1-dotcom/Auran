from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.response import ApiResponse
from app.common.exceptions import BadRequestException, NotFoundException
from app.core.database import get_db
from app.modules.auth.dependencies import (
    get_current_active_user,
    get_optional_current_user,
)
from app.modules.auth.models import User
from app.modules.users import service
from app.modules.users.schemas import (
    FollowStatusResponse,
    PasswordChangeRequest,
    UserProfileResponse,
    UserSummaryResponse,
    UserUpdateProfileRequest,
)

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/search",
    response_model=ApiResponse[list[UserSummaryResponse]],
    summary="사용자 검색",
)
async def search_users(
    q: str = Query(..., min_length=1, description="검색 키워드 (username 또는 full_name)"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[UserSummaryResponse]]:
    users = await service.search_users(
        db, query=q, current_user=current_user, limit=limit, offset=offset
    )
    return ApiResponse.ok(users)


@router.get(
    "/me",
    response_model=ApiResponse[UserProfileResponse],
    summary="내 프로필 상세 조회",
)
async def get_my_profile(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[UserProfileResponse]:
    profile = await service.get_user_profile(
        db, target_username=current_user.username, current_user=current_user
    )
    return ApiResponse.ok(profile)


@router.patch(
    "/me",
    response_model=ApiResponse[UserProfileResponse],
    summary="내 프로필 정보 수정",
)
async def update_my_profile(
    body: UserUpdateProfileRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[UserProfileResponse]:
    updated_user = await service.update_user_profile(db, current_user, body)
    profile = await service.get_user_profile(
        db, target_username=updated_user.username, current_user=updated_user
    )
    return ApiResponse.ok(profile)


@router.post(
    "/me/password",
    response_model=ApiResponse[dict],
    summary="비밀번호 변경",
)
async def change_password(
    body: PasswordChangeRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    await service.change_password(db, current_user, body)
    return ApiResponse.ok({"message": "비밀번호가 성공적으로 변경되었습니다"})


@router.get(
    "/me/mutual-followers",
    response_model=ApiResponse[list[UserSummaryResponse]],
    summary="맞팔로우 유저 목록 조회",
)
async def get_mutual_followers(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[UserSummaryResponse]]:
    users = await service.get_mutual_followers(
        db, current_user=current_user, limit=limit, offset=offset
    )
    return ApiResponse.ok(users)


@router.get(
    "/{username}",
    response_model=ApiResponse[UserProfileResponse],
    summary="사용자 프로필 조회",
)
async def get_user_profile(
    username: str,
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[UserProfileResponse]:
    profile = await service.get_user_profile(
        db, target_username=username, current_user=current_user
    )
    return ApiResponse.ok(profile)


@router.post(
    "/{username}/follow",
    response_model=ApiResponse[FollowStatusResponse],
    summary="사용자 팔로우",
)
async def follow_user(
    username: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[FollowStatusResponse]:
    res = await service.follow_user(
        db, current_user=current_user, target_username=username
    )
    return ApiResponse.ok(res)


@router.delete(
    "/{username}/follow",
    response_model=ApiResponse[FollowStatusResponse],
    summary="사용자 언팔로우",
)
async def unfollow_user(
    username: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[FollowStatusResponse]:
    res = await service.unfollow_user(
        db, current_user=current_user, target_username=username
    )
    return ApiResponse.ok(res)


@router.get(
    "/{username}/followers",
    response_model=ApiResponse[list[UserSummaryResponse]],
    summary="팔로워 목록 조회",
)
async def get_followers(
    username: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[UserSummaryResponse]]:
    followers = await service.get_followers(
        db, username=username, current_user=current_user, limit=limit, offset=offset
    )
    return ApiResponse.ok(followers)


@router.get(
    "/{username}/following",
    response_model=ApiResponse[list[UserSummaryResponse]],
    summary="팔로잉 목록 조회",
)
async def get_following(
    username: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[UserSummaryResponse]]:
    following = await service.get_following(
        db, username=username, current_user=current_user, limit=limit, offset=offset
    )
    return ApiResponse.ok(following)


# ─── PRIVACY, FOLLOW REQUESTS & BLOCK ───────────────────────────────────────
from pydantic import BaseModel
from sqlalchemy import select, and_
from app.modules.users.models import FollowRequest, UserBlock, Follow

class PrivacyToggleRequest(BaseModel):
    is_private: bool

class MessageRequestSettingRequest(BaseModel):
    allow_message_requests: bool

@router.patch("/me/privacy", summary="프로필 공개/비공개 설정 변경")
async def toggle_privacy(
    body: PrivacyToggleRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.is_private = body.is_private
    await db.commit()
    return ApiResponse.ok({"is_private": current_user.is_private})


@router.patch("/me/message-settings", summary="비팔로워 메시지 요청 수신 설정")
async def update_message_request_setting(
    body: MessageRequestSettingRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.allow_message_requests = body.allow_message_requests
    await db.commit()
    return ApiResponse.ok({
        "allow_message_requests": current_user.allow_message_requests,
    })


@router.get("/me/follow-requests", summary="대기 중인 팔로우 요청 목록 조회")
async def get_follow_requests(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(FollowRequest)
        .where(and_(FollowRequest.target_id == current_user.id, FollowRequest.status == "PENDING"))
        .order_by(FollowRequest.created_at.desc())
    )
    res = await db.execute(stmt)
    requests = res.scalars().all()

    items = []
    for r in requests:
        items.append({
            "id": str(r.id),
            "requester": {
                "id": str(r.requester.id),
                "username": r.requester.username,
                "full_name": r.requester.full_name,
                "profile_image_url": r.requester.profile_image_url,
                "is_admin": r.requester.is_admin,
            },
            "created_at": r.created_at.isoformat() if r.created_at else "",
        })
    return ApiResponse.ok(items)


@router.post("/me/follow-requests/{request_id}/accept", summary="팔로우 요청 수락")
async def accept_follow_request(
    request_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    req_uuid = uuid.UUID(request_id)
    stmt = select(FollowRequest).where(
        and_(FollowRequest.id == req_uuid, FollowRequest.target_id == current_user.id)
    )
    res = await db.execute(stmt)
    req = res.scalars().first()
    if not req:
        return ApiResponse.error(message="팔로우 요청을 찾을 수 없습니다.")

    # Create Follow
    new_follow = Follow(follower_id=req.requester_id, following_id=current_user.id)
    db.add(new_follow)
    await db.delete(req)
    await db.commit()
    return ApiResponse.ok({"message": "팔로우 요청을 수락했습니다."})


@router.post("/me/follow-requests/{request_id}/reject", summary="팔로우 요청 거절")
async def reject_follow_request(
    request_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    req_uuid = uuid.UUID(request_id)
    stmt = select(FollowRequest).where(
        and_(FollowRequest.id == req_uuid, FollowRequest.target_id == current_user.id)
    )
    res = await db.execute(stmt)
    req = res.scalars().first()
    if req:
        await db.delete(req)
        await db.commit()
    return ApiResponse.ok({"message": "팔로우 요청을 거절했습니다."})


@router.post("/{username}/block", summary="사용자 차단")
async def block_user(
    username: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    u_stmt = select(User).where(User.username == username)
    u_res = await db.execute(u_stmt)
    target_user = u_res.scalars().first()
    if not target_user:
        raise NotFoundException("User")
    if target_user.id == current_user.id:
        raise BadRequestException("자기 자신을 차단할 수 없습니다.")

    existing = await db.scalar(
        select(UserBlock).where(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == target_user.id,
        )
    )
    if existing:
        return ApiResponse.ok({"message": f"@{username} 님은 이미 차단되어 있습니다."})

    block = UserBlock(blocker_id=current_user.id, blocked_id=target_user.id)
    db.add(block)

    # 기존 팔로우 제거
    f_stmt = select(Follow).where(
        ((Follow.follower_id == current_user.id) & (Follow.following_id == target_user.id)) |
        ((Follow.follower_id == target_user.id) & (Follow.following_id == current_user.id))
    )
    f_res = await db.execute(f_stmt)
    for f in f_res.scalars().all():
        await db.delete(f)

    await db.commit()
    return ApiResponse.ok({"message": f"@{username} 님을 차단했습니다."})


@router.delete("/{username}/block", summary="사용자 차단 해제")
async def unblock_user(
    username: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    target_user = await db.scalar(select(User).where(User.username == username))
    if not target_user:
        raise NotFoundException("User")
    block = await db.scalar(
        select(UserBlock).where(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == target_user.id,
        )
    )
    if block:
        await db.delete(block)
        await db.commit()
    return ApiResponse.ok({"message": f"@{username} 님의 차단을 해제했습니다."})


@router.get("/me/blocked-users", summary="차단한 사용자 목록")
async def get_blocked_users(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(User)
            .join(UserBlock, UserBlock.blocked_id == User.id)
            .where(UserBlock.blocker_id == current_user.id)
            .order_by(User.username.asc())
        )
    ).scalars().all()
    return ApiResponse.ok(
        [UserSummaryResponse.model_validate(user) for user in rows]
    )
