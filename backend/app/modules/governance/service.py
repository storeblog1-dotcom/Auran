import base64
import hashlib
import hmac
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.exceptions import BadRequestException
from app.core.config import settings
from app.modules.governance.models import AccountSanction, IntegrationCredential, ModerationCheck, PolicyDocument, UserConsent


SUPPORTED_PROVIDERS = ("openai", "resend", "turnstile", "google_vision")


@dataclass(frozen=True)
class ModerationDecision:
    status: str
    categories: dict
    scores: dict
    provider_request_id: str | None = None
    error_code: str | None = None

    @property
    def user_message(self) -> str:
        if self.status == "rejected":
            return "이미지 또는 문구가 커뮤니티 운영정책에 맞지 않아 등록되지 않았습니다. 계정에는 자동 제재가 적용되지 않습니다."
        if self.status == "review_required":
            return "자동 검수로 판단하기 어려워 콘텐츠가 공개되지 않았습니다. 이의신청을 통해 재검토를 요청할 수 있습니다."
        if self.status == "provider_error":
            return "현재 안전 검수를 완료할 수 없어 콘텐츠를 등록하지 않았습니다. 잠시 후 다시 시도해 주세요."
        return "안전 검수를 통과했습니다."


def installation_hmac(raw_installation_id: str | None) -> str | None:
    value = (raw_installation_id or "").strip()
    if not value:
        return None
    secret = (settings.installation_hmac_secret or settings.secret_key).encode("utf-8")
    return hmac.new(secret, value.encode("utf-8"), hashlib.sha256).hexdigest()


async def enforce_signup_risk(
    db: AsyncSession,
    *,
    ip_address: str | None,
    installation_id: str | None,
) -> None:
    """Apply temporary step-up thresholds without treating a shared IP as identity."""
    from datetime import timedelta
    from app.modules.audit.models import AuditEvent
    from app.modules.auth.models import User

    now = datetime.now(timezone.utc)
    install_hash = installation_hmac(installation_id)
    if install_hash:
        installations = await db.scalar(
            select(func.count(User.id)).where(
                User.installation_id_hmac == install_hash,
                User.created_at >= now - timedelta(days=30),
            )
        )
        if (installations or 0) >= 2:
            raise BadRequestException("이 설치 환경의 가입 시도가 많아 추가 본인확인이 필요합니다.")
    if ip_address:
        ip_signups = await db.scalar(
            select(func.count(AuditEvent.id)).where(
                AuditEvent.event_type == "signup",
                AuditEvent.ip_address == ip_address,
                AuditEvent.created_at >= now - timedelta(hours=24),
            )
        )
        if (ip_signups or 0) >= 3:
            raise BadRequestException("현재 네트워크의 가입 시도가 많아 추가 본인확인이 필요합니다.")


def _master_key() -> bytes:
    if not settings.integration_master_key:
        raise BadRequestException("Secret Manager의 INTEGRATION_MASTER_KEY가 필요합니다.")
    try:
        key = base64.urlsafe_b64decode(settings.integration_master_key.encode("ascii"))
    except Exception as exc:
        raise BadRequestException("INTEGRATION_MASTER_KEY 형식이 올바르지 않습니다.") from exc
    if len(key) != 32:
        raise BadRequestException("INTEGRATION_MASTER_KEY는 URL-safe base64 32바이트 키여야 합니다.")
    return key


def encrypt_secret(provider: str, secret: str) -> tuple[str, str, str, str]:
    nonce = os.urandom(12)
    encrypted = AESGCM(_master_key()).encrypt(nonce, secret.encode("utf-8"), provider.encode("utf-8"))
    fingerprint = hmac.new(_master_key(), secret.encode("utf-8"), hashlib.sha256).hexdigest()
    return (
        base64.urlsafe_b64encode(encrypted).decode("ascii"),
        base64.urlsafe_b64encode(nonce).decode("ascii"),
        fingerprint,
        secret[-4:],
    )


