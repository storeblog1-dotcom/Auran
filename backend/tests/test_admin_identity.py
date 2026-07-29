import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.common.exceptions import ForbiddenException
from app.modules.direct.schemas import SenderResponse
from app.modules.notifications.schemas import SenderSummary
from app.modules.posts.schemas import PostUserSummary
from app.modules.posts.service import should_anonymize_user
from app.modules.users import service as user_service
from app.modules.users.schemas import UserSummaryResponse


class AdminIdentityTests(unittest.IsolatedAsyncioTestCase):
    def test_admin_is_never_anonymized_in_anonymous_boards(self) -> None:
        self.assertFalse(should_anonymize_user("anonymous", True))
        self.assertTrue(should_anonymize_user("anonymous", False))
        self.assertFalse(should_anonymize_user("info", False))

    def test_public_user_summaries_expose_admin_identity(self) -> None:
        for schema in (
            UserSummaryResponse,
            PostUserSummary,
            SenderResponse,
            SenderSummary,
        ):
            self.assertIn("is_admin", schema.model_fields)

    async def test_non_admin_cannot_open_admin_profile(self) -> None:
        admin = SimpleNamespace(is_admin=True)
        viewer = SimpleNamespace(is_admin=False)

        with patch.object(
            user_service,
            "get_user_by_username",
            new=AsyncMock(return_value=admin),
        ):
            with self.assertRaises(ForbiddenException) as context:
                await user_service.get_user_profile(
                    db=object(),
                    target_username="auran",
                    current_user=viewer,
                )

        self.assertEqual(context.exception.status_code, 403)
        self.assertEqual(
            context.exception.message,
            "관리자 계정의 프로필은 공개되지 않습니다.",
        )

    async def test_logged_out_user_cannot_open_admin_profile(self) -> None:
        admin = SimpleNamespace(is_admin=True)

        with patch.object(
            user_service,
            "get_user_by_username",
            new=AsyncMock(return_value=admin),
        ):
            with self.assertRaises(ForbiddenException):
                await user_service.get_user_profile(
                    db=object(),
                    target_username="auran",
                    current_user=None,
                )


if __name__ == "__main__":
    unittest.main()
