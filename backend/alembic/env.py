import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import Base

# ─── 모든 모델을 import해야 autogenerate가 인식 ──────────────
from app.modules.auth.models import User  # noqa: F401
from app.modules.posts.models import Post, PostMedia, PostReport  # noqa: F401
from app.modules.users.models import Follow, FollowRequest, UserBlock  # noqa: F401
from app.modules.direct.models import ChatRoom, ChatRoomMember, ChatMessage  # noqa: F401
from app.modules.hashtags.models import Hashtag, PostHashtag  # noqa: F401
from app.modules.community.models import CommunityBoard, CommunityNotice  # noqa: F401
from app.modules.reports.models import HiddenContent, Report  # noqa: F401


# ─── Alembic Config ──────────────────────────────────────────
config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ─── Offline mode ────────────────────────────────────────────
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ─── Online mode (async) ─────────────────────────────────────
def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # NullPool: 마이그레이션은 커넥션 풀 없이 직접 연결 (asyncpg 호환)
    engine = create_async_engine(settings.database_url, poolclass=NullPool, connect_args={"statement_cache_size": 0})
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
