import json
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from .models import AuditEvent


async def record(db: AsyncSession, *, user_id: Any = None, event_type: str, ip_address: str | None, target_type: str | None = None, target_id: Any = None, snapshot: dict | None = None) -> None:
    db.add(AuditEvent(user_id=user_id, event_type=event_type, ip_address=ip_address, target_type=target_type, target_id=str(target_id) if target_id else None, snapshot=json.dumps(snapshot, ensure_ascii=False, default=str) if snapshot else None))
