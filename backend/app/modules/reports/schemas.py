from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


TargetType = Literal["post", "comment", "profile"]
ReasonCode = Literal["spam", "harassment", "adult", "scam", "illegal", "privacy", "other"]
ReportStatus = Literal["received", "reviewing", "resolved", "rejected"]
ModerationAction = Literal["maintain", "hide", "delete", "warn", "suspend"]


class ReportCreate(BaseModel):
    target_type: TargetType
    target_id: UUID
    reason_code: ReasonCode
    detail: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_other_detail(self):
        if self.reason_code == "other" and not (self.detail or "").strip():
            raise ValueError("기타 신고 사유를 입력해 주세요.")
        return self


class ReportCreated(BaseModel):
    id: UUID
    target_type: str
    target_id: UUID
    status: str


class ReportModerationUpdate(BaseModel):
    status: ReportStatus
    action: ModerationAction
    note: str | None = Field(default=None, max_length=1000)


class HideContentRequest(BaseModel):
    target_type: TargetType
    target_id: UUID


class ReportItem(BaseModel):
    id: UUID
    reporter_id: UUID | None
    reason_code: str
    detail: str | None
    status: str
    reporter_ip: str | None
    created_at: datetime


class ReportGroup(BaseModel):
    target_type: str
    target_id: UUID
    target_user_id: UUID | None
    report_count: int
    status: str
    latest_at: datetime
    snapshot: dict
    reports: list[ReportItem] = []
