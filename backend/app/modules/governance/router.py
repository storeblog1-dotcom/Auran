from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.client_ip import get_client_ip
from app.common.exceptions import BadRequestException, NotFoundException, UnauthorizedException
from app.common.response import ApiResponse
from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password
from app.modules.audit.service import record
from app.modules.auth.dependencies import get_current_active_user, get_current_admin_user, get_current_superadmin_user, get_current_user
from app.modules.auth.models import User
from app.modules.governance.models import AccountSanction, IntegrationCredential, ModerationAppeal, ModerationCheck, PolicyDocument, UserConsent
from app.modules.governance.schemas import AdminRoleUpdate, AppealCreate, AppealDecision, IntegrationEnabledUpdate, IntegrationSecretUpsert, PermanentDeletionConfirm
from app.modules.governance.service import SUPPORTED_PROVIDERS, active_policies, encrypt_secret, test_provider


router = APIRouter(prefix="/governance", tags=["Governance"])
admin_router = APIRouter(prefix="/admin/integrations", tags=["Admin"])


@router.get("/policies/active", summary="현재 회원가입·개인정보 정책 목록")
async def get_active_policies(db: AsyncSession = Depends(get_db)) -> ApiResponse[list[dict]]:
    policies = await active_policies(db)
    return ApiResponse.ok([{
        "policy_key": policy.policy_key,
        "version": policy.version,
        "title": policy.title,
        "content": policy.content,
        "content_hash": policy.content_hash,
        "is_required": policy.is_required,
        "is_sensitive": policy.is_sensitive,
        "effective_at": policy.effective_at,
    } for policy in policies])


@router.get("/me/consents", summary="내 정책 동의 기록")
async def my_consents(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[dict]]:
    rows = list((await db.execute(select(UserConsent).where(UserConsent.user_id == current_user.id).order_by(UserConsent.accepted_at.desc()))).scalars().all())
    return ApiResponse.ok([{
        "policy_key": item.policy_key,
        "version": item.version,
        "accepted": item.accepted,
        "accepted_at": item.accepted_at,
        "withdrawn_at": item.withdrawn_at,
    } for item in rows])


@router.post("/appeals", summary="콘텐츠 또는 계정 조치 이의신청")
async def submit_appeal(
    body: AppealCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    if body.sanction_id:
        sanction = await db.scalar(select(AccountSanction).where(AccountSanction.id == body.sanction_id, AccountSanction.user_id == current_user.id))
        if not sanction:
            raise NotFoundException("Sanction")
    if body.moderation_check_id:
        check = await db.scalar(select(ModerationCheck).where(ModerationCheck.id == body.moderation_check_id, ModerationCheck.user_id == current_user.id))
        if not check:
            raise NotFoundException("Moderation check")
    existing = await db.scalar(select(ModerationAppeal.id).where(
        ModerationAppeal.user_id == current_user.id,
        ModerationAppeal.status == "received",
        ModerationAppeal.sanction_id == body.sanction_id,
        ModerationAppeal.moderation_check_id == body.moderation_check_id,
    ).limit(1))
    if existing:
        raise BadRequestException("이미 검토 중인 이의신청이 있습니다.")
    appeal = ModerationAppeal(
        user_id=current_user.id,
        sanction_id=body.sanction_id,
        moderation_check_id=body.moderation_check_id,
        statement=body.statement.strip(),
    )
    db.add(appeal)
    await db.flush()
    await record(db, user_id=current_user.id, event_type="moderation_appeal_submitted", ip_address=get_client_ip(request), target_type="moderation_appeal", target_id=appeal.id)
    await db.commit()
    return ApiResponse.ok({"id": appeal.id, "status": appeal.status})


@router.get("/me/moderation-actions", summary="내 콘텐츠 검수와 계정 제재 및 이의신청")
async def my_moderation_actions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    checks = list((await db.execute(
        select(ModerationCheck).where(ModerationCheck.user_id == current_user.id).order_by(ModerationCheck.created_at.desc()).limit(100)
    )).scalars().all())
    sanctions = list((await db.execute(
        select(AccountSanction).where(AccountSanction.user_id == current_user.id).order_by(AccountSanction.created_at.desc()).limit(100)
    )).scalars().all())
    appeals = list((await db.execute(
        select(ModerationAppeal).where(ModerationAppeal.user_id == current_user.id).order_by(ModerationAppeal.created_at.desc()).limit(100)
    )).scalars().all())
    return ApiResponse.ok({
        "moderation_checks": [{
            "id": row.id, "target_type": row.target_type, "status": row.status,
            "categories": row.categories, "created_at": row.created_at,
        } for row in checks],
        "sanctions": [{
            "id": row.id, "sanction_type": row.sanction_type, "reason": row.reason,
            "status": row.status, "starts_at": row.starts_at, "ends_at": row.ends_at,
            "created_at": row.created_at,
        } for row in sanctions],
        "appeals": [{
            "id": row.id, "sanction_id": row.sanction_id,
            "moderation_check_id": row.moderation_check_id, "statement": row.statement,
            "status": row.status, "decision_note": row.decision_note,
            "created_at": row.created_at, "reviewed_at": row.reviewed_at,
        } for row in appeals],
    })


def _summary(provider: str, credential: IntegrationCredential | None) -> dict:
    return {
        "provider": provider,
        "configured": credential is not None,
        "enabled": bool(credential and credential.enabled),
        "last_four": credential.last_four if credential else None,
        "fingerprint": credential.fingerprint[:12] if credential else None,
        "last_test_status": credential.last_test_status if credential else None,
        "last_tested_at": credential.last_tested_at if credential else None,
        "last_error": credential.last_error if credential else None,
        "bootstrap_ready": bool(settings.integration_master_key),
    }


@admin_router.get("", summary="외부 연동 상태")
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_superadmin_user),
) -> ApiResponse[list[dict]]:
    rows = {item.provider: item for item in (await db.execute(select(IntegrationCredential))).scalars().all()}
    return ApiResponse.ok([_summary(provider, rows.get(provider)) for provider in SUPPORTED_PROVIDERS])


