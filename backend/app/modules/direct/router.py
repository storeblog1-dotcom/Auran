import logging
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Response,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.common.exceptions import (
    AppException,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
)
from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.security import decode_token
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.models import User
from app.modules.auth.service import get_user_by_id
from app.modules.direct.models import (
    ChatMessage,
    ChatRoom,
    ChatRoomMember,
    DirectUserPresence,
    DirectConversation,
    DirectConversationMember,
    DirectMessage,
)
from app.modules.direct.realtime import (
    create_realtime_access_token,
    direct_presence_topic,
    direct_room_topic,
)
from app.modules.direct.schemas import (
    ChatMessageCreate,
    ChatMessageResponse,
    ChatRoomCreate,
    ChatRoomResponse,
    DirectPresenceResponse,
    DirectMessageEligibilityResponse,
    MessageCheckpointResponse,
    MessageCheckpointUpdate,
    RealtimeConfigResponse,
    SenderResponse,
    DirectConversationCreate,
    DirectConversationResponse,
    DirectMessageCreateSchema,
    DirectMessageResponseSchema,
)
from app.modules.direct.websocket_manager import manager
from app.modules.users.models import Follow, UserBlock

router = APIRouter(prefix="/direct", tags=["Direct Messages"])
logger = logging.getLogger(__name__)

REQUEST_ACCEPTED = "ACCEPTED"
REQUEST_PENDING = "PENDING"
REQUEST_REJECTED = "REJECTED"
REQUEST_NEW = "NEW_REQUEST"
MESSAGE_REQUEST_LIMIT = 5
DIRECT_NOTIFICATION_MAX_LENGTH = 500


def message_request_allowed(
    is_mutual: bool,
    recipient_allows_requests: bool,
    sender_is_admin: bool = False,
) -> bool:
    return sender_is_admin or is_mutual or recipient_allows_requests


def pending_request_has_capacity(message_count: int) -> bool:
    return message_count < MESSAGE_REQUEST_LIMIT


def admin_message_access(sender_is_admin: bool) -> bool:
    return sender_is_admin


def room_starts_accepted(is_mutual: bool, sender_is_admin: bool) -> bool:
    return is_mutual or sender_is_admin


def message_content_for_storage(content: str | None) -> str | None:
    """Keep the exact client string; validation must never normalize content."""
    return content


def direct_message_notification_text(
    sender_display_name: str,
    content: str | None,
    media_url: str | None,
) -> str:
    """Build a bounded notification preview without touching stored content."""
    preview = content or ("사진 메시지" if media_url else "메시지")
    return (
        f"{sender_display_name}님의 메시지: {preview}"
    )[:DIRECT_NOTIFICATION_MAX_LENGTH]


