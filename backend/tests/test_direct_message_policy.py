import unittest

from app.main import app
from app.modules.direct.router import (
    MESSAGE_REQUEST_LIMIT,
    message_request_allowed,
    pending_request_has_capacity,
)
from app.modules.direct.schemas import ChatRoomResponse


class DirectMessagePolicyTests(unittest.TestCase):
    def test_non_mutual_request_requires_recipient_opt_in(self) -> None:
        self.assertFalse(message_request_allowed(False, False))
        self.assertTrue(message_request_allowed(False, True))

    def test_mutual_followers_can_message_when_requests_are_disabled(self) -> None:
        self.assertTrue(message_request_allowed(True, False))

    def test_pending_request_allows_exactly_five_messages(self) -> None:
        self.assertEqual(MESSAGE_REQUEST_LIMIT, 5)
        self.assertTrue(pending_request_has_capacity(0))
        self.assertTrue(pending_request_has_capacity(4))
        self.assertFalse(pending_request_has_capacity(5))
        self.assertFalse(pending_request_has_capacity(6))

    def test_room_response_exposes_request_send_state(self) -> None:
        fields = ChatRoomResponse.model_fields
        self.assertIn("request_message_count", fields)
        self.assertIn("request_message_limit", fields)
        self.assertIn("can_send_message", fields)
        self.assertIn("can_share_post", fields)

    def test_direct_message_eligibility_route_is_registered(self) -> None:
        paths = app.openapi()["paths"]
        self.assertIn(
            "/api/v1/direct/eligibility/{target_user_id}",
            paths,
        )


if __name__ == "__main__":
    unittest.main()
