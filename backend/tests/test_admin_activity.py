from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
import uuid

from app.main import app
from app.modules.admin.router import _comment_number, _revision_comments


class AdminActivityTests(unittest.TestCase):
    def test_admin_activity_routes_are_registered(self) -> None:
        paths = app.openapi()["paths"]
        self.assertIn("/api/v1/admin/activity-users", paths)
        self.assertIn(
            "/api/v1/admin/content-history/{content_type}/{content_id}",
            paths,
        )
        self.assertIn("/api/v1/admin/users/{user_id}/content", paths)
        self.assertIn("/api/v1/admin/content-revisions/{revision_id}", paths)

    def test_retained_reply_includes_connected_number_and_author(self) -> None:
        author_id = uuid.uuid4()
        revision = SimpleNamespace(
            comment_id=uuid.uuid4(),
            user_id=author_id,
            post_display_number=12,
            parent_display_number=3,
            display_number=4,
            parent_id=uuid.uuid4(),
            content="보존된 답글",
            lifecycle_event="updated",
            event_ip="203.0.113.15",
            source_created_at=datetime(2026, 7, 29, tzinfo=timezone.utc),
        )
        author = SimpleNamespace(
            id=author_id,
            username="member1",
            nickname="회원",
        )

        [result] = _revision_comments([revision], {author_id: author})

        self.assertEqual(_comment_number(revision), "P-000012-C-003-R-004")
        self.assertEqual(result["author"]["username"], "member1")
        self.assertEqual(result["author"]["nickname"], "회원")
        self.assertEqual(result["event_ip"], "203.0.113.15")


if __name__ == "__main__":
    unittest.main()
