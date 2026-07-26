from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.response import ApiResponse
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.models import User
from app.modules.notifications import service
from app.modules.notifications.schemas import (
    NotificationListResponse,
    NotificationRead,
    NotificationUnreadCountResponse,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get(
    "",
    response_model=ApiResponse[NotificationListResponse],
    summary="사용자 알림 목록 조회",
)
async def get_notifications(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """현재 사용자의 알림 목록 및 읽지 않은 알림 수 반환"""
    items = await service.get_user_notifications(
        db, user_id=current_user.id, limit=limit, offset=offset
    )
    unread_count = await service.get_unread_count(db, user_id=current_user.id)

    notification_reads = [NotificationRead.model_validate(item) for item in items]
    return ApiResponse.ok(
        data=NotificationListResponse(
            items=notification_reads,
            unread_count=unread_count,
        )
    )


@router.get(
    "/unread-count",
    response_model=ApiResponse[NotificationUnreadCountResponse],
    summary="읽지 않은 알림 개수 조회",
)
async def get_unread_count(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """읽지 않은 알림 총 개수 반환"""
    unread_count = await service.get_unread_count(db, user_id=current_user.id)
    return ApiResponse.ok(
        data=NotificationUnreadCountResponse(unread_count=unread_count)
    )


@router.patch(
    "/{notification_id}/read",
    response_model=ApiResponse[dict],
    summary="개별 알림 읽음 처리",
)
async def mark_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """특정 알림을 읽음 상태로 변경"""
    success = await service.mark_notification_as_read(
        db, notification_id=notification_id, user_id=current_user.id
    )
    return ApiResponse.ok(data={"updated": success})


@router.patch(
    "/read-all",
    response_model=ApiResponse[dict],
    summary="모든 알림 읽음 처리",
)
async def mark_all_read(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """현재 사용자의 모든 알림을 읽음 상태로 변경"""
    count = await service.mark_all_notifications_as_read(db, user_id=current_user.id)
    return ApiResponse.ok(data={"updated_count": count})


@router.websocket("/ws")
async def notification_websocket(
    websocket: WebSocket,
    user_id: str = Query(...),
):
    """실시간 알림 구독을 위한 WebSocket 엔드포인트"""
    await service.notification_manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        service.notification_manager.disconnect(user_id, websocket)
    except Exception:
        service.notification_manager.disconnect(user_id, websocket)