@router.get("/realtime/config", response_model=RealtimeConfigResponse)
async def get_realtime_config(
    response: Response,
    room_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Issue a short-lived token for private Supabase Realtime channels."""
    response.headers["Cache-Control"] = "no-store"
    peer_ids: list[uuid.UUID] = []
    if room_id is not None:
        await _verify_room_member(db, room_id, current_user.id)
        room = await _get_room(db, room_id)
        if await _users_are_blocked_in_room(db, room, current_user.id):
            raise ForbiddenException(
                "차단된 사용자와는 메시지를 주고받을 수 없습니다."
            )
        peer_ids = [
            member_id
            for member_id in await _room_member_ids(db, room_id)
            if member_id != current_user.id
        ]
    else:
        own_membership = aliased(ChatRoomMember)
        peer_membership = aliased(ChatRoomMember)
        blocked_pair = (
            select(UserBlock.id)
            .where(
                or_(
                    and_(
                        UserBlock.blocker_id == current_user.id,
                        UserBlock.blocked_id == peer_membership.user_id,
                    ),
                    and_(
                        UserBlock.blocker_id == peer_membership.user_id,
                        UserBlock.blocked_id == current_user.id,
                    ),
                )
            )
            .exists()
        )
        peer_result = await db.execute(
            select(peer_membership.user_id)
            .join(
                own_membership,
                own_membership.room_id == peer_membership.room_id,
            )
            .join(ChatRoom, ChatRoom.id == peer_membership.room_id)
            .where(
                own_membership.user_id == current_user.id,
                peer_membership.user_id != current_user.id,
                ChatRoom.request_status == REQUEST_ACCEPTED,
                ~blocked_pair,
            )
            .distinct()
        )
        peer_ids = list(peer_result.scalars().all())
    if (
        not settings.supabase_url
        or not settings.supabase_anon_key
        or not settings.supabase_jwt_secret
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="실시간 메시지 설정이 완료되지 않았습니다.",
        )

    presence = await _touch_presence(db, current_user.id)
    token, expires_at = create_realtime_access_token(
        current_user.id,
        settings.supabase_jwt_secret,
    )
    return RealtimeConfigResponse(
        supabase_url=settings.supabase_url,
        supabase_anon_key=settings.supabase_anon_key,
        access_token=token,
        expires_at=expires_at,
        channel_topic=(
            direct_room_topic(room_id) if room_id is not None else None
        ),
        presence_topic=direct_presence_topic(current_user.id),
        peer_presence_topics=[
            direct_presence_topic(peer_id) for peer_id in peer_ids
        ],
        user_id=current_user.id,
        last_seen_at=presence.last_active_at,
    )


@router.post(
    "/presence/heartbeat",
    response_model=DirectPresenceResponse,
)
async def update_direct_presence(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist the foreground user's last-active checkpoint."""
    presence = await _touch_presence(db, current_user.id)
    return DirectPresenceResponse(
        user_id=presence.user_id,
        last_active_at=presence.last_active_at,
    )


@router.get(
    "/rooms/{room_id}/presence",
    response_model=List[DirectPresenceResponse],
)
async def get_room_presence(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return persisted last-active times for members of an authorized room."""
    await _verify_room_member(db, room_id, current_user.id)
    room = await _get_room(db, room_id)
    if await _users_are_blocked_in_room(db, room, current_user.id):
        raise ForbiddenException(
            "차단된 사용자와는 메시지를 주고받을 수 없습니다."
        )
    member_ids = await _room_member_ids(db, room_id)
    result = await db.execute(
        select(DirectUserPresence).where(
            DirectUserPresence.user_id.in_(member_ids)
        )
    )
    presence_by_user = {
        presence.user_id: presence
        for presence in result.scalars().all()
    }
    return [
        DirectPresenceResponse(
            user_id=member_id,
            last_active_at=presence_by_user[member_id].last_active_at,
        )
        for member_id in member_ids
        if member_id in presence_by_user
    ]


@router.post("/rooms", response_model=ChatRoomResponse, status_code=status.HTTP_201_CREATED)
async def create_or_get_direct_room(
    body: ChatRoomCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """상대방과의 1:1 대화방 생성 또는 기존 대화방 반환"""
    target_user_id = body.target_user_id

    if target_user_id == current_user.id:
        raise BadRequestException("자기 자신과는 대화할 수 없습니다")

    # 상대방 존재 여부 확인
    target_user = await get_user_by_id(db, target_user_id)

    if (
        not admin_message_access(current_user.is_admin)
        and await _users_are_blocked(db, current_user.id, target_user_id)
    ):
        raise ForbiddenException("차단된 사용자와는 메시지를 주고받을 수 없습니다.")

    is_mutual = await _users_are_mutual_followers(
        db, current_user.id, target_user_id
    )
    # 기존 1:1 방 탐색
    query = (
        select(ChatRoom)
        .join(ChatRoomMember, ChatRoom.id == ChatRoomMember.room_id)
        .where(ChatRoom.is_group.is_(False))
        .where(ChatRoomMember.user_id.in_([current_user.id, target_user_id]))
        .group_by(ChatRoom.id)
        .having(func.count(ChatRoomMember.id) == 2)
    )

    result = await db.execute(query)
    existing_room = result.scalars().first()

    if existing_room:
        if (
            (is_mutual or admin_message_access(current_user.is_admin))
            and existing_room.request_status != REQUEST_ACCEPTED
        ):
            existing_room.request_status = REQUEST_ACCEPTED
            existing_room.request_sender_id = None
            await db.commit()
        elif existing_room.request_status == REQUEST_REJECTED:
            raise ForbiddenException("거절된 메시지 요청입니다.")
        room_id = existing_room.id
    else:
        if (
            not message_request_allowed(
                is_mutual,
                target_user.allow_message_requests,
                sender_is_admin=current_user.is_admin,
            )
        ):
            raise ForbiddenException(
                "상대방이 메시지 요청을 받지 않습니다."
            )

        # 새로 생성
        new_room = ChatRoom(
            is_group=False,
            request_status=(
                REQUEST_ACCEPTED
                if room_starts_accepted(is_mutual, current_user.is_admin)
                else REQUEST_PENDING
            ),
            request_sender_id=(
                None
                if room_starts_accepted(is_mutual, current_user.is_admin)
                else current_user.id
            ),
        )
        db.add(new_room)
        await db.flush()

        member1 = ChatRoomMember(room_id=new_room.id, user_id=current_user.id)
        member2 = ChatRoomMember(room_id=new_room.id, user_id=target_user_id)
        db.add_all([member1, member2])
        await db.commit()
        room_id = new_room.id

    # 대화방 정보 로드
    return await _format_room_response(db, room_id, current_user.id)


@router.get(
    "/eligibility/{target_user_id}",
    response_model=DirectMessageEligibilityResponse,
)
async def get_direct_message_eligibility(
    target_user_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """대상 사용자에게 보낼 수 있는 메시지 종류와 요청 상태를 조회합니다."""
    target_user = await get_user_by_id(db, target_user_id)
    target_response = _format_sender(target_user)

    if target_user_id == current_user.id:
        return DirectMessageEligibilityResponse(
            target_user=target_response,
            request_status=REQUEST_REJECTED,
            can_send_message=False,
            can_share_post=False,
            message_permission_reason="내 게시물에는 메시지를 보낼 수 없습니다.",
        )

    if admin_message_access(current_user.is_admin):
        existing_room = await _find_direct_room(
            db, current_user.id, target_user_id
        )
        if existing_room and existing_room.request_status != REQUEST_ACCEPTED:
            existing_room.request_status = REQUEST_ACCEPTED
            existing_room.request_sender_id = None
            await db.commit()
        return DirectMessageEligibilityResponse(
            target_user=target_response,
            room_id=existing_room.id if existing_room else None,
            request_status=REQUEST_ACCEPTED,
            can_send_message=True,
            can_share_post=True,
        )

    if await _users_are_blocked(db, current_user.id, target_user_id):
        return DirectMessageEligibilityResponse(
            target_user=target_response,
            request_status=REQUEST_REJECTED,
            can_send_message=False,
            can_share_post=False,
            message_permission_reason="차단 관계인 사용자에게는 메시지를 보낼 수 없습니다.",
        )

    is_mutual = await _users_are_mutual_followers(
        db, current_user.id, target_user_id
    )
    existing_room = await _find_direct_room(
        db, current_user.id, target_user_id
    )

    if is_mutual:
        if existing_room and existing_room.request_status != REQUEST_ACCEPTED:
            existing_room.request_status = REQUEST_ACCEPTED
            existing_room.request_sender_id = None
            await db.commit()
        return DirectMessageEligibilityResponse(
            target_user=target_response,
            room_id=existing_room.id if existing_room else None,
            request_status=REQUEST_ACCEPTED,
            can_send_message=True,
            can_share_post=True,
        )

    if existing_room:
        if existing_room.request_status == REQUEST_ACCEPTED:
            return DirectMessageEligibilityResponse(
                target_user=target_response,
                room_id=existing_room.id,
                request_status=REQUEST_ACCEPTED,
                can_send_message=True,
                can_share_post=True,
            )
        if existing_room.request_status == REQUEST_REJECTED:
            return DirectMessageEligibilityResponse(
                target_user=target_response,
                room_id=existing_room.id,
                request_status=REQUEST_REJECTED,
                can_send_message=False,
                can_share_post=False,
                message_permission_reason="거절된 메시지 요청입니다.",
            )

        is_outgoing = existing_room.request_sender_id == current_user.id
        request_count = await _request_message_count(
            db, existing_room.id, existing_room.request_sender_id
        )
        can_send = (
            is_outgoing
            and target_user.allow_message_requests
            and pending_request_has_capacity(request_count)
        )
        reason = None
        if not is_outgoing:
            reason = "받은 요청을 승인한 후 답장할 수 있습니다."
        elif not target_user.allow_message_requests:
            reason = "상대방이 메시지 요청을 받지 않습니다."
        elif not pending_request_has_capacity(request_count):
            reason = "상대방이 승인할 때까지 메시지는 5개까지만 보낼 수 있습니다."
        return DirectMessageEligibilityResponse(
            target_user=target_response,
            room_id=existing_room.id,
            request_status=REQUEST_PENDING,
            is_outgoing_request=is_outgoing,
            request_message_count=request_count,
            can_send_message=can_send,
            can_share_post=False,
            message_permission_reason=reason,
        )

    can_request = message_request_allowed(
        is_mutual=False,
        recipient_allows_requests=target_user.allow_message_requests,
    )
    return DirectMessageEligibilityResponse(
        target_user=target_response,
        request_status=REQUEST_NEW,
        can_send_message=can_request,
        can_share_post=False,
        message_permission_reason=(
            None if can_request else "상대방이 메시지 요청을 받지 않습니다."
        ),
    )


@router.get("/rooms", response_model=List[ChatRoomResponse])
async def list_user_rooms(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """내가 참여한 대화방 목록 조회"""
    subquery = (
        select(ChatRoomMember.room_id)
        .where(ChatRoomMember.user_id == current_user.id)
        .scalar_subquery()
    )

    rooms_query = (
        select(ChatRoom)
        .where(ChatRoom.id.in_(subquery))
        .order_by(ChatRoom.updated_at.desc())
    )
    result = await db.execute(rooms_query)
    rooms = result.scalars().all()

    response_list = []
    changed = False
    for r in rooms:
        if await _users_are_blocked_in_room(db, r, current_user.id):
            continue
        if (
            r.request_status == REQUEST_PENDING
            and (
                await _room_members_are_mutual(db, r.id)
                or await _room_has_admin(db, r.id)
            )
        ):
            r.request_status = REQUEST_ACCEPTED
            r.request_sender_id = None
            changed = True
        if r.request_status == REQUEST_REJECTED:
            continue
        if (
            r.request_status == REQUEST_PENDING
            and r.request_sender_id != current_user.id
        ):
            continue
        formatted = await _format_room_response(db, r.id, current_user.id)
        response_list.append(formatted)

    if changed:
        await db.commit()
    return response_list


@router.get("/requests", response_model=List[ChatRoomResponse])
async def list_message_requests(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """내가 받은 미승인 메시지 요청 목록"""
    subquery = (
        select(ChatRoomMember.room_id)
        .where(ChatRoomMember.user_id == current_user.id)
        .scalar_subquery()
    )
    result = await db.execute(
        select(ChatRoom)
        .where(
            ChatRoom.id.in_(subquery),
            ChatRoom.request_status == REQUEST_PENDING,
            ChatRoom.request_sender_id != current_user.id,
        )
        .order_by(ChatRoom.updated_at.desc())
    )

    response_list = []
    changed = False
    for room in result.scalars().all():
        if await _users_are_blocked_in_room(db, room, current_user.id):
            continue
        if (
            await _room_members_are_mutual(db, room.id)
            or await _room_has_admin(db, room.id)
        ):
            room.request_status = REQUEST_ACCEPTED
            room.request_sender_id = None
            changed = True
            continue
        formatted = await _format_room_response(
            db, room.id, current_user.id
        )
        if formatted.last_message is not None:
            response_list.append(formatted)

    if changed:
        await db.commit()
    return response_list


@router.post("/rooms/{room_id}/accept", response_model=ChatRoomResponse)
async def accept_message_request(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_request_room_for_recipient(db, room_id, current_user.id)
    if await _users_are_blocked_in_room(db, room, current_user.id):
        raise ForbiddenException("차단된 사용자의 메시지 요청입니다.")

    room.request_status = REQUEST_ACCEPTED
    room.request_sender_id = None
    await db.commit()
    return await _format_room_response(db, room.id, current_user.id)


@router.post("/rooms/{room_id}/reject", status_code=status.HTTP_200_OK)
async def reject_message_request(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_request_room_for_recipient(db, room_id, current_user.id)
    room.request_status = REQUEST_REJECTED
    await db.commit()
    return {"message": "메시지 요청을 거절했습니다."}


@router.post("/rooms/{room_id}/block", status_code=status.HTTP_200_OK)
async def block_message_request_sender(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_request_room_for_recipient(db, room_id, current_user.id)
    sender_id = room.request_sender_id
    if sender_id is None:
        raise BadRequestException("차단할 요청 발신자를 찾을 수 없습니다.")

    existing_block = await db.execute(
        select(UserBlock).where(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == sender_id,
        )
    )
    if existing_block.scalar_one_or_none() is None:
        db.add(UserBlock(blocker_id=current_user.id, blocked_id=sender_id))

    follows_result = await db.execute(
        select(Follow).where(
            or_(
                and_(
                    Follow.follower_id == current_user.id,
                    Follow.following_id == sender_id,
                ),
                and_(
                    Follow.follower_id == sender_id,
                    Follow.following_id == current_user.id,
                ),
            )
        )
    )
    for follow in follows_result.scalars().all():
        await db.delete(follow)

    room.request_status = REQUEST_REJECTED
    await db.commit()
    return {"message": "사용자를 차단하고 메시지 요청을 삭제했습니다."}


@router.get("/rooms/{room_id}/messages", response_model=List[ChatMessageResponse])
async def get_room_messages(
    room_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    before: uuid.UUID | None = Query(
        default=None,
        description="Return messages older than this message ID",
    ),
    mark_read: bool = Query(
        default=True,
        description=(
            "Backward-compatible read update. V2 clients pass false and "
            "call the explicit read endpoint only while focused."
        ),
    ),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """대화방 메시지 내역 조회 & 읽음 상태 갱신"""
    current_member = await _verify_room_member(
        db, room_id, current_user.id
    )
    room = await _get_room(db, room_id)

    filters = [ChatMessage.room_id == room_id]
    if before is not None:
        anchor_result = await db.execute(
            select(ChatMessage).where(
                ChatMessage.id == before,
                ChatMessage.room_id == room_id,
            )
        )
        anchor = anchor_result.scalars().first()
        if anchor is None:
            raise NotFoundException("기준 메시지")
        filters.append(
            or_(
                ChatMessage.created_at < anchor.created_at,
                and_(
                    ChatMessage.created_at == anchor.created_at,
                    ChatMessage.id < anchor.id,
                ),
            )
        )

    # 최신 페이지를 가져온 뒤 화면 표시 순서(과거 -> 최신)로 반환합니다.
    stmt = (
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .where(*filters)
        .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    messages = list(reversed(res.scalars().all()))

    # 전달됨은 최신 페이지를 받은 시점에 전진합니다. 읽음은 구버전
    # 호환을 위해 기본 true지만, V2는 false로 조회하고 포커스 상태에서
    # 명시적인 /read 요청만 보냅니다.
    if room.request_status == REQUEST_ACCEPTED and before is None:
        latest_received_result = await db.execute(
            select(func.max(ChatMessage.created_at)).where(
                ChatMessage.room_id == room_id,
                ChatMessage.sender_id != current_user.id,
            )
        )
        latest_received_at = latest_received_result.scalar_one_or_none()
        if latest_received_at is not None:
            next_delivered_at, next_read_at = history_checkpoint_values(
                current_member.last_delivered_at,
                current_member.last_read_at,
                latest_received_at,
                mark_read=mark_read,
            )
            if (
                next_delivered_at != current_member.last_delivered_at
                or next_read_at != current_member.last_read_at
            ):
                current_member.last_delivered_at = next_delivered_at
                current_member.last_read_at = next_read_at
                await db.commit()

    members = await _get_room_members(db, room_id)
    return [
        _format_message_response(message, current_user.id, members)
        for message in messages
    ]


@router.post("/rooms/{room_id}/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message_rest(
    room_id: uuid.UUID,
    body: ChatMessageCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """HTTP REST를 통한 메시지 전송"""
    await _verify_room_member(db, room_id, current_user.id)
    if body.client_message_id is not None:
        existing = await _find_idempotent_message(
            db,
            current_user.id,
            body.client_message_id,
        )
        if existing is not None:
            if existing.room_id != room_id:
                raise BadRequestException(
                    "client_message_id가 다른 대화방에서 이미 사용되었습니다."
                )
            members = await _get_room_members(db, room_id)
            return _format_message_response(
                existing,
                current_user.id,
                members,
            )

    room = await _authorize_message_send(
        db, room_id, current_user.id, body
    )

    new_msg = ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        client_message_id=body.client_message_id,
        content=message_content_for_storage(body.content),
        message_type=body.message_type,
        media_url=body.media_url,
        shared_post_id=body.shared_post_id,
    )
    db.add(new_msg)

    # 방 updated_at 갱신
    room.updated_at = func.now()

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        if body.client_message_id is None:
            raise
        existing = await _find_idempotent_message(
            db,
            current_user.id,
            body.client_message_id,
        )
        if existing is None or existing.room_id != room_id:
            raise
        members = await _get_room_members(db, room_id)
        return _format_message_response(
            existing,
            current_user.id,
            members,
        )

    new_msg = await _get_message(db, room_id, new_msg.id)
    saved_message_id = new_msg.id

    # 이전 앱 버전의 WebSocket 수신 경로도 새 화면 전환이 끝날 때까지 유지합니다.
    msg_dict = {
        "id": str(new_msg.id),
        "room_id": str(new_msg.room_id),
        "client_message_id": (
            str(new_msg.client_message_id)
            if new_msg.client_message_id
            else None
        ),
        "sender": {
            "id": str(current_user.id),
            "username": current_user.username,
            "nickname": current_user.nickname,
            "full_name": current_user.full_name,
            "profile_image_url": current_user.profile_image_url,
            "is_admin": current_user.is_admin,
        },
        "content": new_msg.content,
        "message_type": new_msg.message_type,
        "media_url": new_msg.media_url,
        "shared_post_id": str(new_msg.shared_post_id) if new_msg.shared_post_id else None,
        "delivery_status": "SENT",
        "delivered_at": None,
        "read_at": None,
        "created_at": new_msg.created_at.isoformat() if new_msg.created_at else "",
    }
    await manager.broadcast_to_room(str(room_id), msg_dict)

    # 상대방 멤버들에게 DM 알림 생성
    other_members_res = await db.execute(
        select(ChatRoomMember.user_id).where(
            and_(ChatRoomMember.room_id == room_id, ChatRoomMember.user_id != current_user.id)
        )
    )
    if room.request_status == REQUEST_ACCEPTED:
        for recipient_id in other_members_res.scalars().all():
            await _create_direct_message_notification(
                db,
                recipient_id=recipient_id,
                sender_id=current_user.id,
                sender_display_name=(
                    current_user.nickname or current_user.username
                ),
                content=body.content,
                media_url=body.media_url,
                message_id=saved_message_id,
            )

    # Notification creation commits independently and a failed notification
    # rolls its transaction back, so reload the already-saved message.
    new_msg = await _get_message(db, room_id, saved_message_id)
    members = await _get_room_members(db, room_id)
    return _format_message_response(
        new_msg,
        current_user.id,
        members,
    )


@router.post(
    "/rooms/{room_id}/delivered",
    response_model=MessageCheckpointResponse,
    status_code=status.HTTP_200_OK,
)
async def mark_room_as_delivered(
    room_id: uuid.UUID,
    body: MessageCheckpointUpdate | None = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Acknowledge receipt through a specific message, monotonically."""
    member = await _verify_room_member(db, room_id, current_user.id)
    room = await _get_room(db, room_id)
    if room.request_status == REQUEST_ACCEPTED:
        checkpoint = await _resolve_checkpoint(
            db,
            room_id,
            body.through_message_id if body else None,
        )
        member.last_delivered_at = _later_checkpoint(
            member.last_delivered_at,
            checkpoint,
        )
        await db.commit()
    return MessageCheckpointResponse(
        user_id=current_user.id,
        delivered_at=member.last_delivered_at,
        read_at=member.last_read_at,
    )


@router.post(
    "/rooms/{room_id}/read",
    response_model=MessageCheckpointResponse,
    status_code=status.HTTP_200_OK,
)
async def mark_room_as_read(
    room_id: uuid.UUID,
    body: MessageCheckpointUpdate | None = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """대화방 읽음 처리"""
    member = await _verify_room_member(db, room_id, current_user.id)
    room = await _get_room(db, room_id)
    if room.request_status == REQUEST_ACCEPTED:
        checkpoint = await _resolve_checkpoint(
            db,
            room_id,
            body.through_message_id if body else None,
        )
        member.last_delivered_at = _later_checkpoint(
            member.last_delivered_at,
            checkpoint,
        )
        member.last_read_at = _later_checkpoint(
            member.last_read_at,
            checkpoint,
        )
        await db.commit()
    return MessageCheckpointResponse(
        user_id=current_user.id,
        delivered_at=member.last_delivered_at,
        read_at=member.last_read_at,
    )


# ─── WebSocket Endpoint ──────────────────────────────────────
@router.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    token: str = Query(...),
):
    """실시간 대화 웹소켓 엔드포인트"""
    try:
        payload = decode_token(token)
        user_id_str = payload.get("sub")
        if not user_id_str:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        user_id = uuid.UUID(user_id_str)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    room_uuid = uuid.UUID(room_id)

    # DB 세션 생성 및 멤버십 확인
    async with AsyncSessionLocal() as db:
        try:
            user = await get_user_by_id(db, user_id)
            await _verify_room_member(db, room_uuid, user.id)
            room = await _get_room(db, room_uuid)
            if await _users_are_blocked_in_room(db, room, user.id):
                raise ForbiddenException(
                    "차단된 사용자와는 메시지를 주고받을 수 없습니다."
                )
            sender_info = {
                "id": str(user.id),
                "username": user.username,
                "nickname": user.nickname,
                "full_name": user.full_name,
                "profile_image_url": user.profile_image_url,
                "is_admin": user.is_admin,
            }
        except Exception:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    await manager.connect(room_id, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            content = data.get("content")
            message_type = data.get("message_type", "TEXT")
            media_url = data.get("media_url")
            shared_post_id_str = data.get("shared_post_id")
            shared_post_id = uuid.UUID(shared_post_id_str) if shared_post_id_str else None
            client_message_id_str = data.get("client_message_id")
            client_message_id = (
                uuid.UUID(client_message_id_str)
                if client_message_id_str
                else None
            )

            async with AsyncSessionLocal() as db:
                try:
                    message_body = ChatMessageCreate(
                        client_message_id=client_message_id,
                        content=content,
                        message_type=message_type,
                        media_url=media_url,
                        shared_post_id=shared_post_id,
                    )
                    room = await _authorize_message_send(
                        db, room_uuid, user_id, message_body
                    )
                except AppException as exc:
                    await websocket.send_json({
                        "type": "error",
                        "message": exc.message,
                    })
                    continue

                new_msg = ChatMessage(
                    room_id=room_uuid,
                    sender_id=uuid.UUID(sender_info["id"]),
                    client_message_id=client_message_id,
                    content=message_content_for_storage(content),
                    message_type=message_type,
                    media_url=media_url,
                    shared_post_id=shared_post_id,
                )
                db.add(new_msg)

                room.updated_at = func.now()

                await db.commit()
                await db.refresh(new_msg)
                saved_message_id = new_msg.id

                # 상대방 멤버들에게 DM 알림 생성
                other_members_res = await db.execute(
                    select(ChatRoomMember.user_id).where(
                        and_(ChatRoomMember.room_id == room_uuid, ChatRoomMember.user_id != user_id)
                    )
                )
                if room.request_status == REQUEST_ACCEPTED:
                    for recipient_id in other_members_res.scalars().all():
                        await _create_direct_message_notification(
                            db,
                            recipient_id=recipient_id,
                            sender_id=user_id,
                            sender_display_name=(
                                sender_info.get("nickname")
                                or sender_info["username"]
                            ),
                            content=content,
                            media_url=media_url,
                            message_id=saved_message_id,
                        )

                new_msg = await _get_message(
                    db,
                    room_uuid,
                    saved_message_id,
                )
                msg_payload = {
                    "id": str(new_msg.id),
                    "room_id": str(new_msg.room_id),
                    "client_message_id": (
                        str(new_msg.client_message_id)
                        if new_msg.client_message_id
                        else None
                    ),
                    "sender": sender_info,
                    "content": new_msg.content,
                    "message_type": new_msg.message_type,
                    "media_url": new_msg.media_url,
                    "shared_post_id": str(new_msg.shared_post_id) if new_msg.shared_post_id else None,
                    "created_at": new_msg.created_at.isoformat() if new_msg.created_at else "",
                }

            await manager.broadcast_to_room(room_id, msg_payload)

    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
    except Exception as e:
        print(f"WebSocket error in room {room_id}: {e}")
        manager.disconnect(room_id, websocket)


# ─── Helper Functions ─────────────────────────────────────────
async def _create_direct_message_notification(
    db: AsyncSession,
    *,
    recipient_id: uuid.UUID,
    sender_id: uuid.UUID,
    sender_display_name: str,
    content: str | None,
    media_url: str | None,
    message_id: uuid.UUID,
) -> bool:
    """Keep an auxiliary notification failure from failing a saved message."""
    from app.modules.notifications.models import NotificationType
    from app.modules.notifications.service import create_notification

    try:
        await create_notification(
            db,
            recipient_id=recipient_id,
            sender_id=sender_id,
            type=NotificationType.DIRECT_MESSAGE.value,
            message=direct_message_notification_text(
                sender_display_name,
                content,
                media_url,
            ),
            direct_message_id=str(message_id),
        )
        return True
    except Exception:
        await db.rollback()
        logger.exception(
            "Direct-message notification failed after message commit",
            extra={
                "direct_message_id": str(message_id),
                "recipient_id": str(recipient_id),
            },
        )
        return False


def _later_checkpoint(
    current: datetime | None,
    candidate: datetime,
) -> datetime:
    if current is None or candidate > current:
        return candidate
    return current


def history_checkpoint_values(
    last_delivered_at: datetime | None,
    last_read_at: datetime | None,
    latest_received_at: datetime,
    *,
    mark_read: bool,
) -> tuple[datetime, datetime | None]:
    return (
        _later_checkpoint(last_delivered_at, latest_received_at),
        (
            _later_checkpoint(last_read_at, latest_received_at)
            if mark_read
            else last_read_at
        ),
    )


async def _resolve_checkpoint(
    db: AsyncSession,
    room_id: uuid.UUID,
    through_message_id: uuid.UUID | None,
) -> datetime:
    if through_message_id is None:
        return datetime.now(timezone.utc)
    result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.id == through_message_id,
            ChatMessage.room_id == room_id,
        )
    )
    message = result.scalars().first()
    if message is None:
        raise NotFoundException("기준 메시지")
    return message.created_at


async def _get_room_members(
    db: AsyncSession,
    room_id: uuid.UUID,
) -> list[ChatRoomMember]:
    result = await db.execute(
        select(ChatRoomMember).where(
            ChatRoomMember.room_id == room_id
        )
    )
    return list(result.scalars().all())


async def _get_message(
    db: AsyncSession,
    room_id: uuid.UUID,
    message_id: uuid.UUID,
) -> ChatMessage:
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .where(
            ChatMessage.id == message_id,
            ChatMessage.room_id == room_id,
        )
    )
    message = result.scalars().first()
    if message is None:
        raise NotFoundException("메시지")
    return message


