import asyncio
import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest

from app.modules.audit.content_retention import retention_deadline
from app.modules.audit.service import record
from app.modules.audit.withdrawal import is_cancelable


class _RecordingSession:
    def __init__(self) -> None:
        self.added = []

    def add(self, value) -> None:
        self.added.append(value)


class ContentRetentionTests(unittest.TestCase):
    def test_alembic_revision_ids_fit_version_table(self) -> None:
        versions_dir = Path(__file__).parents[1] / "alembic" / "versions"
        for migration in versions_dir.glob("*.py"):
            tree = ast.parse(migration.read_text(encoding="utf-8"))
            for node in tree.body:
                if (
                    isinstance(node, ast.Assign)
                    and any(isinstance(target, ast.Name) and target.id == "revision" for target in node.targets)
                    and isinstance(node.value, ast.Constant)
                    and isinstance(node.value.value, str)
                ):
                    self.assertLessEqual(
                        len(node.value.value),
                        32,
                        f"{migration.name} revision id exceeds alembic_version limit",
                    )

    def test_retention_deadline_is_exactly_365_days(self) -> None:
        source = datetime(2026, 7, 29, 8, 30, tzinfo=timezone.utc)
        self.assertEqual(
            retention_deadline(source),
            source + timedelta(days=365),
        )

    def test_retention_deadline_handles_leap_day(self) -> None:
        source = datetime(2028, 2, 29, 8, 30, tzinfo=timezone.utc)
        self.assertEqual(
            retention_deadline(source),
            datetime(2029, 2, 28, 8, 30, tzinfo=timezone.utc),
        )

    def test_withdrawal_is_cancelable_only_before_deadline(self) -> None:
        deadline = datetime(2026, 8, 5, 8, 30, tzinfo=timezone.utc)
        withdrawal = SimpleNamespace(
            finalized_at=None,
            personal_data_purged_at=None,
            cancelable_until=deadline,
        )
        self.assertTrue(
            is_cancelable(withdrawal, now=deadline - timedelta(seconds=1))
        )
        self.assertFalse(is_cancelable(withdrawal, now=deadline))

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
