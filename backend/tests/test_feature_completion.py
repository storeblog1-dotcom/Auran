import unittest
from types import SimpleNamespace
from uuid import uuid4

from pydantic import ValidationError

from app.main import app
from app.modules.notifications.push import build_notification_push_payload
from app.modules.posts.service import calculate_feed_rank_score
from app.modules.reports.schemas import ReportModerationUpdate


class FeatureCompletionTests(unittest.TestCase):
    def test_feed_rank_prioritizes_engagement_and_fresh_posts(self) -> None:
        self.assertEqual(calculate_feed_rank_score(3, 2, is_fresh=False), 7)
        self.assertEqual(calculate_feed_rank_score(0, 0, is_fresh=True), 10)
        self.assertGreater(
            calculate_feed_rank_score(5, 4, is_fresh=True),
            calculate_feed_rank_score(5, 4, is_fresh=False),
        )

    def test_generic_notification_push_contains_navigation_context(self) -> None:
        notification = SimpleNamespace(
            id=uuid4(),
            type="COMMENT",
            message="새 댓글이 달렸습니다.",
            post_id=uuid4(),
            comment_id="comment-1",
            sender=SimpleNamespace(
                username="sender",
                nickname="보낸 사람",
            ),
        )
        payload = build_notification_push_payload(
            expo_push_token="ExpoPushToken[abcdefghijklmnopqrstuvwxyz]",
            notification=notification,
        )
        self.assertEqual(payload["data"]["type"], "COMMENT")
        self.assertEqual(payload["data"]["post_id"], str(notification.post_id))
        self.assertEqual(payload["data"]["comment_id"], "comment-1")
        self.assertEqual(payload["data"]["sender_username"], "sender")

    def test_warn_and_suspend_require_a_reason(self) -> None:
        for action in ("warn", "suspend"):
            with self.assertRaises(ValidationError):
                ReportModerationUpdate(
                    status="resolved",
                    action=action,
                    note="",
                )
        valid = ReportModerationUpdate(
            status="resolved",
            action="warn",
            note="반복적인 운영정책 위반",
        )
        self.assertEqual(valid.action, "warn")

    def test_completed_feature_routes_are_registered(self) -> None:
        paths = app.openapi()["paths"]
        self.assertIn("/api/v1/posts/search", paths)
        feed_parameters = paths["/api/v1/posts/feed"]["get"]["parameters"]
        self.assertIn("ranking_seed", {item["name"] for item in feed_parameters})
        explore_parameters = paths["/api/v1/posts/explore"]["get"]["parameters"]
        self.assertIn("ranking_seed", {item["name"] for item in explore_parameters})
        self.assertIn("/api/v1/direct/conversations-unread-count", paths)
        self.assertIn("/api/v1/users/me/blocked-users", paths)
        block_path = paths["/api/v1/users/{username}/block"]
        self.assertIn("post", block_path)
        self.assertIn("delete", block_path)


if __name__ == "__main__":
    unittest.main()