async def _find_idempotent_message(
    db: AsyncSession,
    sender_id: uuid.UUID,
    client_message_id: uuid.UUID,
) -> ChatMessage | None:
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .where(
            ChatMessage.sender_id == sender_id,
            ChatMessage.client_message_id == client_message_id,
        )
    )
    return result.scalars().first()


def _format_message_response(
    message: ChatMessage,
    viewer_id: uuid.UUID,
    members: list[ChatRoomMember],
) -> ChatMessageResponse:
    if message.sender_id == viewer_id:
        recipient_members = [
            member
            for member in members
            if member.user_id != viewer_id
        ]
    else:
        recipient_members = [
            member
            for member in members
            if member.user_id == viewer_id
        ]

    delivered_checkpoints = [
        member.last_delivered_at
        for member in recipient_members
        if (
            member.last_delivered_at is not None
            and member.last_delivered_at >= message.created_at
        )
    ]
    read_checkpoints = [
        member.last_read_at
        for member in recipient_members
        if (
            member.last_read_at is not None
            and member.last_read_at >= message.created_at
        )
    ]
    delivered_at = (
        max(delivered_checkpoints)
        if recipient_members
        and len(delivered_checkpoints) == len(recipient_members)
        else None
    )
    read_at = (
        max(read_checkpoints)
        if recipient_members
        and len(read_checkpoints) == len(recipient_members)
        else None
    )
    delivery_status = (
        "READ"
        if read_at is not None
        else "DELIVERED"
        if delivered_at is not None
        else "SENT"
    )
    return ChatMessageResponse(
        id=message.id,
        room_id=message.room_id,
        client_message_id=message.client_message_id,
        sender=_format_sender(message.sender),
        content=message.content,
        message_type=message.message_type,
        media_url=message.media_url,
        shared_post_id=message.shared_post_id,
        delivery_status=delivery_status,
        delivered_at=delivered_at,
        read_at=read_at,
        created_at=message.created_at,
    )


