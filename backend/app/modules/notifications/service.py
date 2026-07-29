import json
import logging
import uuid
from typing import Dict, List, Optional, Set

from fastapi import WebSocket
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.notifications.models import Notification, NotificationType
from app.modules.notifications.schemas import NotificationRead

logger = logging.getLogger(__name__)

class NotificationConnectionManager:
    """사용자별 알림 WebSocket 커넥션 관리자"""

    def __init__(self):
        # user_id: Set[WebSocket]
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_notification(self, user_id: str, notification_data: dict):
        if user_id in self.active_connections:
            dead_connections = set()
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(notification_data)
                except Exception:
                    dead_connections.add(connection)

            for dead in dead_connections:
                self.active_connections[user_id].discard(dead)


notification_manager = NotificationConnectionManager()


async def create_notification(
    db: AsyncSession,
    recipient_id: uuid.UUID,
    sender_id: uuid.UUID,
    type: str,
    message: Optional[str] = None,
    post_id: Optional[uuid.UUID] = None,
    comment_id: Optional[str] = None,
    direct_message_id: Optional[str] = None,
) -> Optional[Notification]:
    """알림 생성 및 DB 저장 + WebSocket 실시간 전송"""
    # 자기 자신의 동작인 경우 알림을 생성하지 않음
    if recipient_id == sender_id:
        return None

    notification = Notification(
        recipient_id=recipient_id,
        sender_id=sender_id,
        type=type,
        message=message,
        post_id=post_id,
        comment_id=comment_id,
        direct_message_id=direct_message_id,
        is_read=False,
    )
    db.add(notification)
    await db.commit()

    # 릴레이션 eager loading 후 WebSocket 실시간 알림 발송
    stmt = select(Notification).options(
        selectinload(Notification.sender)
    ).where(Notification.id == notification.id)
    result = await db.execute(stmt)
    loaded_notification = result.scalar_one()

    read_schema = NotificationRead.model_validate(loaded_notification)
    payload = {
        "event": "NEW_NOTIFICATION",
        "notification": json.loads(read_schema.model_dump_json()),
    }
    await notification_manager.send_notification(str(recipient_id), payload)

    if type == NotificationType.DIRECT_MESSAGE.value:
        try:
            from app.modules.notifications.push import send_direct_message_push

            await send_direct_message_push(
                db,
                notification=loaded_notification,
            )
        except Exception:
            # A push provider outage must never fail a message that is already
            # saved and visible through the chat transport.
            logger.exception(
                "Failed to send DM push notification %s",
                loaded_notification.id,
            )

    return notification


async def get_user_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 30,
    offset: int = 0,
) -> List[Notification]:
    """사용자의 알림 목록 조회"""
    stmt = (
        select(Notification)
        .where(Notification.recipient_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    """읽지 않은 알림 개수 조회"""
    stmt = (
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.recipient_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
    )
    result = await db.execute(stmt)
    return result.scalar() or 0


async def mark_notification_as_read(
    db: AsyncSession,
    notification_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """특정 알림 읽음 처리"""
    stmt = (
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.recipient_id == user_id,
        )
        .values(is_read=True)
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0


async def mark_all_notifications_as_read(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> int:
    """모든 알림 읽음 처리"""
    stmt = (
        update(Notification)
        .where(
            Notification.recipient_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount
