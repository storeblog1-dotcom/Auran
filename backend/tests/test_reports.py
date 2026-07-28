from datetime import datetime, timezone
import unittest
import uuid

from pydantic import ValidationError

from app.modules.reports.schemas import ReportCreate
from app.modules.reports.service import REPORTS_PER_DAY, retention_deadline
from app.main import app


class ReportPolicyTests(unittest.TestCase):
    def test_other_reason_requires_detail(self) -> None:
        with self.assertRaises(ValidationError):
            ReportCreate(
                target_type="post",
                target_id=uuid.uuid4(),
                reason_code="other",
            )

    def test_supported_targets_and_reasons_validate(self) -> None:
        item = ReportCreate(
            target_type="comment",
            target_id=uuid.uuid4(),
            reason_code="privacy",
            detail="개인정보가 노출되어 있습니다.",
        )
        self.assertEqual(item.target_type, "comment")
        self.assertEqual(item.reason_code, "privacy")

    def test_report_retention_is_at_most_365_days(self) -> None:
        before = datetime.now(timezone.utc)
        deadline = retention_deadline()
        after = datetime.now(timezone.utc)
        self.assertGreaterEqual(deadline, before.replace(microsecond=0))
        self.assertLessEqual((deadline - after).days, 365)

    def test_daily_report_limit_is_ten(self) -> None:
        self.assertEqual(REPORTS_PER_DAY, 10)

    def test_report_and_admin_routes_are_registered(self) -> None:
        paths = app.openapi()["paths"]
        self.assertIn("/api/v1/reports", paths)
        self.assertIn("/api/v1/admin/reports", paths)
        self.assertIn("/api/v1/admin/reports/{target_type}/{target_id}", paths)


if __name__ == "__main__":
    unittest.main()
