import uuid
import logging
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.client_ip import get_client_ip
from app.common.exceptions import BadRequestException, NotFoundException
from app.common.response import ApiResponse
from app.core.database import get_db
from app.modules.audit.service import record
from app.modules.auth.dependencies import get_current_active_user, get_current_admin_user
from app.modules.auth.models import User
from app.modules.notifications.service import create_notification
from app.modules.posts import service as post_service
from app.modules.posts.models import Comment, Post
from app.modules.reports.models import HiddenContent, Report
from app.modules.reports.schemas import HideContentRequest, ReportCreate, ReportModerationUpdate
from app.modules.reports.service import create_report, hide_report_target
from app.modules.governance.models import AccountSanction


router = APIRouter(tags=["Reports"])
logger = logging.getLogger(__name__)


def _report_result_message(*, status: str, action: str, note: str | None) -> str:
    if status == "reviewing":
        message = "신고하신 내용이 검토 중입니다."
    elif status == "rejected":
        message = "신고하신 내용은 검토 후 기각되었습니다."
    else:
        action_label = {"maintain": "검토 완료", "hide": "콘텐츠 숨김", "delete": "콘텐츠 삭제", "warn": "경고 조치", "suspend": "이용 정지 조치"}.get(action, "처리 완료")
        message = f"신고하신 내용의 검토가 완료되었습니다. 처리 결과: {action_label}."
    if note and note.strip():
        message = f"{message} 관리자 안내: {note.strip()[:240]}"
    return message[:500]


def _report_item(report: Report, *, include_ip: bool = False) -> dict[str, Any]:
    return {
        "id": report.id,
        "reporter_id": report.reporter_id,
        "reason_code": report.reason_code,
        "reason_codes": report.reason_codes or [report.reason_code],
        "detail": report.detail,
        "status": report.status,
        "reporter_ip": report.reporter_ip if include_ip else None,
        "created_at": report.created_at,
        "resolution_action": report.resolution_action,
        "resolution_note": report.resolution_note,
    }


