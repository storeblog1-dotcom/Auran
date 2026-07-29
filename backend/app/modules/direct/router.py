import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.exceptions import (
    AppException,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
)
from app.core.database import AsyncSessionLocal, get_db
from app.core.security import decode_token
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.models import User
from app.modules.auth.service import get_user_by_id
from app.modules.direct.models import ChatMessage, ChatRoom, ChatRoomMember
from app.modules.direct.schemas import (
    ChatMessageCreate,
    ChatMessageResponse,
    ChatRoomCreate,
    ChatRoomResponse,
    DirectMessageEligibilityResponse,
    SenderResponse,
)
from app.modules.direct.websocket_manager import manager
from app.modules.users.models import Follow, UserBlock

router = APIRouter(prefix="/direct", tags=["Direct Messages"])

REQUEST_ACCEPTED = "ACCEPTED"
REQUEST_PENDING = "PENDING"
REQUEST_REJECTED = "REJECTED"
REQUEST_NEW = "NEW_REQUEST"
MESSAGE_REQUEST_LIMIT = 5


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
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """대화방 메시지 내역 조회 & 읽음 상태 갱신"""
    await _verify_room_member(db, room_id, current_user.id)
    room = await _get_room(db, room_id)

    # 메시지 조회
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.room_id == room_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    messages = res.scalars().all()

    # 읽음 시각 갱신
    member_stmt = select(ChatRoomMember).where(
        and_(ChatRoomMember.room_id == room_id, ChatRoomMember.user_id == current_user.id)
    )
    m_res = await db.execute(member_stmt)
    member = m_res.scalars().first()
    if member and room.request_status == REQUEST_ACCEPTED:
        member.last_read_at = func.now()
        await db.commit()

    return messages


@router.post("/rooms/{room_id}/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message_rest(
    room_id: uuid.UUID,
    body: ChatMessageCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """HTTP REST를 통한 메시지 전송"""
    await _verify_room_member(db, room_id, current_user.id)
    room = await _authorize_message_send(
        db, room_id, current_user.id, body
    )

    new_msg = ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        content=body.content,
        message_type=body.message_type,
        media_url=body.media_url,
        shared_post_id=body.shared_post_id,
    )
    db.add(new_msg)

    # 방 updated_at 갱신
    room.updated_at = func.now()

    await db.commit()
    await db.refresh(new_msg)

    # 웹소켓 브로드캐스트
    msg_dict = {
        "id": str(new_msg.id),
        "room_id": str(new_msg.room_id),
        "sender": {
            "id": str(current_user.id),
            "username": current_user.username,
            "nickname": current_user.nickname,
            "full_name": current_user.full_name,
            "profile_image_url": current_user.profile_image_url,
        },
        "content": new_msg.content,
        "message_type": new_msg.message_type,
        "media_url": new_msg.media_url,
        "shared_post_id": str(new_msg.shared_post_id) if new_msg.shared_post_id else None,
        "created_at": new_msg.created_at.isoformat() if new_msg.created_at else "",
    }
    await manager.broadcast_to_room(str(room_id), msg_dict)

    # 상대방 멤버들에게 DM 알림 생성
    other_members_res = await db.execute(
        select(ChatRoomMember.user_id).where(
            and_(ChatRoomMember.room_id == room_id, ChatRoomMember.user_id != current_user.id)
        )
    )
    from app.modules.notifications.models import NotificationType
    from app.modules.notifications.service import create_notification

    if room.request_status == REQUEST_ACCEPTED:
        for recipient_id in other_members_res.scalars().all():
            msg_text = body.content if body.content else ("사진 메시지" if body.media_url else "메시지")
            await create_notification(
                db,
                recipient_id=recipient_id,
                sender_id=current_user.id,
                type=NotificationType.DIRECT_MESSAGE.value,
                message=f"{current_user.nickname or current_user.username}님의 메시지: {msg_text}",
                direct_message_id=str(new_msg.id),
            )

    return new_msg


@router.post("/rooms/{room_id}/read", status_code=status.HTTP_200_OK)
async def mark_room_as_read(
    room_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """대화방 읽음 처리"""
    member_stmt = select(ChatRoomMember).where(
        and_(ChatRoomMember.room_id == room_id, ChatRoomMember.user_id == current_user.id)
    )
    m_res = await db.execute(member_stmt)
    member = m_res.scalars().first()
    if not member:
        raise NotFoundException("대화방 참여자가 아닙니다")

    room = await _get_room(db, room_id)
    if room.request_status == REQUEST_ACCEPTED:
        member.last_read_at = func.now()
        await db.commit()
    return {"message": "read status updated"}


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

            async with AsyncSessionLocal() as db:
                try:
                    message_body = ChatMessageCreate(
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
                    content=content,
                    message_type=message_type,
                    media_url=media_url,
                    shared_post_id=shared_post_id,
                )
                db.add(new_msg)

                room.updated_at = func.now()

                await db.commit()
                await db.refresh(new_msg)

                # 상대방 멤버들에게 DM 알림 생성
                other_members_res = await db.execute(
                    select(ChatRoomMember.user_id).where(
                        and_(ChatRoomMember.room_id == room_uuid, ChatRoomMember.user_id != user_id)
                    )
                )
                from app.modules.notifications.models import NotificationType
                from app.modules.notifications.service import create_notification

                if room.request_status == REQUEST_ACCEPTED:
                    for recipient_id in other_members_res.scalars().all():
                        msg_text = content[:30] if content else ("사진 메시지" if media_url else "메시지")
                        await create_notification(
                            db,
                            recipient_id=recipient_id,
                            sender_id=user_id,
                            type=NotificationType.DIRECT_MESSAGE.value,
                            message=f"{sender_info.get('nickname') or sender_info['username']}님의 메시지: {msg_text}",
                            direct_message_id=str(new_msg.id),
                        )

                msg_payload = {
                    "id": str(new_msg.id),
                    "room_id": str(new_msg.room_id),
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
        last_msg_resp = ChatMessageResponse(
            id=last_msg.id,
            room_id=last_msg.room_id,
            sender=SenderResponse(
                id=last_msg.sender.id,
                username=last_msg.sender.username,
                nickname=last_msg.sender.nickname,
                full_name=last_msg.sender.full_name,
                profile_image_url=last_msg.sender.profile_image_url,
                is_admin=last_msg.sender.is_admin,
            ),
            content=last_msg.content,
            message_type=last_msg.message_type,
            media_url=last_msg.media_url,
            shared_post_id=last_msg.shared_post_id,
            created_at=last_msg.created_at,
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
