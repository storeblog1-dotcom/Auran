import html
import os
from pathlib import Path
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.client_ip import get_client_ip
from app.core.config import settings
from app.core.database import get_db
from app.modules.audit.service import record
from app.modules.feature_audit.service import (
    PREAUTH_COOKIE,
    SESSION_COOKIE,
    change_password,
    clear_failures,
    create_session,
    ensure_credential,
    locked_seconds,
    new_preauth_token,
    password_matches,
    read_session,
    register_failure,
    verify_preauth,
)


router = APIRouter(tags=["Feature Audit"])
ALLOWED_ASSETS = {"index.html", "styles.css", "app.js", "test-accounts.js"}


def _asset_directory() -> Path:
    configured = os.getenv("FEATURE_AUDIT_DIR", "").strip()
    candidates = [
        Path(configured) if configured else None,
        Path(__file__).resolve().parents[2] / "feature_audit",
        Path(__file__).resolve().parents[4] / "docs" / "feature-audit",
    ]
    for candidate in candidates:
        if candidate and (candidate / "index.html").is_file():
            return candidate
    return Path(__file__).resolve().parents[2] / "feature_audit"


def _secure_cookie() -> bool:
    return settings.app_env.lower() == "production"


def _harden(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    return response


def _page(title: str, body: str, status_code: int = 200) -> HTMLResponse:
    document = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><style>
    :root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;padding:20px}}main{{width:min(440px,100%);background:#172033;border:1px solid #334155;border-radius:20px;padding:28px;box-shadow:0 24px 70px #0008}}h1{{margin:0 0 8px;font-size:26px}}p{{color:#94a3b8;line-height:1.55}}label{{display:block;margin:16px 0 7px;font-weight:700}}input{{width:100%;min-height:48px;border:1px solid #475569;border-radius:12px;background:#0f172a;color:#fff;padding:0 13px;font-size:16px}}button{{width:100%;min-height:48px;border:0;border-radius:12px;background:#7c3aed;color:#fff;font-weight:800;font-size:15px;margin-top:18px;cursor:pointer}}.error{{padding:11px;border-radius:10px;background:#7f1d1d;color:#fecaca}}.hint{{font-size:12px}}a{{color:#c4b5fd}}</style></head><body><main>{body}</main></body></html>"""
    return _harden(HTMLResponse(document, status_code=status_code))


async def _form(request: Request) -> dict[str, str]:
    body = await request.body()
    if len(body) > 8192:
        return {}
    values = parse_qs(body.decode("utf-8", errors="replace"), keep_blank_values=True)
    return {key: items[-1] for key, items in values.items() if items}


async def _audit(db: AsyncSession, request: Request, event_type: str, outcome: str) -> None:
    await record(
        db,
        event_type=event_type,
        ip_address=get_client_ip(request),
        target_type="feature_audit",
        snapshot={"outcome": outcome, "user_agent": request.headers.get("user-agent", "")[:200]},
    )
    await db.commit()


@router.get("/feature-audit/login", response_class=HTMLResponse)
async def login_page(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    session = await read_session(db, request.cookies.get(SESSION_COOKIE))
    if session:
        return RedirectResponse("/feature-audit/change-password" if session[0].must_change_password else "/feature-audit", status_code=303)
    token, csrf = new_preauth_token()
    response = _page("Auran 기능 감사 로그인", f"""
        <h1>기능 구현 감사</h1><p>승인된 관리자만 접근할 수 있습니다.</p>
        <form method="post" action="/feature-audit/login">
          <input type="hidden" name="csrf" value="{html.escape(csrf)}">
          <label for="password">감사 페이지 비밀번호</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
          <button type="submit">로그인</button>
        </form><p class="hint">5회 실패하면 해당 접속 환경은 15분간 잠깁니다.</p>
    """)
    response.set_cookie(PREAUTH_COOKIE, token, max_age=900, httponly=True, secure=_secure_cookie(), samesite="strict", path="/feature-audit")
    return response


@router.post("/feature-audit/login", response_class=HTMLResponse)
async def login(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    form = await _form(request)
    if not verify_preauth(request.cookies.get(PREAUTH_COOKIE), form.get("csrf", "")):
        return _page("로그인 실패", '<h1>요청 만료</h1><p class="error">로그인 페이지를 새로 열어 다시 시도해 주세요.</p><a href="/feature-audit/login">로그인으로 돌아가기</a>', 400)
    ip_address = get_client_ip(request)
    remaining = await locked_seconds(db, ip_address)
    if remaining:
        await _audit(db, request, "feature_audit_login_blocked", "rate_limited")
        return _page("접근 잠김", f'<h1>잠시 후 다시 시도하세요</h1><p class="error">반복 실패로 약 {max(1, remaining // 60 + 1)}분 동안 잠겼습니다.</p>', 429)
    credential = await ensure_credential(db)
    if not credential:
        return _page("설정 필요", '<h1>감사 페이지 준비 중</h1><p class="error">서버 초기 비밀번호 설정이 필요합니다.</p>', 503)
    if not password_matches(credential, form.get("password", "")):
        await register_failure(db, ip_address)
        await _audit(db, request, "feature_audit_login_failed", "invalid_password")
        return _page("로그인 실패", '<h1>로그인 실패</h1><p class="error">비밀번호가 올바르지 않습니다.</p><a href="/feature-audit/login">다시 시도</a>', 401)
    await clear_failures(db, ip_address)
    await _audit(db, request, "feature_audit_login_succeeded", "must_change" if credential.must_change_password else "granted")
    token, _ = create_session(credential)
    response = RedirectResponse("/feature-audit/change-password" if credential.must_change_password else "/feature-audit", status_code=303)
    response.set_cookie(SESSION_COOKIE, token, max_age=settings.feature_audit_session_hours * 3600, httponly=True, secure=_secure_cookie(), samesite="strict", path="/feature-audit")
    response.delete_cookie(PREAUTH_COOKIE, path="/feature-audit")
    return _harden(response)


@router.get("/feature-audit/change-password", response_class=HTMLResponse)
async def change_password_page(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    session = await read_session(db, request.cookies.get(SESSION_COOKIE))
    if not session:
        return RedirectResponse("/feature-audit/login", status_code=303)
    _, payload = session
    return _page("감사 페이지 비밀번호 변경", f"""
      <h1>{'최초 비밀번호 변경' if session[0].must_change_password else '비밀번호 변경'}</h1>
      <p>앱 Superadmin 비밀번호와 다른 감사 페이지 전용 비밀번호를 설정하세요.</p>
      <form method="post" action="/feature-audit/change-password">
        <input type="hidden" name="csrf" value="{html.escape(str(payload.get('csrf', '')))}">
        <label for="password">새 비밀번호</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="64" required autofocus>
        <label for="confirmation">새 비밀번호 확인</label><input id="confirmation" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="64" required>
        <button type="submit">변경하고 감사 페이지 열기</button>
      </form><p class="hint">12자 이상, 영문 대·소문자·숫자·특수문자 중 세 종류 이상을 사용하세요.</p>
    """)


@router.post("/feature-audit/change-password", response_class=HTMLResponse)
async def update_password(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    session = await read_session(db, request.cookies.get(SESSION_COOKIE))
    if not session:
        return RedirectResponse("/feature-audit/login", status_code=303)
    credential, payload = session
    form = await _form(request)
    if not form.get("csrf") or not hmac_compare(str(payload.get("csrf", "")), form.get("csrf", "")):
        return _page("변경 실패", '<h1>요청 만료</h1><p class="error">페이지를 새로 열어 다시 시도해 주세요.</p>', 400)
    try:
        credential = await change_password(db, credential, form.get("password", ""), form.get("confirmation", ""))
    except Exception as exc:
        message = getattr(exc, "message", "비밀번호를 변경하지 못했습니다.")
        return _page("변경 실패", f'<h1>변경 실패</h1><p class="error">{html.escape(message)}</p><a href="/feature-audit/change-password">다시 시도</a>', 400)
    await _audit(db, request, "feature_audit_password_changed", "success")
    token, _ = create_session(credential)
    response = RedirectResponse("/feature-audit", status_code=303)
    response.set_cookie(SESSION_COOKIE, token, max_age=settings.feature_audit_session_hours * 3600, httponly=True, secure=_secure_cookie(), samesite="strict", path="/feature-audit")
    return _harden(response)


def hmac_compare(left: str, right: str) -> bool:
    import secrets
    return secrets.compare_digest(left, right)


@router.get("/feature-audit/logout")
async def logout(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    if await read_session(db, request.cookies.get(SESSION_COOKIE)):
        await _audit(db, request, "feature_audit_logout", "success")
    response = RedirectResponse("/feature-audit/login", status_code=303)
    response.delete_cookie(SESSION_COOKIE, path="/feature-audit")
    return _harden(response)


@router.get("/feature-audit")
@router.get("/feature-audit/")
async def audit_index(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    session = await read_session(db, request.cookies.get(SESSION_COOKIE))
    if not session:
        return RedirectResponse("/feature-audit/login", status_code=303)
    if session[0].must_change_password:
        return RedirectResponse("/feature-audit/change-password", status_code=303)
    path = _asset_directory() / "index.html"
    if not path.is_file():
        return _page("감사 페이지 없음", "<h1>배포 파일을 찾지 못했습니다.</h1>", 503)
    return _harden(FileResponse(path, media_type="text/html"))


@router.get("/feature-audit/{asset_name}")
async def audit_asset(asset_name: str, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    if asset_name not in ALLOWED_ASSETS or asset_name == "index.html":
        return _page("찾을 수 없음", "<h1>요청한 파일이 없습니다.</h1>", 404)
    session = await read_session(db, request.cookies.get(SESSION_COOKIE))
    if not session:
        return RedirectResponse("/feature-audit/login", status_code=303)
    if session[0].must_change_password:
        return RedirectResponse("/feature-audit/change-password", status_code=303)
    path = _asset_directory() / asset_name
    if not path.is_file():
        return _page("찾을 수 없음", "<h1>요청한 파일이 없습니다.</h1>", 404)
    media_type = {"css": "text/css", "js": "application/javascript"}.get(path.suffix.lstrip("."), "application/octet-stream")
    return _harden(FileResponse(path, media_type=media_type))
