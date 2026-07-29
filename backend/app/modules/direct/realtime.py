import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt


REALTIME_TOKEN_TTL_SECONDS = 300


def direct_room_topic(room_id: uuid.UUID) -> str:
    return f"dm:{room_id}"


def direct_presence_topic(user_id: uuid.UUID) -> str:
    return f"dm-user:{user_id}"


def create_realtime_access_token(
    user_id: uuid.UUID,
    jwt_secret: str,
    *,
    now: datetime | None = None,
    ttl_seconds: int = REALTIME_TOKEN_TTL_SECONDS,
) -> tuple[str, datetime]:
    """Create a short-lived Supabase-compatible JWT for a private DM channel."""
    issued_at = now or datetime.now(timezone.utc)
    if issued_at.tzinfo is None:
        issued_at = issued_at.replace(tzinfo=timezone.utc)
    expires_at = issued_at + timedelta(seconds=ttl_seconds)
    payload = {
        "sub": str(user_id),
        "role": "authenticated",
        "aud": "authenticated",
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, jwt_secret, algorithm="HS256"), expires_at
