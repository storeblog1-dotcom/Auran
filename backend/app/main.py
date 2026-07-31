from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.common.exceptions import AppException, app_exception_handler
from app.core.config import settings
from app.core.database import Base, engine
from app.modules.auth.models import User  # noqa: F401
from app.modules.audit.models import AuditEvent, WithdrawnAccount  # noqa: F401
from app.modules.posts.models import Post, Comment, PostLike, PostMedia, PostBookmark, PostRepost  # noqa: F401
from app.modules.stories.models import Story  # noqa: F401
from app.modules.users.models import Follow  # noqa: F401
from app.modules.notifications.models import Notification  # noqa: F401
from app.modules.direct.models import ChatRoom, ChatRoomMember, ChatMessage, DirectConversation, DirectConversationMember, DirectMessage  # noqa: F401
from app.modules.community.models import CommunityBoard, CommunityNotice  # noqa: F401
from app.modules.hashtags.models import Hashtag, PostHashtag  # noqa: F401
from app.modules.reports.models import HiddenContent, Report  # noqa: F401
from sqlalchemy.ext.asyncio import AsyncSession


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 앱 시작 시
    print(f"[STARTUP] {settings.app_name} starting up...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        from sqlalchemy import text
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("ALTER TABLE community_notices ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("UPDATE community_notices SET is_global = FALSE WHERE board_id IS NOT NULL;"))
            await conn.execute(text("""
                UPDATE community_notices 
                SET is_global = FALSE 
                WHERE is_global = TRUE AND id NOT IN (
                    SELECT id FROM community_notices 
                    WHERE is_active = TRUE AND is_global = TRUE
                    ORDER BY created_at DESC 
                    LIMIT 1
                );
            """))
            await conn.execute(text("""
                UPDATE audit_events
                SET user_id = post_revisions.user_id
                FROM post_revisions
                WHERE audit_events.revision_id = post_revisions.id
                  AND audit_events.event_type = 'post_deleted'
                  AND audit_events.user_id != post_revisions.user_id;
            """))
            await conn.execute(text("""
                UPDATE audit_events
                SET user_id = comment_revisions.user_id
                FROM comment_revisions
                WHERE audit_events.revision_id = comment_revisions.id
                  AND audit_events.event_type = 'comment_deleted'
                  AND audit_events.user_id != comment_revisions.user_id;
            """))
        except Exception as e:
            print(f"[STARTUP] Column alter notice: {e}")

    # ─── Ensure Admin User (auran / !Qwertyuiop1) ───
    async with AsyncSession(engine) as db:
        from sqlalchemy import select
        from app.modules.auth.models import User
        from app.core.security import hash_password

        res = await db.execute(select(User).where(User.username == "auran"))
        admin_user = res.scalar_one_or_none()

        if not admin_user:
            admin_user = User(
                username="auran",
                email="auran@auran.com",
                full_name="관리자 (Auran)",
                hashed_password=hash_password("!Qwertyuiop1"),
                is_active=True,
                is_verified=True,
                is_admin=True,
            )
            db.add(admin_user)
            await db.commit()
            print("[STARTUP] Created admin user: auran")
        else:
            if not admin_user.is_admin or not admin_user.hashed_password:
                admin_user.is_admin = True
                admin_user.hashed_password = hash_password("!Qwertyuiop1")
                await db.commit()
                print("[STARTUP] Updated admin user: auran")

    yield
    # 앱 종료 시
    await engine.dispose()
    print("[SHUTDOWN] Shutting down...")


tags_metadata = [
    {
        "name": "Auth",
        "description": "🔑 **인증 API**: 회원가입, 로그인(JWT 토큰 발급), Access Token 갱신, 내 정보 조회",
    },
    {
        "name": "Users",
        "description": "👤 **사용자 API**: 프로필 조회 및 수정, 비밀번호 변경, 사용자 검색, 팔로우/언팔로우, 팔로워/팔로잉 목록",
    },
    {
        "name": "Posts",
        "description": "📸 **게시물 API**: 메인 피드(타임라인), 새 게시물 작성, 게시물 상세/수정/삭제, 사용자별 게시물 목록",
    },
    {
        "name": "Health",
        "description": "💓 **헬스체크 API**: 서버 상태 및 헬스 체크",
    },
    {
        "name": "Stories",
        "description": "⭕ **스토리 API**: 스토리 작성, 피드 조회, 읽음 처리, 스토리 삭제",
    },
    {
        "name": "Notifications",
        "description": "🔔 **알림 API**: 실시간 인앱 알림 목록 조회, 읽지 않은 알림 개수, 읽음 처리, WebSocket 구독",
    },
    {
        "name": "Admin",
        "description": "🛡️ **관리자 API**: 서비스 지표 통계, 사용자 정지/관리, 게시물 모니터링/강제 삭제",
    },
]

app = FastAPI(
    title="Aura+n REST API",
    version="1.0.0",
    description="Aura+n REST API documentation",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=tags_metadata,
    swagger_ui_parameters={"docExpansion": "list", "filter": True},
    lifespan=lifespan,
)

# ─── CORS ───────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from fastapi.staticfiles import StaticFiles

# ─── Static Files (Uploads) ─────────────────────────────────
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")
os.makedirs(os.path.join(STATIC_DIR, "uploads"), exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# ─── Exception Handlers ─────────────────────────────────────
app.add_exception_handler(AppException, app_exception_handler)  # type: ignore


# ─── Health Check ───────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": "1.0.1-cloudrun-auto-deploy",
        "message": "🎉 Cloud Run 자동 배포 CI/CD 성공 테스트 완료!",
        "deployed_at": "2026-07-26"
    }


# ─── Routers ────────────────────────────────────────────────
from app.modules.auth.router import router as auth_router
from app.modules.posts.router import router as posts_router
from app.modules.posts.router import users_posts_router
from app.modules.users.router import router as users_router
from app.modules.uploads.router import router as upload_router
from app.modules.stories.router import router as stories_router
from app.modules.direct.router import router as direct_router
from app.modules.hashtags.router import router as hashtags_router
from app.modules.notifications.router import router as notifications_router
from app.modules.admin.router import router as admin_router
from app.modules.community.router import router as community_router
from app.modules.reports.router import router as reports_router

app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(posts_router, prefix="/api/v1")
app.include_router(users_posts_router, prefix="/api/v1")
app.include_router(upload_router, prefix="/api/v1")
app.include_router(stories_router, prefix="/api/v1")
app.include_router(direct_router, prefix="/api/v1")
app.include_router(hashtags_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(community_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