def decrypt_secret(credential: IntegrationCredential) -> str:
    encrypted = base64.urlsafe_b64decode(credential.encrypted_secret.encode("ascii"))
    nonce = base64.urlsafe_b64decode(credential.nonce.encode("ascii"))
    plain = AESGCM(_master_key()).decrypt(nonce, encrypted, credential.provider.encode("utf-8"))
    return plain.decode("utf-8")


async def active_policies(db: AsyncSession) -> list[PolicyDocument]:
    return list((await db.execute(select(PolicyDocument).where(PolicyDocument.is_active.is_(True)).order_by(PolicyDocument.policy_key))).scalars().all())


async def validate_and_store_consents(
    db: AsyncSession,
    *,
    user_id,
    acceptances,
    ip_address: str | None,
    installation_id: str | None,
    sensitive_data_provided: bool = False,
) -> None:
    policies = await active_policies(db)
    provided = {(item.policy_key, item.version): item.accepted for item in acceptances}
    missing = [policy.title for policy in policies if policy.is_required and provided.get((policy.policy_key, policy.version)) is not True]
    if missing:
        raise BadRequestException(f"필수 정책 동의가 필요합니다: {', '.join(missing)}")
    sensitive_policies = [policy for policy in policies if policy.is_sensitive]
    if sensitive_data_provided and not any(provided.get((policy.policy_key, policy.version)) is True for policy in sensitive_policies):
        raise BadRequestException("민감 프로필 정보를 입력하려면 별도 동의가 필요합니다.")
    install_hash = installation_hmac(installation_id)
    for policy in policies:
        accepted = provided.get((policy.policy_key, policy.version))
        if accepted is None:
            continue
        db.add(UserConsent(
            user_id=user_id,
            policy_key=policy.policy_key,
            version=policy.version,
            content_hash=policy.content_hash,
            accepted=accepted,
            ip_address=ip_address,
            installation_id_hmac=install_hash,
        ))


async def get_integration(db: AsyncSession, provider: str) -> IntegrationCredential | None:
    return await db.scalar(select(IntegrationCredential).where(IntegrationCredential.provider == provider))


async def get_active_secret(db: AsyncSession, provider: str) -> str | None:
    credential = await get_integration(db, provider)
    if not credential or not credential.enabled or credential.last_test_status != "success":
        return None
    return decrypt_secret(credential)


async def test_provider(provider: str, secret: str) -> tuple[str, str | None]:
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            if provider == "openai":
                response = await client.post(
                    "https://api.openai.com/v1/moderations",
                    headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
                    json={"model": "omni-moderation-latest", "input": "connection test"},
                )
                if response.status_code == 200:
                    return "success", None
                return "failed", f"OpenAI HTTP {response.status_code}"
            if provider == "resend":
                response = await client.get("https://api.resend.com/domains", headers={"Authorization": f"Bearer {secret}"})
                if response.status_code == 200:
                    return "success", None
                return "failed", f"Resend HTTP {response.status_code}"
            if provider == "google_vision":
                response = await client.post(
                    f"https://vision.googleapis.com/v1/images:annotate?key={secret}",
                    json={"requests": []},
                )
                if response.status_code == 200:
                    return "success", None
                return "failed", f"Google Vision HTTP {response.status_code}"
            if provider == "turnstile":
                return "manual_setup_required", "Site Key와 실제 클라이언트 토큰을 함께 검증해야 합니다."
    except httpx.HTTPError as exc:
        return "failed", exc.__class__.__name__
    return "failed", "지원하지 않는 공급자입니다."


def _flatten_openai_result(payload: dict) -> tuple[dict, dict]:
    result = (payload.get("results") or [{}])[0]
    categories = result.get("categories") or {}
    scores = result.get("category_scores") or {}
    return categories, scores


