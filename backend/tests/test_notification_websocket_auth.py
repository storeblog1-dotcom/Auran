import inspect
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import WebSocketDisconnect, status

from app.core.security import create_access_token, create_refresh_token
from app.modules.notifications.router import notification_websocket


class NotificationWebSocketAuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_token_cannot_subscribe_to_dm_previews(self) -> None:
        websocket = MagicMock()
        websocket.close = AsyncMock()

        with patch(
            "app.modules.notifications.router.service.notification_manager.connect",
            new=AsyncMock(),
        ) as connect:
            await notification_websocket(
                websocket=websocket,
                token="not-a-valid-jwt",
            )

        websocket.close.assert_awaited_once_with(
            code=status.WS_1008_POLICY_VIOLATION
        )
        connect.assert_not_awaited()

    async def test_refresh_token_cannot_subscribe_to_dm_previews(self) -> None:
        websocket = MagicMock()
        websocket.close = AsyncMock()
        refresh_token = create_refresh_token({"sub": str(uuid.uuid4())})

        with patch(
            "app.modules.notifications.router.service.notification_manager.connect",
            new=AsyncMock(),
        ) as connect:
            await notification_websocket(
                websocket=websocket,
                token=refresh_token,
            )

        websocket.close.assert_awaited_once_with(
            code=status.WS_1008_POLICY_VIOLATION
        )
        connect.assert_not_awaited()

    async def test_recipient_identity_is_derived_only_from_access_token(
        self,
    ) -> None:
        user_id = uuid.uuid4()
        websocket = MagicMock()
        websocket.receive_text = AsyncMock(
            side_effect=WebSocketDisconnect()
        )
        access_token = create_access_token({"sub": str(user_id)})

        with (
            patch(
                "app.modules.notifications.router.service.notification_manager.connect",
                new=AsyncMock(),
            ) as connect,
            patch(
                "app.modules.notifications.router.service.notification_manager.disconnect",
                new=MagicMock(),
            ) as disconnect,
        ):
            await notification_websocket(
                websocket=websocket,
                token=access_token,
            )

        connect.assert_awaited_once_with(str(user_id), websocket)
        disconnect.assert_called_once_with(str(user_id), websocket)
        self.assertNotIn(
            "user_id",
            inspect.signature(notification_websocket).parameters,
        )


if __name__ == "__main__":
    unittest.main()