async def _touch_presence(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> DirectUserPresence:
    now = datetime.now(timezone.utc)
    await db.execute(
        pg_insert(DirectUserPresence)
        .values(user_id=user_id, last_active_at=now)
        .on_conflict_do_update(
            index_elements=[DirectUserPresence.user_id],
            set_={"last_active_at": now},
        )
    )
    await db.commit()
    result = await db.execute(
        select(DirectUserPresence).where(
            DirectUserPresence.user_id == user_id
        )
    )
    return result.scalar_one()


async def _get_room(db: AsyncSession, room_id: uuid.UUID) -> ChatRoom:
    result = await db.execute(select(ChatRoom).where(ChatRoom.id == room_id))
    room = result.scalars().first()
    if not room:
        raise NotFoundException("대화방")
    return room


async def _room_member_ids(
    db: AsyncSession, room_id: uuid.UUID
) -> list[uuid.UUID]:
    result = await db.execute(
        select(ChatRoomMember.user_id).where(
            ChatRoomMember.room_id == room_id
        )
    )
    return list(result.scalars().all())


async def _room_has_admin(
    db: AsyncSession, room_id: uuid.UUID
) -> bool:
    result = await db.execute(
        select(func.count(User.id))
        .join(ChatRoomMember, ChatRoomMember.user_id == User.id)
        .where(
            ChatRoomMember.room_id == room_id,
            User.is_admin.is_(True),
        )
    )
    return (result.scalar() or 0) > 0


async def _find_direct_room(
    db: AsyncSession,
    first_user_id: uuid.UUID,
    second_user_id: uuid.UUID,
) -> ChatRoom | None:
    result = await db.execute(
        select(ChatRoom)
        .join(ChatRoomMember, ChatRoom.id == ChatRoomMember.room_id)
        .where(
            ChatRoom.is_group.is_(False),
            ChatRoomMember.user_id.in_([first_user_id, second_user_id]),
        )
        .group_by(ChatRoom.id)
        .having(func.count(ChatRoomMember.id) == 2)
    )
    return result.scalars().first()


async def _request_message_count(
    db: AsyncSession,
    room_id: uuid.UUID,
    request_sender_id: uuid.UUID | None,
) -> int:
    if request_sender_id is None:
        return 0
    result = await db.execute(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.room_id == room_id,
            ChatMessage.sender_id == request_sender_id,
        )
    )
    return result.scalar() or 0


