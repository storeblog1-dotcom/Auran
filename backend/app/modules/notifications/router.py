from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.response import ApiResponse
from app.core.database import get_db
from app.core.security import decode_token
from app.modules.auth.dependencies import get_current_active_user, get_current_user
from app.modules.auth.models import User
from app.modules.notifications import service
from app.modules.notifications.schemas import (
    NotificationListResponse,
    NotificationRead,
    NotificationUnreadCountResponse,
    PushReceiptSyncResponse,
    PushTokenCreate,
    PushTokenDeactivateResponse,
    PushTokenRead,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.post(
    "/push-tokens",
    response_model=ApiResponse[PushTokenRead],
    status_code=status.HTTP_201_CREATED,
    summary="Register or refresh this app installation's Expo push token",
)
async def register_push_token(
    body: PushTokenCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.notifications.push import register_push_token as register

    push_token = await register(db, user_id=current_user.id, body=body)
    return ApiResponse.ok(data=PushTokenRead.model_validate(push_token))


@router.delete(
    "/push-tokens/{device_id}",
    response_model=ApiResponse[PushTokenDeactivateResponse],
    summary="Deactivate this app installation's push token",
)
async def deactivate_push_token(
    device_id: str,
    # A just-withdrawn account must still be able to unregister its device
    # before the client clears the final access token.
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.notifications.push import deactivate_push_token as deactivate

    deactivated = await deactivate(
        db,
        user_id=current_user.id,
        device_id=device_id,
    )
    return ApiResponse.ok(
        data=PushTokenDeactivateResponse(deactivated=deactivated)
    )


@router.post(
    "/push-tokens/sync-receipts",
    response_model=ApiResponse[PushReceiptSyncResponse],
    summary="Resolve pending Expo delivery receipts for this user's devices",
)
async def sync_push_receipts(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.notifications.push import sync_push_receipts as sync

    result = await sync(db, user_id=current_user.id)
    return ApiResponse.ok(data=PushReceiptSyncResponse(**result))


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
    token: str = Query(...),
):
    """인증된 사용자의 실시간 알림만 구독합니다."""
    try:
        payload = decode_token(token)
        if payload.get("type") == "refresh":
            raise ValueError("Refresh tokens cannot subscribe to notifications")
        user_id = str(UUID(str(payload["sub"])))
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

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
