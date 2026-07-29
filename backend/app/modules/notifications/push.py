"""Expo Push Service integration.

Push delivery is deliberately best-effort: a network or credential failure must
never roll back a saved direct message or make the chat API fail.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.notifications.models import Notification, PushDelivery, PushToken
from app.modules.notifications.schemas import PushTokenCreate

logger = logging.getLogger(__name__)

DIRECT_MESSAGE_CHANNEL_ID = "direct-messages"
EXPO_BATCH_SIZE = 100
EXPO_RECEIPT_BATCH_SIZE = 1000
RECEIPT_MINIMUM_AGE = timedelta(minutes=15)


def is_expo_push_token(value: str) -> bool:
    return (
        (
            value.startswith("ExpoPushToken[")
            or value.startswith("ExponentPushToken[")
        )
        and value.endswith("]")
        and 20 <= len(value) <= 255
    )


def _sender_value(sender: Any, field: str, default: Any = None) -> Any:
    if isinstance(sender, dict):
        return sender.get(field, default)
    return getattr(sender, field, default)


def _message_preview(content: str | None, message_type: str) -> str:
    clean_content = (content or "").strip()
    if clean_content:
        return clean_content[:120]
    if message_type == "IMAGE":
        return "사진을 보냈습니다."
    if message_type == "POST":
        return "게시물을 공유했습니다."
    return "새 메시지가 도착했습니다."


def build_direct_message_push_payload(
    *,
    expo_push_token: str,
    room_id: str,
    message_id: str,
    sender: Any,
    content: str | None,
    message_type: str,
) -> dict[str, Any]:
    """Build the versioned payload consumed by the React Native navigation bridge."""
    nickname = _sender_value(sender, "nickname")
    username = _sender_value(sender, "username", "")
    display_name = nickname or username or "사용자"
    profile_image_url = _sender_value(sender, "profile_image_url")

    return {
        "to": expo_push_token,
        "title": display_name,
        "body": _message_preview(content, message_type),
        "sound": "default",
        "channelId": DIRECT_MESSAGE_CHANNEL_ID,
        "priority": "high",
        "data": {
            "version": 1,
            "type": "DIRECT_MESSAGE",
            "room_id": room_id,
            "message_id": message_id,
            "sender_id": str(_sender_value(sender, "id", "")),
            "sender_username": username,
            "sender_nickname": nickname,
            "sender_full_name": _sender_value(sender, "full_name", username),
            "sender_profile_image_url": profile_image_url,
            "sender_is_admin": bool(_sender_value(sender, "is_admin", False)),
            "url": f"auran://messages/{room_id}",
        },
    }


def _expo_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
    }
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"
    return headers


async def register_push_token(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    body: PushTokenCreate,
) -> PushToken:
    """Upsert a token while safely transferring a signed-out device to its new user."""
    result = await db.execute(
        select(PushToken).where(
            or_(
                PushToken.expo_push_token == body.expo_push_token,
                and_(
                    PushToken.user_id == user_id,
                    PushToken.device_id == body.device_id,
                ),
            )
        )
    )
    matches = list(result.scalars().all())
    token_match = next(
        (
            item
            for item in matches
            if item.expo_push_token == body.expo_push_token
        ),
        None,
    )
    device_match = next(
        (
            item
            for item in matches
            if item.user_id == user_id and item.device_id == body.device_id
        ),
        None,
    )

    if token_match is not None and device_match is not None and token_match.id != device_match.id:
        await db.delete(device_match)

    push_token = token_match or device_match
    if push_token is None:
        push_token = PushToken(
            user_id=user_id,
            expo_push_token=body.expo_push_token,
            device_id=body.device_id,
            platform=body.platform,
            app_version=body.app_version,
        )
        db.add(push_token)
    else:
        push_token.user_id = user_id
        push_token.expo_push_token = body.expo_push_token
        push_token.device_id = body.device_id
        push_token.platform = body.platform
        push_token.app_version = body.app_version

    push_token.is_active = True
    push_token.last_seen_at = datetime.now(timezone.utc)
    push_token.last_error = None
    await db.commit()
    await db.refresh(push_token)
    return push_token


async def deactivate_push_token(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    device_id: str,
) -> bool:
    result = await db.execute(
        update(PushToken)
        .where(
            PushToken.user_id == user_id,
            PushToken.device_id == device_id,
            PushToken.is_active.is_(True),
        )
        .values(is_active=False, updated_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return bool(result.rowcount)


async def _post_expo(
    url: str,
    payload: dict[str, Any] | list[dict[str, Any]],
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=httpx.Timeout(4.0)) as client:
        response = await client.post(
            url,
            headers=_expo_headers(),
            json=payload,
        )
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError("Expo Push Service returned an invalid response")
        return result


def _ticket_error(ticket: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    details = ticket.get("details")
    details_dict = details if isinstance(details, dict) else None
    error = None
    if details_dict and isinstance(details_dict.get("error"), str):
        error = details_dict["error"]
    if not error and isinstance(ticket.get("message"), str):
        error = ticket["message"]
    return error, details_dict


async def send_direct_message_push(
    db: AsyncSession,
    *,
    notification: Notification,
) -> int:
    """Send one saved DM to every active installation owned by its recipient."""
    if not notification.direct_message_id:
        return 0

    try:
        message_id = uuid.UUID(notification.direct_message_id)
    except (TypeError, ValueError):
        return 0

    # Local import keeps the notification model independent of the DM model.
    from app.modules.direct.models import ChatMessage

    message_result = await db.execute(
        select(ChatMessage).where(ChatMessage.id == message_id)
    )
    message = message_result.scalar_one_or_none()
    if message is None:
        return 0

    token_result = await db.execute(
        select(PushToken).where(
            PushToken.user_id == notification.recipient_id,
            PushToken.is_active.is_(True),
        )
    )
    tokens = [
        item
        for item in token_result.scalars().all()
        if is_expo_push_token(item.expo_push_token)
    ]
    if not tokens:
        return 0

    sent_count = 0
    for batch_start in range(0, len(tokens), EXPO_BATCH_SIZE):
        batch = tokens[batch_start : batch_start + EXPO_BATCH_SIZE]
        deliveries = [
            PushDelivery(
                push_token_id=token.id,
                notification_id=notification.id,
                status="PENDING",
            )
            for token in batch
        ]
        db.add_all(deliveries)
        await db.flush()

        payloads = [
            build_direct_message_push_payload(
                expo_push_token=token.expo_push_token,
                room_id=str(message.room_id),
                message_id=str(message.id),
                sender=notification.sender,
                content=message.content,
                message_type=message.message_type,
            )
            for token in batch
        ]

        try:
            response = await _post_expo(settings.expo_push_url, payloads)
            tickets = response.get("data")
            if not isinstance(tickets, list) or len(tickets) != len(batch):
                raise ValueError("Expo Push Service returned mismatched ticket data")
        except Exception as exc:
            error_message = str(exc)[:500]
            for token, delivery in zip(batch, deliveries):
                delivery.status = "ERROR"
                delivery.error = error_message
                token.last_error = error_message
            logger.warning("Expo push request failed: %s", exc)
            continue

        for token, delivery, ticket in zip(batch, deliveries, tickets):
            if not isinstance(ticket, dict):
                delivery.status = "ERROR"
                delivery.error = "Invalid Expo push ticket"
                continue
            error, details = _ticket_error(ticket)
            delivery.details = details
            if ticket.get("status") == "ok" and isinstance(ticket.get("id"), str):
                delivery.status = "TICKETED"
                delivery.expo_ticket_id = ticket["id"]
                token.last_error = None
                sent_count += 1
            else:
                delivery.status = "ERROR"
                delivery.error = (error or "Expo rejected the push notification")[:500]
                token.last_error = delivery.error
                if error == "DeviceNotRegistered":
                    token.is_active = False

    await db.commit()
    return sent_count


async def sync_push_receipts(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> dict[str, int]:
    """Resolve old Expo tickets for the user's devices and retire invalid tokens."""
    cutoff = datetime.now(timezone.utc) - RECEIPT_MINIMUM_AGE
    result = await db.execute(
        select(PushDelivery)
        .join(PushToken, PushToken.id == PushDelivery.push_token_id)
        .where(
            PushToken.user_id == user_id,
            PushDelivery.status == "TICKETED",
            PushDelivery.expo_ticket_id.is_not(None),
            PushDelivery.created_at <= cutoff,
        )
        .order_by(PushDelivery.created_at)
        .limit(EXPO_RECEIPT_BATCH_SIZE)
    )
    deliveries = list(result.scalars().all())
    if not deliveries:
        return {"checked": 0, "delivered": 0, "failed": 0}

    ticket_ids = [
        delivery.expo_ticket_id
        for delivery in deliveries
        if delivery.expo_ticket_id is not None
    ]
    response = await _post_expo(
        settings.expo_push_receipts_url,
        {"ids": ticket_ids},
    )
    receipts = response.get("data")
    if not isinstance(receipts, dict):
        raise ValueError("Expo Push Service returned invalid receipt data")

    delivered = 0
    failed = 0
    for delivery in deliveries:
        receipt = receipts.get(delivery.expo_ticket_id)
        if not isinstance(receipt, dict):
            continue
        error, details = _ticket_error(receipt)
        delivery.details = details
        if receipt.get("status") == "ok":
            delivery.status = "DELIVERED"
            delivery.error = None
            delivered += 1
        else:
            delivery.status = "ERROR"
            delivery.error = (error or "Expo push delivery failed")[:500]
            failed += 1
            if error == "DeviceNotRegistered":
                delivery.push_token.is_active = False
                delivery.push_token.last_error = error

    await db.commit()
    return {
        "checked": len(deliveries),
        "delivered": delivered,
        "failed": failed,
    }