@admin_router.put("/{provider}", summary="외부 연동 비밀키 등록 또는 회전")
async def upsert_integration(
    provider: str,
    body: IntegrationSecretUpsert,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superadmin_user),
) -> ApiResponse[dict]:
    if provider not in SUPPORTED_PROVIDERS:
        raise BadRequestException("지원하지 않는 공급자입니다.")
    if not admin.hashed_password or not verify_password(body.admin_password, admin.hashed_password):
        raise UnauthorizedException("관리자 재인증에 실패했습니다.")
    encrypted, nonce, fingerprint, last_four = encrypt_secret(provider, body.secret.strip())
    credential = await db.scalar(select(IntegrationCredential).where(IntegrationCredential.provider == provider).with_for_update())
    if credential:
        credential.encrypted_secret = encrypted
        credential.nonce = nonce
        credential.fingerprint = fingerprint
        credential.last_four = last_four
        credential.key_version = settings.integration_key_version
        credential.config = body.config
        credential.enabled = False
        credential.last_test_status = None
        credential.last_error = None
        credential.updated_by = admin.id
    else:
        credential = IntegrationCredential(
            provider=provider,
            encrypted_secret=encrypted,
            nonce=nonce,
            key_version=settings.integration_key_version,
            fingerprint=fingerprint,
            last_four=last_four,
            config=body.config,
            updated_by=admin.id,
        )
        db.add(credential)
    await record(db, user_id=None, event_type="integration_secret_rotated", ip_address=get_client_ip(request), target_type="integration", snapshot={"admin_id": str(admin.id), "provider": provider, "fingerprint": fingerprint[:12]})
    await db.commit()
    return ApiResponse.ok(_summary(provider, credential))


@admin_router.post("/{provider}/test", summary="외부 연동 연결 검사")
async def test_integration(
    provider: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superadmin_user),
) -> ApiResponse[dict]:
    from app.modules.governance.service import decrypt_secret

    credential = await db.scalar(select(IntegrationCredential).where(IntegrationCredential.provider == provider).with_for_update())
    if not credential:
        raise NotFoundException("Integration")
    status, error = await test_provider(provider, decrypt_secret(credential))
    credential.last_test_status = status
    credential.last_tested_at = datetime.now(timezone.utc)
    credential.last_error = error
    await record(db, user_id=None, event_type="integration_tested", ip_address=get_client_ip(request), target_type="integration", snapshot={"admin_id": str(admin.id), "provider": provider, "status": status})
    await db.commit()
    return ApiResponse.ok(_summary(provider, credential))