@router.post("/reports", summary="콘텐츠 또는 프로필 신고")
async def submit_report(
    body: ReportCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    report = await create_report(
        db, reporter=current_user, data=body, reporter_ip=get_client_ip(request)
    )
    admins = list((await db.execute(select(User).where(User.is_admin.is_(True), User.id != current_user.id))).scalars().all())
    for admin in admins:
        try:
            await create_notification(
                db,
                recipient_id=admin.id,
                sender_id=current_user.id,
                type="ADMIN_REPORT",
                message=f"긴급도 {report.priority} 신고가 접수되었습니다: {', '.join(report.reason_codes or [report.reason_code])}",
            )
        except Exception:
            logger.exception("Failed to notify admin %s for report %s", admin.id, report.id)
    return ApiResponse.ok(
        {
            "id": report.id,
            "target_type": report.target_type,
            "target_id": report.target_id,
            "status": report.status,
        }
    )


@router.post("/reports/{report_id}/hide", summary="신고한 콘텐츠를 내 화면에서 숨김")
async def hide_after_report(
    report_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    await hide_report_target(db, user=current_user, report_id=report_id)
    return ApiResponse.ok({"message": "숨김 처리했습니다."})


@router.post("/hidden-content", summary="콘텐츠를 내 화면에서 숨김")
async def hide_content(
    body: HideContentRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    existing = await db.scalar(
        select(HiddenContent).where(
            HiddenContent.user_id == current_user.id,
            HiddenContent.target_type == body.target_type,
            HiddenContent.target_id == body.target_id,
        )
    )
    if not existing:
        db.add(HiddenContent(user_id=current_user.id, target_type=body.target_type, target_id=body.target_id))
        await db.commit()
    return ApiResponse.ok({"message": "숨김 처리했습니다."})


@router.get("/admin/reports", summary="관리자 신고 목록")
async def admin_report_groups(
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[list[dict]]:
    query = select(Report)
    if status:
        query = query.where(Report.status == status)
    rows = (
        await db.execute(query.order_by(desc(Report.created_at)).limit(2000))
    ).scalars().all()
    grouped: OrderedDict[tuple[str, uuid.UUID], list[Report]] = OrderedDict()
    for report in rows:
        grouped.setdefault((report.target_type, report.target_id), []).append(report)
    groups = []
    for (_, _), reports in grouped.items():
        latest = reports[0]
        groups.append(
            {
                "target_type": latest.target_type,
                "target_id": latest.target_id,
                "target_user_id": latest.target_user_id,
                "report_count": len(reports),
                "status": latest.status,
                "latest_at": latest.created_at,
                "snapshot": latest.snapshot,
                "priority": max(report.priority for report in reports),
            }
        )
    total = len(groups)
    start = (page - 1) * size
    return ApiResponse.paginated(groups[start : start + size], total=total, has_more=start + size < total)


@router.get("/admin/reports/{target_type}/{target_id}", summary="관리자 신고 상세")
async def admin_report_detail(
    target_type: str,
    target_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict]:
    reports = (
        await db.execute(
            select(Report)
            .where(Report.target_type == target_type, Report.target_id == target_id)
            .order_by(desc(Report.created_at))
        )
    ).scalars().all()
    if not reports:
        raise NotFoundException("Report")

    await record(
        db,
        user_id=None,
        event_type="admin_report_view",
        ip_address=get_client_ip(request),
        target_type=target_type,
        target_id=target_id,
        snapshot={"admin_id": str(admin.id), "report_ids": [str(item.id) for item in reports]},
    )
    await db.commit()
    return ApiResponse.ok(
        {
            "target_type": target_type,
            "target_id": target_id,
            "target_user_id": reports[0].target_user_id,
            "snapshot": reports[0].snapshot,
            "reports": [_report_item(report, include_ip=True) for report in reports],
        }
    )


@router.patch("/admin/reports/{target_type}/{target_id}", summary="관리자 신고 처리")
async def moderate_report_group(
    target_type: str,
    target_id: uuid.UUID,
    body: ReportModerationUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict]:
    reports = (
        await db.execute(
            select(Report).where(Report.target_type == target_type, Report.target_id == target_id)
        )
    ).scalars().all()
    if not reports:
        raise NotFoundException("Report")

    allowed_content_actions = {
        "post": {"maintain", "hide", "delete"},
        "comment": {"maintain", "hide", "delete"},
        "profile": {"maintain"},
    }
    if body.content_action not in allowed_content_actions.get(target_type, set()):
        raise BadRequestException(
            f"{target_type} 신고에는 {body.content_action} 콘텐츠 조치를 적용할 수 없습니다."
        )

    if body.content_action == "hide":
        if target_type == "post":
            post = await db.scalar(select(Post).where(Post.id == target_id))
            if post:
                post.moderation_hidden = True
        elif target_type == "comment":
            comment = await db.scalar(select(Comment).where(Comment.id == target_id))
            if comment:
                comment.moderation_hidden = True
    elif body.content_action == "delete":
        if target_type == "post":
            await post_service.delete_post(
                db, target_id, admin, ip_address=get_client_ip(request)
            )
        elif target_type == "comment":
            await post_service.delete_comment(
                db, target_id, admin, ip_address=get_client_ip(request)
            )
    target_user = None
    if reports[0].target_user_id:
        target_user = await db.scalar(select(User).where(User.id == reports[0].target_user_id).with_for_update())
    sanction = None
    if body.sanction_type != "none":
        if not target_user:
            raise BadRequestException("제재할 작성자를 확인할 수 없습니다.")
        duration_days = {"suspend_5d": 5, "suspend_10d": 10, "suspend_30d": 30}.get(body.sanction_type)
        ends_at = datetime.now(timezone.utc) + timedelta(days=duration_days) if duration_days else None
        sanction = AccountSanction(
            user_id=target_user.id,
            sanction_type=body.sanction_type,
            reason=(body.note or "").strip(),
            starts_at=datetime.now(timezone.utc),
            ends_at=ends_at,
            created_by=admin.id,
            source_target_type=target_type,
            source_target_id=target_id,
        )
        db.add(sanction)
        if duration_days:
            target_user.suspended_until = ends_at
        elif body.sanction_type == "permanent":
            target_user.permanently_suspended_at = datetime.now(timezone.utc)
            target_user.forced_deletion_due_at = datetime.now(timezone.utc) + timedelta(days=90)
            from sqlalchemy import update
            await db.execute(update(Post).where(Post.user_id == target_user.id).values(moderation_hidden=True))
            await db.execute(update(Comment).where(Comment.user_id == target_user.id).values(moderation_hidden=True))

    now = datetime.now(timezone.utc)
    reporter_ids: set[uuid.UUID] = set()
    for report in reports:
        report.status = body.status
        report.reviewer_id = admin.id
        report.resolution_action = f"{body.content_action}:{body.sanction_type}"
        report.resolution_note = body.note
        report.reviewed_at = now
        if report.reporter_id and report.reporter_id != admin.id:
            reporter_ids.add(report.reporter_id)
    await record(
        db,
        user_id=None,
        event_type="admin_report_action",
        ip_address=get_client_ip(request),
        target_type=target_type,
        target_id=target_id,
        snapshot={
            "admin_id": str(admin.id),
            "status": body.status,
            "content_action": body.content_action,
            "sanction_type": body.sanction_type,
            "note": body.note,
        },
    )
    await db.commit()
    if sanction and target_user and target_user.id != admin.id:
        try:
            label = {"warning": "경고", "suspend_5d": "5일 이용 정지", "suspend_10d": "10일 이용 정지", "suspend_30d": "30일 이용 정지", "permanent": "영구 정지 및 90일 이의신청 기간"}.get(body.sanction_type, body.sanction_type)
            await create_notification(db, recipient_id=target_user.id, sender_id=admin.id, type="SANCTION_NOTICE", message=f"운영정책에 따라 {label} 조치되었습니다. 사유: {(body.note or '').strip()[:300]}", post_id=target_id if target_type == "post" else None)
        except Exception:
            logger.exception("Failed to notify moderated user %s", reports[0].target_user_id)
    return ApiResponse.ok({"message": "신고 처리를 저장했습니다."})


@router.patch("/admin/reports/{target_type}/{target_id}/legal-hold", summary="신고 증거 법적 보존 설정")
async def set_report_legal_hold(
    target_type: str,
    target_id: uuid.UUID,
    request: Request,
    enabled: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ApiResponse[dict]:
    reports = (
        await db.execute(
            select(Report).where(Report.target_type == target_type, Report.target_id == target_id)
        )
    ).scalars().all()
    if not reports:
        raise NotFoundException("Report")
    for report in reports:
        report.legal_hold = enabled
    await record(
        db,
        user_id=None,
        event_type="admin_report_legal_hold",
        ip_address=get_client_ip(request),
        target_type=target_type,
        target_id=target_id,
        snapshot={"admin_id": str(admin.id), "enabled": enabled},
    )
    await db.commit()
    return ApiResponse.ok({"message": "법적 보존 상태를 변경했습니다.", "enabled": enabled})
