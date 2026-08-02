from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class PolicyAcceptance(BaseModel):
    policy_key: str = Field(..., min_length=1, max_length=50)
    version: str = Field(..., min_length=1, max_length=30)
    accepted: bool


class AppealCreate(BaseModel):
    sanction_id: UUID | None = None
    moderation_check_id: UUID | None = None
    statement: str = Field(..., min_length=10, max_length=2000)

    @model_validator(mode="after")
    def require_target(self):
        if not self.sanction_id and not self.moderation_check_id:
            raise ValueError("이의신청 대상을 선택해 주세요.")
        return self


Provider = Literal["openai", "resend", "turnstile", "google_vision"]


class IntegrationSecretUpsert(BaseModel):
    secret: str = Field(..., min_length=8, max_length=4096)
    admin_password: str = Field(..., min_length=1, max_length=256)
    config: dict = Field(default_factory=dict)


class IntegrationEnabledUpdate(BaseModel):
    enabled: bool


class AppealDecision(BaseModel):
    status: Literal["approved", "rejected"]
    note: str = Field(..., min_length=3, max_length=2000)


class SanctionCreate(BaseModel):
    sanction_type: Literal["warning", "suspend_5d", "suspend_10d", "suspend_30d", "permanent"]
    reason: str = Field(..., min_length=3, max_length=2000)
    source_target_type: str | None = Field(None, max_length=20)
    source_target_id: UUID | None = None


class PermanentDeletionConfirm(BaseModel):
    username: str = Field(..., min_length=1, max_length=30)
    confirmation: Literal["영구 삭제"]
    admin_password: str = Field(..., min_length=1, max_length=256)


class AdminRoleUpdate(BaseModel):
    role: Literal["member", "moderator", "admin", "superadmin"]
    admin_password: str = Field(..., min_length=1, max_length=256)


class FeatureAuditPasswordReset(BaseModel):
    admin_password: str = Field(..., min_length=1, max_length=256)


class IntegrationSummary(BaseModel):
    provider: str
    configured: bool
    enabled: bool
    last_four: str | None = None
    fingerprint: str | None = None
    last_test_status: str | None = None
    last_tested_at: datetime | None = None
    last_error: str | None = None
    bootstrap_ready: bool