@admin_router.patch("/{provider}/enabled", summary="외부 연동 활성화 또는 비활성화")
async def set_integration_enabled(
    provider: str,
    body: IntegrationEnabledUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superadmin_user),
) -> ApiResponse[dict]:
    credential = await db.scalar(select(IntegrationCredential).where(IntegrationCredential.provider == provider).with_for_update())
    if not credential:
        raise NotFoundException("Integration")
    if body.enabled and credential.last_test_status != "success":
        raise BadRequestException("연결 검사에 성공한 자격증명만 활성화할 수 있습니다.")
    credential.enabled = body.enabled
    await record(db, user_id=None, event_type="integration_enabled_changed", ip_address=get_client_ip(request), target_type="integration", snapshot={"admin_id": str(admin.id), "provider": provider, "enabled": body.enabled})
    await db.commit()
    return ApiResponse.ok(_summary(provider, credential))


@router.patch("/admin/appeals/{appeal_id}", summary="관리자 이의신청 처리")
async def decide_appeal(
    appeal_id: UUID,
    body: AppealDecision,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict]:
    appeal = await db.scalar(select(ModerationAppeal).where(ModerationAppeal.id == appeal_id).with_for_update())
    if not appeal:
        raise NotFoundException("Appeal")
    if appeal.status != "received":
        raise BadRequestException("이미 처리된 이의신청입니다.")
    appeal.status = body.status
    appeal.decision_note = body.note.strip()
    appeal.reviewer_id = admin.id
    appeal.reviewed_at = datetime.now(timezone.utc)
    if body.status == "approved":
        if appeal.sanction_id:
            sanction = await db.scalar(select(AccountSanction).where(AccountSanction.id == appeal.sanction_id).with_for_update())
            if sanction and sanction.status == "active":
                sanction.status = "lifted"
                sanction.lifted_at = appeal.reviewed_at
                target_user = await db.scalar(select(User).where(User.id == sanction.user_id).with_for_update())
                if target_user:
                    target_user.suspended_until = None
                    if sanction.sanction_type == "permanent":
                        target_user.permanently_suspended_at = None
                        target_user.forced_deletion_due_at = None
        if appeal.moderation_check_id:
            moderation_check = await db.scalar(select(ModerationCheck).where(ModerationCheck.id == appeal.moderation_check_id).with_for_update())
            if moderation_check:
                moderation_check.status = "overturned"
    await record(db, user_id=None, event_type="moderation_appeal_decided", ip_address=get_client_ip(request), target_type="moderation_appeal", target_id=appeal.id, snapshot={"admin_id": str(admin.id), "status": body.status})
    await db.commit()
    from app.modules.notifications.service import create_notification
    await create_notification(
        db,
        recipient_id=appeal.user_id,
        sender_id=admin.id,
        type="CONTENT_MODERATION_RESULT",
        message="이의신청이 인용되어 계정 조치가 해제되었습니다." if body.status == "approved" else "이의신청 검토가 완료되었습니다. 자세한 내용은 안전 센터에서 확인해 주세요.",
    )
    return ApiResponse.ok({"id": appeal.id, "status": appeal.status})


@router.get("/admin/appeals", summary="관리자 이의신청 목록")
async def list_appeals(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
) -> ApiResponse[list[dict]]:
    query = select(ModerationAppeal).order_by(ModerationAppeal.created_at.desc()).limit(500)
    if status:
        query = query.where(ModerationAppeal.status == status)
    rows = list((await db.execute(query)).scalars().all())
    return ApiResponse.ok([{"id": row.id, "user_id": row.user_id, "sanction_id": row.sanction_id, "moderation_check_id": row.moderation_check_id, "statement": row.statement, "status": row.status, "decision_note": row.decision_note, "created_at": row.created_at, "reviewed_at": row.reviewed_at} for row in rows])


@router.get("/admin/moderation-checks", summary="관리자 콘텐츠 검수 기록")
async def list_moderation_checks(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
) -> ApiResponse[list[dict]]:
    query = select(ModerationCheck).order_by(ModerationCheck.created_at.desc()).limit(500)
    if status:
        query = query.where(ModerationCheck.status == status)
    rows = list((await db.execute(query)).scalars().all())
    return ApiResponse.ok([{"id": row.id, "user_id": row.user_id, "post_id": row.post_id, "target_type": row.target_type, "provider": row.provider, "status": row.status, "categories": row.categories, "scores": row.scores, "error_code": row.error_code, "created_at": row.created_at} for row in rows])


@router.post("/admin/maintenance", summary="기간 정지 해제 및 영구정지 검토기한 확인")
async def run_governance_maintenance(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict]:
    from app.modules.governance.service import process_expired_sanctions
    result = await process_expired_sanctions(db)
    await record(db, user_id=None, event_type="governance_maintenance_run", ip_address=get_client_ip(request), target_type="governance", snapshot={"admin_id": str(admin.id), **result})
    await db.commit()
    return ApiResponse.ok(result)