def _format_sender(user: User) -> SenderResponse:
    return SenderResponse(
        id=user.id,
        username=user.username,
        nickname=user.nickname,
        full_name=user.full_name,
        profile_image_url=user.profile_image_url,
        is_admin=user.is_admin,
    )


async def _users_are_mutual_followers(
    db: AsyncSession, first_user_id: uuid.UUID, second_user_id: uuid.UUID
) -> bool:
    result = await db.execute(
        select(func.count(Follow.id)).where(
            or_(
                and_(
                    Follow.follower_id == first_user_id,
                    Follow.following_id == second_user_id,
                ),
                and_(
                    Follow.follower_id == second_user_id,
                    Follow.following_id == first_user_id,
                ),
            )
        )
    )
    return (result.scalar() or 0) == 2


async def _users_are_blocked(
    db: AsyncSession, first_user_id: uuid.UUID, second_user_id: uuid.UUID
) -> bool:
    result = await db.execute(
        select(func.count(UserBlock.id)).where(
            or_(
                and_(
                    UserBlock.blocker_id == first_user_id,
                    UserBlock.blocked_id == second_user_id,
                ),
                and_(
                    UserBlock.blocker_id == second_user_id,
                    UserBlock.blocked_id == first_user_id,
                ),
            )
        )
    )
    return (result.scalar() or 0) > 0


