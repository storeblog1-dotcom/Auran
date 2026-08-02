import asyncio
from io import BytesIO
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import UploadFile
from PIL import Image

from app.common.exceptions import BadRequestException
from app.modules.uploads.router import (
    DETAIL_MAX_DIMENSION,
    DETAIL_MAX_OUTPUT_SIZE,
    MAX_DIMENSION,
    MAX_FILE_SIZE,
    POST_DISPLAY_MAX_OUTPUT_SIZE,
    THUMBNAIL_MAX_DIMENSION,
    THUMBNAIL_MAX_OUTPUT_SIZE,
    process_and_resize_image,
    upload_image,
)


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
                return_value=(
                    b"display",
                    "processed_display.jpg",
                    b"thumbnail",
                    "processed_thumbnail.jpg",
                    b"detail",
                    "processed_detail.jpg",
                ),
            ) as process_image,
            patch(
                "app.modules.uploads.router.upload_to_supabase_storage",
                new=AsyncMock(
                    side_effect=[
                        "https://storage.example/display.jpg",
                        "https://storage.example/thumbnail.jpg",
                        "https://storage.example/detail.jpg",
                    ]
                ),
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
        self.assertTrue(process_image.call_args.kwargs["include_detail"])
        self.assertEqual(
            response.data["url"],
            "https://storage.example/display.jpg",
        )
        self.assertEqual(
            response.data["thumbnail_url"],
            "https://storage.example/thumbnail.jpg",
        )
        self.assertEqual(
            response.data["detail_url"],
            "https://storage.example/detail.jpg",
        )

    def test_post_variants_respect_display_and_detail_limits(self) -> None:
        source = Image.effect_noise((2400, 1800), 80).convert("RGB")
        source_buffer = BytesIO()
        source.save(source_buffer, format="JPEG", quality=95)

        with tempfile.TemporaryDirectory() as upload_dir, patch(
            "app.modules.uploads.router.UPLOAD_DIR",
            upload_dir,
        ):
            (
                display_bytes,
                _,
                thumbnail_bytes,
                thumbnail_filename,
                detail_bytes,
                detail_filename,
            ) = (
                process_and_resize_image(
                    source_buffer.getvalue(),
                    "large-photo.jpg",
                    include_detail=True,
                )
            )

        self.assertLessEqual(len(display_bytes), POST_DISPLAY_MAX_OUTPUT_SIZE)
        self.assertIsNotNone(thumbnail_bytes)
        self.assertIsNotNone(thumbnail_filename)
        self.assertIsNotNone(detail_bytes)
        self.assertIsNotNone(detail_filename)
        self.assertLessEqual(len(detail_bytes or b""), DETAIL_MAX_OUTPUT_SIZE)
        with Image.open(BytesIO(display_bytes)) as display_image:
            self.assertLessEqual(max(display_image.size), MAX_DIMENSION)
        self.assertLessEqual(
            len(thumbnail_bytes or b""),
            THUMBNAIL_MAX_OUTPUT_SIZE,
        )
        with Image.open(BytesIO(thumbnail_bytes or b"")) as thumbnail_image:
            self.assertLessEqual(max(thumbnail_image.size), THUMBNAIL_MAX_DIMENSION)
        with Image.open(BytesIO(detail_bytes or b"")) as detail_image:
            self.assertLessEqual(max(detail_image.size), DETAIL_MAX_DIMENSION)

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