@router.delete("/admin/users/{user_id}/permanent", summary="90일 경과 영구정지 계정 최종 비식별 삭제")
async def finalize_permanent_deletion(
    user_id: UUID,
    body: PermanentDeletionConfirm,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superadmin_user),
) -> ApiResponse[dict]:
    from app.modules.audit.models import AuditEvent
    from app.modules.auth.models import User
    from app.modules.direct.models import DirectMessage
    from app.modules.notifications.models import Notification, PushToken
    from app.modules.posts.models import Comment, Post
    from app.modules.reports.models import Report

    if not admin.hashed_password or not verify_password(body.admin_password, admin.hashed_password):
        raise UnauthorizedException("관리자 재인증에 실패했습니다.")
    target = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not target:
        raise NotFoundException("User")
    if target.username != body.username:
        raise BadRequestException("확인용 사용자명이 일치하지 않습니다.")
    now = datetime.now(timezone.utc)
    if not target.permanently_suspended_at or not target.forced_deletion_due_at or target.forced_deletion_due_at > now:
        raise BadRequestException("영구정지 후 90일 검토기간이 지나지 않았습니다.")
    legal_hold = await db.scalar(select(AuditEvent.id).where(AuditEvent.user_id == target.id, AuditEvent.legal_hold.is_(True)).limit(1))
    report_hold = await db.scalar(select(Report.id).where(Report.target_user_id == target.id, Report.legal_hold.is_(True)).limit(1))
    if legal_hold or report_hold:
        raise BadRequestException("법적 보존 중인 자료가 있어 최종 삭제할 수 없습니다.")

    await record(db, user_id=None, event_type="permanent_deletion_confirmed", ip_address=get_client_ip(request), target_type="user", target_id=target.id, snapshot={"admin_id": str(admin.id), "review_period_days": 90})
    await db.execute(delete(Notification).where(or_(Notification.recipient_id == target.id, Notification.sender_id == target.id)))
    await db.execute(delete(PushToken).where(PushToken.user_id == target.id))
    await db.execute(delete(DirectMessage).where(DirectMessage.sender_id == target.id))
    await db.execute(delete(Post).where(Post.user_id == target.id))
    await db.execute(delete(Comment).where(Comment.user_id == target.id))
    await db.execute(delete(UserConsent).where(UserConsent.user_id == target.id))
    await db.execute(delete(ModerationAppeal).where(ModerationAppeal.user_id == target.id))
    target.username = f"removed_{target.id.hex[:22]}"
    target.email = f"{target.id.hex}@removed.invalid"
    target.full_name = "삭제된 사용자"
    target.nickname = None
    target.age = None
    target.gender = None
    target.sexual_orientation = None
    target.sexual_orientations = None
    target.height = None
    target.body_type = None
    target.bio = None
    target.profile_image_url = None
    target.google_id = None
    target.hashed_password = None
    target.installation_id_hmac = None
    target.is_active = False
    target.profile_visibility = "private"
    target.allow_message_requests = False
    await db.commit()
    return ApiResponse.ok({"user_id": target.id, "status": "personal_data_removed"})


@router.patch("/admin/users/{user_id}/role", summary="최고 관리자 역할 변경")
async def update_admin_role(
    user_id: UUID,
    body: AdminRoleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_superadmin_user),
) -> ApiResponse[dict]:
    if not admin.hashed_password or not verify_password(body.admin_password, admin.hashed_password):
        raise UnauthorizedException("관리자 재인증에 실패했습니다.")
    target = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not target:
        raise NotFoundException("User")
    if target.id == admin.id and body.role != "superadmin":
        superadmin_count = await db.scalar(select(func.count(User.id)).where(User.admin_role == "superadmin"))
        if (superadmin_count or 0) <= 1:
            raise BadRequestException("마지막 최고 관리자는 스스로 권한을 해제할 수 없습니다.")
    previous_role = target.admin_role
    target.admin_role = body.role
    target.is_admin = body.role != "member"
    await record(db, user_id=None, event_type="admin_role_changed", ip_address=get_client_ip(request), target_type="user", target_id=target.id, snapshot={"admin_id": str(admin.id), "previous_role": previous_role, "new_role": body.role})
    await db.commit()
    return ApiResponse.ok({"user_id": target.id, "admin_role": target.admin_role, "is_admin": target.is_admin})
