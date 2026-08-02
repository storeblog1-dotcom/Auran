import json
from datetime import datetime, timedelta, timezone
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from .models import AuditEvent


def _retention_deadline(event_type: str) -> datetime:
    evidence_events = {
        "admin_report_view", "admin_report_action", "admin_report_legal_hold",
        "moderation_appeal_submitted", "moderation_appeal_decided",
        "permanent_deletion_confirmed", "integration_secret_rotated",
        "integration_enabled_changed",
    }
    days = 365 if event_type in evidence_events else 180
    return datetime.now(timezone.utc) + timedelta(days=days)


async def record(
    db: AsyncSession,
    *,
    user_id: Any = None,
    event_type: str,
    ip_address: str | None,
    target_type: str | None = None,
    target_id: Any = None,
    revision_id: Any = None,
    snapshot: dict | None = None,
) -> AuditEvent:
    event = AuditEvent(
        user_id=user_id,
        event_type=event_type,
        ip_address=ip_address,
        target_type=target_type,
        target_id=str(target_id) if target_id else None,
        revision_id=revision_id,
        snapshot=json.dumps(snapshot, ensure_ascii=False, default=str) if snapshot else None,
        retention_until=_retention_deadline(event_type),
    )
    db.add(event)
    return event
