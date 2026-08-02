import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.exceptions import BadRequestException
from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.modules.feature_audit.models import FeatureAuditCredential, FeatureAuditLoginThrottle


CREDENTIAL_ID = uuid.UUID("fa000000-0000-4000-8000-000000000001")
SESSION_COOKIE = "auran_feature_audit_session"
PREAUTH_COOKIE = "auran_feature_audit_preauth"
MAX_FAILURES = 5
LOCK_MINUTES = 15


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def ip_hmac(ip_address: str | None) -> str:
    secret = (settings.installation_hmac_secret or settings.secret_key).encode("utf-8")
    return hmac.new(secret, (ip_address or "unknown").encode("utf-8"), hashlib.sha256).hexdigest()


async def ensure_credential(db: AsyncSession) -> FeatureAuditCredential | None:
    credential = await db.scalar(select(FeatureAuditCredential).where(FeatureAuditCredential.id == CREDENTIAL_ID))
    if credential or not settings.feature_audit_initial_password:
        return credential
    credential = FeatureAuditCredential(
        id=CREDENTIAL_ID,
        password_hash=hash_password(settings.feature_audit_initial_password),
        must_change_password=True,
        session_version=1,
    )
    db.add(credential)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        credential = await db.scalar(select(FeatureAuditCredential).where(FeatureAuditCredential.id == CREDENTIAL_ID))
    return credential


async def get_credential(db: AsyncSession) -> FeatureAuditCredential | None:
    return await db.scalar(select(FeatureAuditCredential).where(FeatureAuditCredential.id == CREDENTIAL_ID))


async def locked_seconds(db: AsyncSession, ip_address: str | None) -> int:
    throttle = await db.scalar(select(FeatureAuditLoginThrottle).where(FeatureAuditLoginThrottle.ip_hmac == ip_hmac(ip_address)))
    locked_until = _aware(throttle.locked_until) if throttle else None
    if not locked_until or locked_until <= utcnow():
        return 0
    return max(1, int((locked_until - utcnow()).total_seconds()))


async def register_failure(db: AsyncSession, ip_address: str | None) -> None:
    key = ip_hmac(ip_address)
    now = utcnow()
    throttle = await db.scalar(select(FeatureAuditLoginThrottle).where(FeatureAuditLoginThrottle.ip_hmac == key).with_for_update())
    if not throttle:
        throttle = FeatureAuditLoginThrottle(ip_hmac=key, failed_attempts=0, window_started_at=now)
        db.add(throttle)
    window_started = _aware(throttle.window_started_at) or now
    if now - window_started >= timedelta(minutes=LOCK_MINUTES):
        throttle.failed_attempts = 0
        throttle.window_started_at = now
        throttle.locked_until = None
    throttle.failed_attempts += 1
    if throttle.failed_attempts >= MAX_FAILURES:
        throttle.locked_until = now + timedelta(minutes=LOCK_MINUTES)
    await db.commit()


async def clear_failures(db: AsyncSession, ip_address: str | None) -> None:
    await db.execute(delete(FeatureAuditLoginThrottle).where(FeatureAuditLoginThrottle.ip_hmac == ip_hmac(ip_address)))
    await db.commit()


async def purge_stale_throttles(db: AsyncSession) -> int:
    result = await db.execute(
        delete(FeatureAuditLoginThrottle).where(FeatureAuditLoginThrottle.updated_at < utcnow() - timedelta(days=30))
    )
    await db.commit()
    return int(result.rowcount or 0)


def new_preauth_token() -> tuple[str, str]:
    csrf = secrets.token_urlsafe(24)
    payload = {"purpose": "feature_audit_preauth", "csrf": csrf, "exp": utcnow() + timedelta(minutes=15)}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm), csrf


def verify_preauth(token: str | None, csrf: str) -> bool:
    if not token or not csrf:
        return False
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return False
    return payload.get("purpose") == "feature_audit_preauth" and secrets.compare_digest(str(payload.get("csrf", "")), csrf)


def create_session(credential: FeatureAuditCredential) -> tuple[str, str]:
    csrf = secrets.token_urlsafe(24)
    payload = {
        "purpose": "feature_audit_session",
        "version": credential.session_version,
        "csrf": csrf,
        "exp": utcnow() + timedelta(hours=settings.feature_audit_session_hours),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm), csrf


async def read_session(db: AsyncSession, token: str | None) -> tuple[FeatureAuditCredential, dict] | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None
    if payload.get("purpose") != "feature_audit_session":
        return None
    credential = await get_credential(db)
    if not credential or int(payload.get("version", -1)) != credential.session_version:
        return None
    return credential, payload


def validate_new_password(password: str, confirmation: str) -> None:
    if password != confirmation:
        raise BadRequestException("새 비밀번호 확인이 일치하지 않습니다.")
    if len(password) < 12 or len(password) > 64 or len(password.encode("utf-8")) > 72:
        raise BadRequestException("새 비밀번호는 12~64자이며 UTF-8 기준 72바이트 이하여야 합니다.")
    categories = sum((any(c.islower() for c in password), any(c.isupper() for c in password), any(c.isdigit() for c in password), any(not c.isalnum() for c in password)))
    if categories < 3:
        raise BadRequestException("영문 대·소문자, 숫자, 특수문자 중 세 종류 이상을 사용해 주세요.")
    if settings.feature_audit_initial_password and secrets.compare_digest(password, settings.feature_audit_initial_password):
        raise BadRequestException("초기 비밀번호와 다른 비밀번호를 사용해 주세요.")


async def change_password(db: AsyncSession, credential: FeatureAuditCredential, password: str, confirmation: str) -> FeatureAuditCredential:
    validate_new_password(password, confirmation)
    credential.password_hash = hash_password(password)
    credential.must_change_password = False
    credential.session_version += 1
    credential.updated_by_user_id = None
    await db.commit()
    await db.refresh(credential)
    return credential


async def reset_password(db: AsyncSession, *, admin_user_id: uuid.UUID) -> FeatureAuditCredential:
    if not settings.feature_audit_initial_password:
        raise BadRequestException("FEATURE_AUDIT_INITIAL_PASSWORD 설정이 필요합니다.")
    credential = await get_credential(db)
    if not credential:
        credential = FeatureAuditCredential(id=CREDENTIAL_ID, password_hash="")
        db.add(credential)
    credential.password_hash = hash_password(settings.feature_audit_initial_password)
    credential.must_change_password = True
    credential.session_version = (credential.session_version or 0) + 1
    credential.updated_by_user_id = admin_user_id
    await db.execute(delete(FeatureAuditLoginThrottle))
    await db.commit()
    await db.refresh(credential)
    return credential


def password_matches(credential: FeatureAuditCredential, password: str) -> bool:
    try:
        return verify_password(password, credential.password_hash)
    except (TypeError, ValueError):
        return False