def classify_moderation_result(categories: dict, scores: dict) -> str:
    hard_categories = ("sexual", "sexual/minors")
    hard_reject = any(
        bool(categories.get(name))
        and float(scores.get(name, 0)) >= (0.85 if name == "sexual" else 0.50)
        for name in hard_categories
    )
    if hard_reject:
        return "rejected"
    if any(bool(value) for value in categories.values()):
        return "review_required"
    return "safe"


async def moderate_openai(
    db: AsyncSession,
    *,
    user_id,
    target_type: str,
    text: str | None = None,
    image_data_url: str | None = None,
    post_id=None,
) -> ModerationDecision:
    secret = await get_active_secret(db, "openai")
    if not secret:
        status = "provider_error" if settings.content_moderation_required else "disabled"
        decision = ModerationDecision(status=status, categories={}, scores={}, error_code="provider_not_active")
    else:
        inputs: list[dict] = []
        if text and text.strip():
            inputs.append({"type": "text", "text": text.strip()})
        if image_data_url:
            inputs.append({"type": "image_url", "image_url": {"url": image_data_url}})
        if not inputs:
            return ModerationDecision(status="safe", categories={}, scores={})
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/moderations",
                    headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
                    json={"model": "omni-moderation-latest", "input": inputs},
                )
            if response.status_code != 200:
                decision = ModerationDecision(status="provider_error", categories={}, scores={}, error_code=f"http_{response.status_code}")
            else:
                payload = response.json()
                categories, scores = _flatten_openai_result(payload)
                status = classify_moderation_result(categories, scores)
                decision = ModerationDecision(status=status, categories=categories, scores=scores, provider_request_id=payload.get("id"))
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            decision = ModerationDecision(status="provider_error", categories={}, scores={}, error_code=exc.__class__.__name__)

    db.add(ModerationCheck(
        user_id=user_id,
        post_id=post_id,
        target_type=target_type,
        provider="openai",
        status=decision.status,
        categories=decision.categories,
        scores=decision.scores,
        provider_request_id=decision.provider_request_id,
        error_code=decision.error_code,
    ))
    await db.flush()
    return decision


async def notify_content_moderation(db: AsyncSession, *, user_id, decision: ModerationDecision) -> None:
    """Create an in-app/push notice without pretending the user was sanctioned."""
    from app.modules.auth.models import User
    from app.modules.notifications.service import create_notification

    sender_id = await db.scalar(
        select(User.id)
        .where(User.admin_role == "superadmin", User.id != user_id)
        .order_by(User.created_at.asc())
        .limit(1)
    )
    if not sender_id:
        sender_id = await db.scalar(
            select(User.id).where(User.is_admin.is_(True), User.id != user_id).limit(1)
        )
    if sender_id:
        await create_notification(
            db,
            recipient_id=user_id,
            sender_id=sender_id,
            type="CONTENT_MODERATION_RESULT",
            message=decision.user_message,
        )
    else:
        await db.commit()


async def process_expired_sanctions(db: AsyncSession) -> dict[str, object]:
    from app.modules.auth.models import User

    now = datetime.now(timezone.utc)
    expired = list((await db.execute(
        select(AccountSanction)
        .where(AccountSanction.status == "active", AccountSanction.ends_at.is_not(None), AccountSanction.ends_at <= now)
        .with_for_update()
    )).scalars().all())
    for sanction in expired:
        sanction.status = "expired"
        sanction.lifted_at = now
        user = await db.scalar(select(User).where(User.id == sanction.user_id).with_for_update())
        if user and user.suspended_until and user.suspended_until <= now:
            user.suspended_until = None
    due_users = list((await db.execute(
        select(User.id).where(User.permanently_suspended_at.is_not(None), User.forced_deletion_due_at.is_not(None), User.forced_deletion_due_at <= now)
    )).scalars().all())
    await db.commit()
    return {"expired_sanctions": len(expired), "permanent_review_due_user_ids": [str(value) for value in due_users]}
