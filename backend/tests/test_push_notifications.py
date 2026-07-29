import unittest
from types import SimpleNamespace

from pydantic import ValidationError

from app.main import app
from app.modules.notifications.push import (
    DIRECT_MESSAGE_CHANNEL_ID,
    build_direct_message_push_payload,
    is_expo_push_token,
)
from app.modules.notifications.schemas import PushTokenCreate


class PushNotificationTests(unittest.TestCase):
    def test_push_token_schema_accepts_both_expo_token_prefixes(self) -> None:
        for token in (
            "ExpoPushToken[abcdefghijklmnopqrstuvwxyz]",
            "ExponentPushToken[abcdefghijklmnopqrstuvwxyz]",
        ):
            body = PushTokenCreate(
                expo_push_token=token,
                device_id="auran-installation-123",
                platform="android",
            )
            self.assertEqual(body.expo_push_token, token)
            self.assertTrue(is_expo_push_token(token))

    def test_push_token_schema_rejects_non_expo_token(self) -> None:
        with self.assertRaises(ValidationError):
            PushTokenCreate(
                expo_push_token="not-a-valid-device-token",
                device_id="auran-installation-123",
                platform="android",
            )

    def test_dm_payload_preserves_unicode_and_navigation_contract(self) -> None:
        content = "가나다라마바사!? 😀"
        payload = build_direct_message_push_payload(
            expo_push_token="ExpoPushToken[abcdefghijklmnopqrstuvwxyz]",
            room_id="room-123",
            message_id="message-456",
            sender=SimpleNamespace(
                id="sender-789",
                username="auran",
                nickname="관리자",
                full_name="관리자 (Auran)",
                profile_image_url="https://example.com/admin.png",
                is_admin=True,
            ),
            content=content,
            message_type="TEXT",
        )

        self.assertEqual(payload["body"], content)
        self.assertEqual(payload["sound"], "default")
        self.assertEqual(payload["channelId"], DIRECT_MESSAGE_CHANNEL_ID)
        self.assertEqual(
            payload["data"],
            {
                "version": 1,
                "type": "DIRECT_MESSAGE",
                "room_id": "room-123",
                "message_id": "message-456",
                "sender_id": "sender-789",
                "sender_username": "auran",
                "sender_nickname": "관리자",
                "sender_full_name": "관리자 (Auran)",
                "sender_profile_image_url": "https://example.com/admin.png",
                "sender_is_admin": True,
                "url": "auran://messages/room-123",
            },
        )

    def test_push_token_routes_are_registered(self) -> None:
        paths = app.openapi()["paths"]
        self.assertIn("/api/v1/notifications/push-tokens", paths)
        self.assertIn(
            "/api/v1/notifications/push-tokens/{device_id}",
            paths,
        )
        self.assertIn(
            "/api/v1/notifications/push-tokens/sync-receipts",
            paths,
        )


if __name__ == "__main__":
    unittest.main()
