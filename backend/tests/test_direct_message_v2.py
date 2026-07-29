import json
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from jose import jwt

from app.main import app
from app.modules.auth.models import User
from app.modules.direct.models import ChatMessage, ChatRoomMember
from app.modules.direct.realtime import (
    REALTIME_TOKEN_TTL_SECONDS,
    create_realtime_access_token,
    direct_presence_topic,
    direct_room_topic,
)
from app.modules.direct.router import (
    DIRECT_NOTIFICATION_MAX_LENGTH,
    _create_direct_message_notification,
    _format_message_response,
    _later_checkpoint,
    direct_message_notification_text,
    history_checkpoint_values,
    message_content_for_storage,
    send_message_rest,
)
from app.modules.direct.schemas import (
    ChatMessageCreate,
    ChatMessageResponse,
    RealtimeConfigResponse,
)


class DirectMessageV2Tests(unittest.TestCase):
    def test_content_is_preserved_byte_for_byte_at_the_api_boundary(self) -> None:
        samples = [
            "관리자입니다.",
            "가나다라마바사!?Z",
            "내 이름은",
            "끝,",
            "  앞뒤 공백도 원문입니다.  ",
            "이모지 👨‍👩‍👧‍👦✨와 조합형 가",
            "첫 줄\n둘째 줄\r\n셋째 줄",
        ]
        for sample in samples:
            with self.subTest(sample=sample):
                body = ChatMessageCreate(content=sample)
                self.assertEqual(body.content, sample)
                self.assertEqual(
                    json.loads(body.model_dump_json())["content"],
                    sample,
                )
                self.assertEqual(
                    message_content_for_storage(body.content),
                    sample,
                )
                model = ChatMessage(
                    room_id=uuid.uuid4(),
                    sender_id=uuid.uuid4(),
                    content=message_content_for_storage(body.content),
                )
                self.assertEqual(model.content, sample)

    def test_long_content_is_only_truncated_in_notification_preview(self) -> None:
        content = "끝글자✨" * 400
        stored = message_content_for_storage(content)
        notification = direct_message_notification_text(
            "닉네임",
            content,
            None,
        )

        self.assertEqual(stored, content)
        self.assertLessEqual(
            len(notification),
            DIRECT_NOTIFICATION_MAX_LENGTH,
        )
        self.assertNotEqual(notification, content)
        self.assertTrue(notification.startswith("닉네임님의 메시지: "))

    def test_client_message_id_is_part_of_request_and_response_contracts(self) -> None:
        self.assertIn(
            "client_message_id",
            ChatMessageCreate.model_fields,
        )
        fields = ChatMessageResponse.model_fields
        self.assertIn("client_message_id", fields)
        self.assertIn("delivery_status", fields)
        self.assertIn("delivered_at", fields)
        self.assertIn("read_at", fields)

        unique_columns = {
            tuple(column.name for column in constraint.columns)
            for constraint in ChatMessage.__table__.constraints
            if constraint.name == "uq_chat_messages_sender_client_message"
        }
        self.assertEqual(
            unique_columns,
            {("sender_id", "client_message_id")},
        )

    def test_message_status_uses_recipient_checkpoints(self) -> None:
        sender_id = uuid.uuid4()
        recipient_id = uuid.uuid4()
        room_id = uuid.uuid4()
        created_at = datetime.now(timezone.utc)
        sender = User(
            id=sender_id,
            username="sender",
            email="sender@example.com",
            full_name="보낸 사람",
            is_active=True,
            is_verified=True,
            is_private=False,
            allow_message_requests=True,
            is_admin=False,
        )
        message = ChatMessage(
            id=uuid.uuid4(),
            room_id=room_id,
            sender_id=sender_id,
            sender=sender,
            client_message_id=uuid.uuid4(),
            content="끝 글자까지 보존!",
            message_type="TEXT",
            created_at=created_at,
        )
        sender_member = ChatRoomMember(
            room_id=room_id,
            user_id=sender_id,
            last_read_at=created_at,
        )
        recipient_member = ChatRoomMember(
            room_id=room_id,
            user_id=recipient_id,
            last_delivered_at=created_at + timedelta(seconds=1),
            last_read_at=created_at + timedelta(seconds=2),
        )

        response = _format_message_response(
            message,
            sender_id,
            [sender_member, recipient_member],
        )

        self.assertEqual(response.content, "끝 글자까지 보존!")
        self.assertEqual(response.delivery_status, "READ")
        self.assertEqual(
            response.delivered_at,
            recipient_member.last_delivered_at,
        )
        self.assertEqual(
            response.read_at,
            recipient_member.last_read_at,
        )

    def test_equal_checkpoint_counts_and_older_checkpoint_does_not(self) -> None:
        sender_id = uuid.uuid4()
        recipient_id = uuid.uuid4()
        room_id = uuid.uuid4()
        checkpoint = datetime.now(timezone.utc)
        sender = User(
            id=sender_id,
            username="sender2",
            email="sender2@example.com",
            full_name="보낸 사람",
            is_active=True,
            is_verified=True,
            is_private=False,
            allow_message_requests=True,
            is_admin=False,
        )
        recipient = ChatRoomMember(
            room_id=room_id,
            user_id=recipient_id,
            last_delivered_at=checkpoint,
            last_read_at=checkpoint,
        )
        sender_member = ChatRoomMember(
            room_id=room_id,
            user_id=sender_id,
            last_read_at=checkpoint,
        )
        equal_message = ChatMessage(
            id=uuid.uuid4(),
            room_id=room_id,
            sender_id=sender_id,
            sender=sender,
            content="같은 시각",
            message_type="TEXT",
            created_at=checkpoint,
        )
        future_message = ChatMessage(
            id=uuid.uuid4(),
            room_id=room_id,
            sender_id=sender_id,
            sender=sender,
            content="체크포인트보다 미래",
            message_type="TEXT",
            created_at=checkpoint + timedelta(microseconds=1),
        )

        equal_response = _format_message_response(
            equal_message,
            sender_id,
            [sender_member, recipient],
        )
        future_response = _format_message_response(
            future_message,
            sender_id,
            [sender_member, recipient],
        )

        self.assertEqual(equal_response.delivery_status, "READ")
        self.assertEqual(future_response.delivery_status, "SENT")
        self.assertIsNone(future_response.delivered_at)
        self.assertIsNone(future_response.read_at)

    def test_checkpoints_never_move_backwards(self) -> None:
        newer = datetime.now(timezone.utc)
        older = newer - timedelta(minutes=1)
        self.assertEqual(_later_checkpoint(None, older), older)
        self.assertEqual(_later_checkpoint(older, newer), newer)
        self.assertEqual(_later_checkpoint(newer, older), newer)

    def test_unfocused_history_fetch_delivers_without_marking_read(self) -> None:
        old_read = datetime.now(timezone.utc) - timedelta(minutes=2)
        received = old_read + timedelta(minutes=1)
        delivered_at, read_at = history_checkpoint_values(
            None,
            old_read,
            received,
            mark_read=False,
        )

        self.assertEqual(delivered_at, received)
        self.assertEqual(read_at, old_read)

    def test_realtime_token_is_short_lived_and_scoped_to_user(self) -> None:
        user_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        token, expires_at = create_realtime_access_token(
            user_id,
            "test-supabase-jwt-secret",
            now=now,
        )
        claims = jwt.get_unverified_claims(token)

        self.assertEqual(claims["sub"], str(user_id))
        self.assertEqual(claims["role"], "authenticated")
        self.assertEqual(claims["aud"], "authenticated")
        self.assertEqual(
            int(expires_at.timestamp()) - claims["iat"],
            REALTIME_TOKEN_TTL_SECONDS,
        )

    def test_private_channel_topics_are_deterministic(self) -> None:
        identifier = uuid.uuid4()
        self.assertEqual(direct_room_topic(identifier), f"dm:{identifier}")
        self.assertEqual(
            direct_presence_topic(identifier),
            f"dm-user:{identifier}",
        )
        fields = RealtimeConfigResponse.model_fields
        self.assertIn("presence_topic", fields)
        self.assertIn("peer_presence_topics", fields)
        self.assertFalse(fields["channel_topic"].is_required())

    def test_v2_routes_and_cursor_are_in_openapi(self) -> None:
        paths = app.openapi()["paths"]
        self.assertIn("/api/v1/direct/realtime/config", paths)
        self.assertIn("/api/v1/direct/presence/heartbeat", paths)
        self.assertIn(
            "/api/v1/direct/rooms/{room_id}/presence",
            paths,
        )
        self.assertIn(
            "/api/v1/direct/rooms/{room_id}/delivered",
            paths,
        )
        message_get = paths[
            "/api/v1/direct/rooms/{room_id}/messages"
        ]["get"]
        query_parameters = {
            parameter["name"]
            for parameter in message_get["parameters"]
        }
        self.assertIn("before", query_parameters)
        self.assertIn("mark_read", query_parameters)
        mark_read_parameter = next(
            parameter
            for parameter in message_get["parameters"]
            if parameter["name"] == "mark_read"
        )
        self.assertTrue(mark_read_parameter["schema"]["default"])

    def test_realtime_write_policy_only_allows_identity_bound_typing(self) -> None:
        migration = (
            Path(__file__).resolve().parents[1]
            / "alembic"
            / "versions"
            / "20260730_0200_add_direct_message_v2.py"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "realtime.messages.event = 'typing'",
            migration,
        )
        self.assertIn(
            "realtime.messages.payload ->> 'user_id'",
            migration,
        )
        self.assertIn("public.user_blocks", migration)
        self.assertNotIn(
            "extension IN ('broadcast', 'presence')",
            migration,
        )


class DirectMessageIdempotencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_retry_returns_existing_without_rebroadcast_or_notification(self) -> None:
        sender_id = uuid.uuid4()
        room_id = uuid.uuid4()
        client_message_id = uuid.uuid4()
        created_at = datetime.now(timezone.utc)
        sender = User(
            id=sender_id,
            username="retry-sender",
            email="retry@example.com",
            full_name="재시도 발신자",
            is_active=True,
            is_verified=True,
            is_private=False,
            allow_message_requests=True,
            is_admin=False,
        )
        existing = ChatMessage(
            id=uuid.uuid4(),
            room_id=room_id,
            sender_id=sender_id,
            sender=sender,
            client_message_id=client_message_id,
            content="한 번만 저장",
            message_type="TEXT",
            created_at=created_at,
        )
        sender_member = ChatRoomMember(
            room_id=room_id,
            user_id=sender_id,
            last_read_at=created_at,
        )
        db = MagicMock()
        db.add = MagicMock()

        with (
            patch(
                "app.modules.direct.router._verify_room_member",
                new=AsyncMock(),
            ),
            patch(
                "app.modules.direct.router._find_idempotent_message",
                new=AsyncMock(return_value=existing),
            ),
            patch(
                "app.modules.direct.router._get_room_members",
                new=AsyncMock(return_value=[sender_member]),
            ),
            patch(
                "app.modules.direct.router.manager.broadcast_to_room",
                new=AsyncMock(),
            ) as broadcast,
        ):
            response = await send_message_rest(
                room_id=room_id,
                body=ChatMessageCreate(
                    client_message_id=client_message_id,
                    content="재시도 본문은 무시",
                ),
                current_user=sender,
                db=db,
            )

        self.assertEqual(response.id, existing.id)
        self.assertEqual(response.content, "한 번만 저장")
        db.add.assert_not_called()
        broadcast.assert_not_awaited()

    async def test_notification_failure_does_not_escape_saved_message_flow(self) -> None:
        db = MagicMock()
        db.rollback = AsyncMock()
        with (
            patch(
                "app.modules.notifications.service.create_notification",
                new=AsyncMock(side_effect=RuntimeError("push unavailable")),
            ),
            patch(
                "app.modules.direct.router.logger.exception",
            ) as log_exception,
        ):
            created = await _create_direct_message_notification(
                db,
                recipient_id=uuid.uuid4(),
                sender_id=uuid.uuid4(),
                sender_display_name="보낸 사람",
                content="저장된 메시지",
                media_url=None,
                message_id=uuid.uuid4(),
            )

        self.assertFalse(created)
        db.rollback.assert_awaited_once()
        log_exception.assert_called_once()


if __name__ == "__main__":
    unittest.main()
