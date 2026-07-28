import asyncio
from datetime import datetime, timezone
import unittest

from app.modules.audit.content_retention import retention_deadline
from app.modules.audit.service import record


class _RecordingSession:
    def __init__(self) -> None:
        self.added = []

    def add(self, value) -> None:
        self.added.append(value)


class ContentRetentionTests(unittest.TestCase):
    def test_retention_deadline_is_three_calendar_years(self) -> None:
        source = datetime(2026, 7, 29, 8, 30, tzinfo=timezone.utc)
        self.assertEqual(
            retention_deadline(source),
            datetime(2029, 7, 29, 8, 30, tzinfo=timezone.utc),
        )

    def test_retention_deadline_handles_leap_day(self) -> None:
        source = datetime(2028, 2, 29, 8, 30, tzinfo=timezone.utc)
        self.assertEqual(
            retention_deadline(source),
            datetime(2031, 2, 28, 8, 30, tzinfo=timezone.utc),
        )

    def test_audit_record_always_gets_retention_deadline(self) -> None:
        session = _RecordingSession()
        event = asyncio.run(
            record(
                session,
                event_type="post_created",
                ip_address="203.0.113.10",
                target_type="post",
                target_id="test-post",
            )
        )
        self.assertEqual(session.added, [event])
        self.assertIsNotNone(event.retention_until)
        self.assertGreater(event.retention_until, datetime.now(timezone.utc))


if __name__ == "__main__":
    unittest.main()
