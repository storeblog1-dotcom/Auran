import asyncio
from io import BytesIO
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import UploadFile

from app.common.exceptions import BadRequestException
from app.modules.uploads.router import MAX_FILE_SIZE, upload_image


class ImageUploadTests(unittest.TestCase):
    def test_original_image_up_to_15mb_is_accepted_for_processing(self) -> None:
        upload = UploadFile(
            filename="phone-photo.jpg",
            file=BytesIO(b"x" * (2 * 1024 * 1024)),
            headers={"content-type": "image/jpeg"},
        )

        with (
            patch(
                "app.modules.uploads.router.process_and_resize_image",
                return_value=(b"compressed", "processed.jpg"),
            ) as process_image,
            patch(
                "app.modules.uploads.router.upload_to_supabase_storage",
                new=AsyncMock(return_value="https://storage.example/processed.jpg"),
            ),
        ):
            response = asyncio.run(
                upload_image(
                    file=upload,
                    current_user=SimpleNamespace(id="user-id"),
                    purpose="post",
                )
            )

        process_image.assert_called_once()
        self.assertEqual(
            response.data["url"],
            "https://storage.example/processed.jpg",
        )

    def test_original_image_over_15mb_is_rejected_with_clear_message(self) -> None:
        upload = UploadFile(
            filename="too-large.jpg",
            file=BytesIO(b"x" * (MAX_FILE_SIZE + 1)),
            headers={"content-type": "image/jpeg"},
        )

        with self.assertRaises(BadRequestException) as context:
            asyncio.run(
                upload_image(
                    file=upload,
                    current_user=SimpleNamespace(id="user-id"),
                    purpose="post",
                )
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(
            context.exception.detail,
            "원본 이미지는 15MB 이하만 업로드할 수 있습니다.",
        )


if __name__ == "__main__":
    unittest.main()
