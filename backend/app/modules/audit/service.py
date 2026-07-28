import json
from datetime import datetime, timezone
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from .models import AuditEvent


def _retention_deadline() -> datetime:
    now = datetime.now(timezone.utc)
    try:
        return now.replace(year=now.year + 3)
    except ValueError:
        return now.replace(year=now.year + 3, month=2, day=28)


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
        retention_until=_retention_deadline(),
    )
    db.add(event)
    return event
