import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    event_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(64), index=True)
    revision_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    snapshot: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    retention_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    legal_hold: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")


class WithdrawnAccount(Base):
    __tablename__ = "withdrawn_accounts"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True)
    withdrawn_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    retention_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PostRevision(Base):
    """Administrator-only immutable post state retained for three years."""

    __tablename__ = "post_revisions"
    __table_args__ = (
        UniqueConstraint("post_id", "version", name="uq_post_revisions_post_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    lifecycle_event: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    display_number: Mapped[int | None] = mapped_column(Integer)
    title: Mapped[str | None] = mapped_column(String(255))
    board_type: Mapped[str | None] = mapped_column(String(50))
    board_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    board_name: Mapped[str | None] = mapped_column(String(100))
    caption: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(255))
    visibility: Mapped[str] = mapped_column(String(20), nullable=False)
    media_manifest: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    source_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    event_ip: Mapped[str | None] = mapped_column(String(45))
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    retention_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    legal_hold: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")


class CommentRevision(Base):
    """Administrator-only immutable comment/reply state retained for three years."""

    __tablename__ = "comment_revisions"
    __table_args__ = (
        UniqueConstraint("comment_id", "version", name="uq_comment_revisions_comment_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    comment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    lifecycle_event: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    post_display_number: Mapped[int | None] = mapped_column(Integer)
    display_number: Mapped[int | None] = mapped_column(Integer)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    parent_display_number: Mapped[int | None] = mapped_column(Integer)
    reply_to_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    reply_to_display_name: Mapped[str | None] = mapped_column(String(50))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    event_ip: Mapped[str | None] = mapped_column(String(45))
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    retention_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    legal_hold: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