async def _room_members_are_mutual(
    db: AsyncSession, room_id: uuid.UUID
) -> bool:
    member_ids = await _room_member_ids(db, room_id)
    if len(member_ids) != 2:
        return False
    return await _users_are_mutual_followers(
        db, member_ids[0], member_ids[1]
    )


async def _users_are_blocked_in_room(
    db: AsyncSession, room: ChatRoom, current_user_id: uuid.UUID
) -> bool:
    if await _room_has_admin(db, room.id):
        return False
    member_ids = await _room_member_ids(db, room.id)
    target_user_id = next(
        (member_id for member_id in member_ids if member_id != current_user_id),
        None,
    )
    if target_user_id is None:
        return False
    return await _users_are_blocked(
        db, current_user_id, target_user_id
    )


async def _get_request_room_for_recipient(
    db: AsyncSession, room_id: uuid.UUID, current_user_id: uuid.UUID
) -> ChatRoom:
    await _verify_room_member(db, room_id, current_user_id)
    room = await _get_room(db, room_id)
    if (
        room.request_status != REQUEST_PENDING
        or room.request_sender_id == current_user_id
    ):
        raise BadRequestException("처리할 수 있는 메시지 요청이 아닙니다.")
    return room


async def _authorize_message_send(
    db: AsyncSession,
    room_id: uuid.UUID,
    sender_id: uuid.UUID,
    body: ChatMessageCreate,
) -> ChatRoom:
    room = await _get_room(db, room_id)
    if await _room_has_admin(db, room.id):
        if room.request_status != REQUEST_ACCEPTED:
            room.request_status = REQUEST_ACCEPTED
            room.request_sender_id = None
        return room

    if await _users_are_blocked_in_room(db, room, sender_id):
        raise ForbiddenException(
            "차단된 사용자와는 메시지를 주고받을 수 없습니다."
        )

    if room.request_status == REQUEST_ACCEPTED:
        return room
    if room.request_status == REQUEST_REJECTED:
        raise ForbiddenException("거절된 메시지 요청입니다.")

    if await _room_members_are_mutual(db, room.id):
        room.request_status = REQUEST_ACCEPTED
        room.request_sender_id = None
        return room

    if room.request_sender_id != sender_id:
        raise ForbiddenException(
            "메시지 요청을 승인한 후 답장할 수 있습니다."
        )

    member_ids = await _room_member_ids(db, room.id)
    target_user_id = next(
        (member_id for member_id in member_ids if member_id != sender_id),
        None,
    )
    if target_user_id is None:
        raise NotFoundException("메시지 수신자")
    target_user = await get_user_by_id(db, target_user_id)
    if not target_user.allow_message_requests:
        raise ForbiddenException("상대방이 메시지 요청을 받지 않습니다.")

    if (
        body.message_type.upper() != "TEXT"
        or not body.content
        or not body.content.strip()
        or body.media_url is not None
        or body.shared_post_id is not None
    ):
        raise ForbiddenException(
            "상대방이 요청을 승인하기 전에는 텍스트 메시지만 보낼 수 있습니다."
        )

    request_count = await _request_message_count(
        db, room.id, room.request_sender_id
    )
    if not pending_request_has_capacity(request_count):
        raise ForbiddenException(
            "상대방이 메시지 요청을 승인할 때까지 메시지는 5개까지만 보낼 수 있습니다."
        )
    return room


