from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


TargetType = Literal["post", "comment", "profile"]
ReasonCode = Literal["hate", "sexual_harassment", "harassment", "outing", "privacy", "nonconsensual_sexual", "child_safety", "adult", "impersonation", "spam", "scam", "self_harm", "illegal", "other"]
ReportStatus = Literal["received", "reviewing", "resolved", "rejected"]
ModerationAction = Literal["maintain", "hide", "delete", "warn", "suspend"]
ContentAction = Literal["maintain", "hide", "delete"]
SanctionType = Literal["none", "warning", "suspend_5d", "suspend_10d", "suspend_30d", "permanent"]


class ReportCreate(BaseModel):
    target_type: TargetType
    target_id: UUID
    reason_code: ReasonCode | None = None
    reason_codes: list[ReasonCode] = Field(default_factory=list, min_length=0, max_length=8)
    detail: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_other_detail(self):
        codes = list(dict.fromkeys(self.reason_codes or ([self.reason_code] if self.reason_code else [])))
        if not codes:
            raise ValueError("신고 사유를 하나 이상 선택해 주세요.")
        self.reason_codes = codes
        self.reason_code = codes[0]
        if "other" in codes and not (self.detail or "").strip():
            raise ValueError("기타 신고 사유를 입력해 주세요.")
        return self


class ReportCreated(BaseModel):
    id: UUID
    target_type: str
    target_id: UUID
    status: str


class ReportModerationUpdate(BaseModel):
    status: ReportStatus
    action: ModerationAction | None = None
    content_action: ContentAction = "maintain"
    sanction_type: SanctionType = "none"
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_resolution_note(self):
        if self.action == "hide":
            self.content_action = "hide"
        elif self.action == "delete":
            self.content_action = "delete"
        elif self.action == "warn":
            self.sanction_type = "warning"
        elif self.action == "suspend":
            self.sanction_type = "suspend_5d"
        if self.sanction_type != "none" and not (self.note or "").strip():
            raise ValueError("이용자 제재에는 작성자에게 안내할 사유가 필요합니다.")
        return self


class HideContentRequest(BaseModel):
    target_type: TargetType
    target_id: UUID


class ReportItem(BaseModel):
    id: UUID
    reporter_id: UUID | None
    reason_code: str
    reason_codes: list[str] = Field(default_factory=list)
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
    reports: list[ReportItem] = Field(default_factory=list)
