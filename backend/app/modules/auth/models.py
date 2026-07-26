import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    """사용자 ORM 모델"""

    __tablename__ = "users"

    # ─── PK ──────────────────────────────────────────────────
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    # ─── 식별자 ───────────────────────────────────────────────
    username: Mapped[str] = mapped_column(
        String(30), unique=True, nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )

    # ─── 프로필 ───────────────────────────────────────────────
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    age: Mapped[int | None] = mapped_column(nullable=True)
    gender: Mapped[str | None] = mapped_column(String(30), nullable=True)
    sexual_orientation: Mapped[str | None] = mapped_column(String(30), nullable=True)
    height: Mapped[int | None] = mapped_column(nullable=True)
    body_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ─── 인증 및 설정 ──────────────────────────────────────────
    google_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ─── 타임스탬프 ───────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r}>"