async def _verify_room_member(db: AsyncSession, room_id: uuid.UUID, user_id: uuid.UUID):
    stmt = select(ChatRoomMember).where(
        and_(ChatRoomMember.room_id == room_id, ChatRoomMember.user_id == user_id)
    )
    res = await db.execute(stmt)
    member = res.scalars().first()
    if not member:
        raise NotFoundException("대화방이 존재하지 않거나 권한이 없습니다")
    return member


async def _format_room_response(db: AsyncSession, room_id: uuid.UUID, current_user_id: uuid.UUID) -> ChatRoomResponse:
    r_stmt = select(ChatRoom).where(ChatRoom.id == room_id)
    r_res = await db.execute(r_stmt)
    room = r_res.scalars().first()

    # 멤버 목록
    m_stmt = (
        select(ChatRoomMember)
        .options(selectinload(ChatRoomMember.user))
        .where(ChatRoomMember.room_id == room_id)
    )
    m_res = await db.execute(m_stmt)
    members = m_res.scalars().all()

    target_user_resp = None
    members_resp = []
    current_member = None

    for m in members:
        user_info = _format_sender(m.user)
        members_resp.append(user_info)
        if m.user_id != current_user_id:
            target_user_resp = user_info
        else:
            current_member = m

    # 최근 메시지
    msg_stmt = (
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .where(ChatMessage.room_id == room_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    msg_res = await db.execute(msg_stmt)
    last_msg = msg_res.scalars().first()

    last_msg_resp = None
    if last_msg:
        last_msg_resp = _format_message_response(
            last_msg,
            current_user_id,
            list(members),
        )

    # 안읽은 메시지 수
    unread_count = 0
    if current_member:
        if current_member.last_read_at:
            unread_stmt = select(func.count(ChatMessage.id)).where(
                and_(
                    ChatMessage.room_id == room_id,
                    ChatMessage.sender_id != current_user_id,
                    ChatMessage.created_at > current_member.last_read_at,
                )
            )
        else:
            unread_stmt = select(func.count(ChatMessage.id)).where(
                and_(
                    ChatMessage.room_id == room_id,
                    ChatMessage.sender_id != current_user_id,
                )
            )
        u_res = await db.execute(unread_stmt)
        unread_count = u_res.scalar() or 0

    is_outgoing_request = room.request_sender_id == current_user_id
    request_message_count = 0
    can_send_message = room.request_status == REQUEST_ACCEPTED
    can_share_post = room.request_status == REQUEST_ACCEPTED
    message_permission_reason = None

    if room.request_status == REQUEST_PENDING:
        request_message_count = await _request_message_count(
            db, room.id, room.request_sender_id
        )
        target_member = next(
            (member for member in members if member.user_id != current_user_id),
            None,
        )
        if not is_outgoing_request:
            message_permission_reason = "메시지 요청을 승인한 후 답장할 수 있습니다."
        elif target_member and not target_member.user.allow_message_requests:
            message_permission_reason = "상대방이 메시지 요청을 받지 않습니다."
        elif not pending_request_has_capacity(request_message_count):
            message_permission_reason = (
                "상대방이 승인할 때까지 메시지는 5개까지만 보낼 수 있습니다."
            )
        else:
            can_send_message = True

    return ChatRoomResponse(
        id=room.id,
        is_group=room.is_group,
        name=room.name,
        target_user=target_user_resp,
        members=members_resp,
        last_message=last_msg_resp,
        unread_count=unread_count,
        request_status=room.request_status,
        is_outgoing_request=is_outgoing_request,
        request_message_count=request_message_count,
        request_message_limit=MESSAGE_REQUEST_LIMIT,
        can_send_message=can_send_message,
        can_share_post=can_share_post,
        message_permission_reason=message_permission_reason,
        updated_at=room.updated_at,
    )


# ─── Task 10-1: Direct Conversations (Minimal 1:1 Setup) ───

@router.post(
    "/conversations",
    summary="1:1 대화방 생성 또는 기존 대화방 반환",
    response_model=dict,
)
async def create_or_get_direct_conversation(
    payload: DirectConversationCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    target_id = payload.get_target_id
    if not target_id:
        raise BadRequestException("target_user_id 가 필요합니다.")

    if target_id == current_user.id:
        raise BadRequestException("자기 자신과는 대화할 수 없습니다.")

    target_user = await get_user_by_id(db, target_id)
    if not target_user:
        raise NotFoundException("상대방 사용자를 찾을 수 없습니다.")

    # 1. 이미 존재하는 1:1 대화방 검색 (중복 생성 방지)
    subq1 = (
        select(DirectConversationMember.conversation_id)
        .where(DirectConversationMember.user_id == current_user.id)
    )
    subq2 = (
        select(DirectConversationMember.conversation_id)
        .where(DirectConversationMember.user_id == target_id)
    )
    stmt = (
        select(DirectConversation)
        .where(
            DirectConversation.id.in_(subq1),
            DirectConversation.id.in_(subq2),
        )
    )
    res = await db.execute(stmt)
    conv = res.scalars().first()

    if not conv:
        # 2. 신규 대화방 생성
        conv = DirectConversation()
        db.add(conv)
        await db.flush()

        m1 = DirectConversationMember(conversation_id=conv.id, user_id=current_user.id)
        m2 = DirectConversationMember(conversation_id=conv.id, user_id=target_id)
        db.add_all([m1, m2])
        await db.commit()
        await db.refresh(conv)

    target_user_resp = SenderResponse.model_validate(target_user)

    return {
        "status": "success",
        "data": {
            "id": str(conv.id),
            "target_user": target_user_resp.model_dump(),
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        },
    }


@router.get(
    "/conversations",
    summary="참여 중인 1:1 대화방 목록 조회",
    response_model=dict,
)
async def get_direct_conversations(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(DirectConversation)
        .join(DirectConversationMember)
        .where(DirectConversationMember.user_id == current_user.id)
        .order_by(DirectConversation.updated_at.desc())
    )
    res = await db.execute(stmt)
    conversations = res.scalars().unique().all()

    result = []
    for conv in conversations:
        other_member = next(
            (m for m in conv.members if m.user_id != current_user.id), None
        )
        target_user_data = (
            SenderResponse.model_validate(other_member.user).model_dump()
            if other_member and other_member.user
            else None
        )
        result.append(
            {
                "id": str(conv.id),
                "target_user": target_user_data,
                "created_at": conv.created_at.isoformat() if conv.created_at else None,
                "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
            }
        )

    return {
        "status": "success",
        "data": result,
    }


@router.get(
    "/conversations/{conversation_id}",
    summary="단일 1:1 대화방 상세 조회",
    response_model=dict,
)
async def get_direct_conversation_detail(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(DirectConversation).where(DirectConversation.id == conversation_id)
    res = await db.execute(stmt)
    conv = res.scalars().first()

    if not conv:
        raise NotFoundException("대화방을 찾을 수 없습니다.")

    is_member = any(m.user_id == current_user.id for m in conv.members)
    if not is_member:
        raise ForbiddenException("해당 대화방에 접근할 권한이 없습니다.")

    other_member = next(
        (m for m in conv.members if m.user_id != current_user.id), None
    )
    target_user_data = (
        SenderResponse.model_validate(other_member.user).model_dump()
        if other_member and other_member.user
        else None
    )

    return {
        "status": "success",
        "data": {
            "id": str(conv.id),
            "target_user": target_user_data,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        },
    }


# ─── Task 10-2: Direct Messages (Text Messaging & WebSocket) ───

class DirectConversationWSManager:
    def __init__(self):
        self.active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, conversation_id: str, websocket: WebSocket):
        await websocket.accept()
        if conversation_id not in self.active_connections:
            self.active_connections[conversation_id] = set()
        self.active_connections[conversation_id].add(websocket)

    def disconnect(self, conversation_id: str, websocket: WebSocket):
        if conversation_id in self.active_connections:
            self.active_connections[conversation_id].discard(websocket)
            if not self.active_connections[conversation_id]:
                del self.active_connections[conversation_id]

    async def broadcast(self, conversation_id: str, message_data: dict):
        if conversation_id in self.active_connections:
            dead_sockets = set()
            for ws in list(self.active_connections[conversation_id]):
                try:
                    await ws.send_json(message_data)
                except Exception:
                    dead_sockets.add(ws)
            for ws in dead_sockets:
                self.active_connections[conversation_id].discard(ws)


direct_ws_manager = DirectConversationWSManager()


@router.get(
    "/conversations/{conversation_id}/messages",
    summary="1:1 대화방 메시지 목록 조회",
    response_model=dict,
)
async def get_direct_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(default=30, ge=1, le=100),
    before: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt_conv = select(DirectConversation).where(DirectConversation.id == conversation_id)
    res_conv = await db.execute(stmt_conv)
    conv = res_conv.scalars().first()

    if not conv:
        raise NotFoundException("대화방을 찾을 수 없습니다.")

    is_member = any(m.user_id == current_user.id for m in conv.members)
    if not is_member:
        raise ForbiddenException("해당 대화방에 접근할 권한이 없습니다.")

    stmt_msg = select(DirectMessage).where(DirectMessage.conversation_id == conversation_id)

    if before:
        subq_before = select(DirectMessage.created_at).where(DirectMessage.id == before)
        res_before = await db.execute(subq_before)
        before_time = res_before.scalar()
        if before_time:
            stmt_msg = stmt_msg.where(DirectMessage.created_at < before_time)

    stmt_msg = stmt_msg.order_by(DirectMessage.created_at.desc()).limit(limit)
    res_msg = await db.execute(stmt_msg)
    messages = list(res_msg.scalars().all())

    messages.reverse()

    result = []
    for msg in messages:
        sender_resp = (
            SenderResponse.model_validate(msg.sender).model_dump()
            if msg.sender
            else None
        )
        result.append(
            {
                "id": str(msg.id),
                "conversation_id": str(msg.conversation_id),
                "sender_id": str(msg.sender_id),
                "sender": sender_resp,
                "content": msg.content,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "updated_at": msg.updated_at.isoformat() if msg.updated_at else None,
            }
        )

    return {
        "status": "success",
        "data": result,
    }


@router.post(
    "/conversations/{conversation_id}/messages",
    summary="1:1 대화방 텍스트 메시지 전송",
    response_model=dict,
)
async def send_direct_message(
    conversation_id: uuid.UUID,
    payload: DirectMessageCreateSchema,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt_conv = select(DirectConversation).where(DirectConversation.id == conversation_id)
    res_conv = await db.execute(stmt_conv)
    conv = res_conv.scalars().first()

    if not conv:
        raise NotFoundException("대화방을 찾을 수 없습니다.")

    is_member = any(m.user_id == current_user.id for m in conv.members)
    if not is_member:
        raise ForbiddenException("해당 대화방에 접근할 권한이 없습니다.")

    content = payload.content.strip()
    if not content:
        raise BadRequestException("메시지 내용을 입력해주세요.")

    msg = DirectMessage(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=content,
    )
    db.add(msg)
    conv.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)

    sender_resp = SenderResponse.model_validate(current_user).model_dump()
    msg_data = {
        "id": str(msg.id),
        "conversation_id": str(msg.conversation_id),
        "sender_id": str(msg.sender_id),
        "sender": sender_resp,
        "content": msg.content,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "updated_at": msg.updated_at.isoformat() if msg.updated_at else None,
    }

    await direct_ws_manager.broadcast(
        str(conversation_id),
        {
            "event": "DIRECT_MESSAGE_CREATED",
            "data": msg_data,
        },
    )

    return {
        "status": "success",
        "data": msg_data,
    }


@router.websocket("/conversations/{conversation_id}/ws")
async def direct_conversation_ws(
    websocket: WebSocket,
    conversation_id: uuid.UUID,
):
    conv_id_str = str(conversation_id)
    await direct_ws_manager.connect(conv_id_str, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        direct_ws_manager.disconnect(conv_id_str, websocket)
    except Exception:
        direct_ws_manager.disconnect(conv_id_str, websocket)
