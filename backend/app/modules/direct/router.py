import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.exceptions import BadRequestException, NotFoundException, UnauthorizedException
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
    SenderResponse,
)
from app.modules.direct.websocket_manager import manager

router = APIRouter(prefix="/direct", tags=["Direct Messages"])


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
        room_id = existing_room.id
    else:
        # 새로 생성
        new_room = ChatRoom(is_group=False)
        db.add(new_room)
        await db.flush()

        member1 = ChatRoomMember(room_id=new_room.id, user_id=current_user.id)
        member2 = ChatRoomMember(room_id=new_room.id, user_id=target_user_id)
        db.add_all([member1, member2])
        await db.commit()
        room_id = new_room.id

    # 대화방 정보 로드
    return await _format_room_response(db, room_id, current_user.id)


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
    for r in rooms:
        formatted = await _format_room_response(db, r.id, current_user.id)
        response_list.append(formatted)

    return response_list


@router.get("/rooms/{room_id}/messages", response_model=List[ChatMessageResponse])
async def get_room_messages(
    room_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """대화방 메시지 내역 조회 & 읽음 상태 갱신"""
    await _verify_room_member(db, room_id, current_user.id)

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
    if member:
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
    room_stmt = select(ChatRoom).where(ChatRoom.id == room_id)
    r_res = await db.execute(room_stmt)
    room = r_res.scalars().first()
    if room:
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

    for recipient_id in other_members_res.scalars().all():
        msg_text = body.content if body.content else ("사진 메시지" if body.media_url else "메시지")
        await create_notification(
            db,
            recipient_id=recipient_id,
            sender_id=current_user.id,
            type=NotificationType.DIRECT_MESSAGE.value,
            message=f"{current_user.username}님의 메시지: {msg_text}",
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
            sender_info = {
                "id": str(user.id),
                "username": user.username,
                "full_name": user.full_name,
                "profile_image_url": user.profile_image_url,
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
                new_msg = ChatMessage(
                    room_id=room_uuid,
                    sender_id=uuid.UUID(sender_info["id"]),
                    content=content,
                    message_type=message_type,
                    media_url=media_url,
                    shared_post_id=shared_post_id,
                )
                db.add(new_msg)

                r_stmt = select(ChatRoom).where(ChatRoom.id == room_uuid)
                r_res = await db.execute(r_stmt)
                room = r_res.scalars().first()
                if room:
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

                for recipient_id in other_members_res.scalars().all():
                    msg_text = content[:30] if content else ("사진 메시지" if media_url else "메시지")
                    await create_notification(
                        db,
                        recipient_id=recipient_id,
                        sender_id=user_id,
                        type=NotificationType.DIRECT_MESSAGE.value,
                        message=f"{sender_info['username']}님의 메시지: {msg_text}",
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
        user_info = SenderResponse(
            id=m.user.id,
            username=m.user.username,
            full_name=m.user.full_name,
            profile_image_url=m.user.profile_image_url,
        )
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
                full_name=last_msg.sender.full_name,
                profile_image_url=last_msg.sender.profile_image_url,
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

    return ChatRoomResponse(
        id=room.id,
        is_group=room.is_group,
        name=room.name,
        target_user=target_user_resp,
        members=members_resp,
        last_message=last_msg_resp,
        unread_count=unread_count,
        updated_at=room.updated_at,
    )
