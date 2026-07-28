import asyncio
import os
import uuid
from io import BytesIO

import httpx
from PIL import Image, ImageOps
from fastapi import APIRouter, Depends, File, Query, UploadFile, status

from app.common.exceptions import BadRequestException
from app.common.response import ApiResponse
from app.core.config import settings
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.models import User

router = APIRouter(prefix="/uploads", tags=["Uploads"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
UPLOAD_DIR = os.path.abspath(os.path.join(BASE_DIR, "static", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_DIMENSION = 1080  # 모바일 인스타그램 표준 최대 너비/높이
DETAIL_MAX_DIMENSION = 2048
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_FILE_SIZE = 15 * 1024 * 1024
MAX_OUTPUT_SIZE = 400 * 1024
DETAIL_MAX_OUTPUT_SIZE = 1 * 1024 * 1024


async def upload_to_supabase_storage(image_bytes: bytes, filename: str) -> str | None:
    """Supabase Storage REST API를 통한 버킷 업로드"""
    if not settings.supabase_key:
        return None

    bucket = settings.supabase_storage_bucket
    target_url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{filename}"
    headers = {
        "Authorization": f"Bearer {settings.supabase_key}",
        "apiKey": settings.supabase_key,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(target_url, content=image_bytes, headers=headers)
            if resp.status_code in (200, 201):
                return f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/{bucket}/{filename}"
            print(f"[Supabase Storage Warning] Status {resp.status_code}: {resp.text}")
            return None
    except Exception as e:
        print(f"[Supabase Storage Error] {e}")
        return None


async def delete_supabase_storage_urls(urls: list[str]) -> int:
    """Delete verified unreferenced objects that belong to this Supabase bucket."""
    if not settings.supabase_key or not urls:
        return 0
    public_prefix = (
        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/"
        f"{settings.supabase_storage_bucket}/"
    )
    object_paths = [
        url[len(public_prefix):]
        for url in urls
        if url.startswith(public_prefix) and url[len(public_prefix):]
    ]
    if not object_paths:
        return 0
    target_url = (
        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/"
        f"{settings.supabase_storage_bucket}"
    )
    headers = {
        "Authorization": f"Bearer {settings.supabase_key}",
        "apiKey": settings.supabase_key,
        "Content-Type": "application/json",
    }
    deleted = 0
    async with httpx.AsyncClient(timeout=20.0) as client:
        for index in range(0, len(object_paths), 1000):
            batch = object_paths[index:index + 1000]
            response = await client.request(
                "DELETE",
                target_url,
                headers=headers,
                json={"prefixes": batch},
            )
            if response.status_code == 200:
                deleted += len(batch)
            else:
                print(
                    "[Supabase Storage Delete Warning] "
                    f"Status {response.status_code}: {response.text}"
                )
    return deleted


def process_and_resize_image(
    file_bytes: bytes,
    original_filename: str,
    *,
    include_detail: bool = False,
) -> tuple[bytes, str, bytes | None, str | None]:
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = ".jpg"

    try:
        image = Image.open(BytesIO(file_bytes))

        # EXIF 회전값 자동 보정 (스마트폰 카메라 세로/가로 직립 보정)
        image = ImageOps.exif_transpose(image)

        # JPEG 저장을 위해 색상 모드 표준화
        if image.mode != "RGB":
            image = image.convert("RGB")

        display_image = image.copy()
        display_image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)
        base_name = uuid.uuid4().hex
        filename = f"{base_name}_display.jpg"
        compressed_bytes = _encode_with_limit(display_image, MAX_OUTPUT_SIZE)

        # 로컬 폴백 저장
        save_path = os.path.join(UPLOAD_DIR, filename)
        with open(save_path, "wb") as f:
            f.write(compressed_bytes)

        detail_bytes = None
        detail_filename = None
        if include_detail:
            detail_image = image.copy()
            detail_image.thumbnail(
                (DETAIL_MAX_DIMENSION, DETAIL_MAX_DIMENSION),
                Image.Resampling.LANCZOS,
            )
            detail_filename = f"{base_name}_detail.jpg"
            detail_bytes = _encode_with_limit(
                detail_image,
                DETAIL_MAX_OUTPUT_SIZE,
            )
            detail_save_path = os.path.join(UPLOAD_DIR, detail_filename)
            with open(detail_save_path, "wb") as f:
                f.write(detail_bytes)

        return compressed_bytes, filename, detail_bytes, detail_filename
    except Exception as e:
        raise BadRequestException(f"이미지 처리 중 오류가 발생했습니다: {str(e)}")


def _encode_with_limit(image: Image.Image, max_output_size: int) -> bytes:
    working = image.copy()
    while True:
        for quality in range(85, 4, -5):
            buffer = BytesIO()
            working.save(buffer, format="JPEG", quality=quality, optimize=True, progressive=True)
            encoded = buffer.getvalue()
            if len(encoded) <= max_output_size:
                return encoded

        width, height = working.size
        if max(width, height) <= 64:
            return encoded
        working.thumbnail(
            (max(64, int(width * 0.85)), max(64, int(height * 0.85))),
            Image.Resampling.LANCZOS,
        )


@router.post(
    "/image",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_201_CREATED,
    summary="이미지 파일 업로드 (Supabase Storage & 1080px 자동 리사이징)",
)
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    purpose: str = Query("post", pattern="^(post|profile|story)$"),
) -> ApiResponse[dict]:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise BadRequestException("이미지 파일만 업로드할 수 있습니다.")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise BadRequestException("원본 이미지는 15MB 이하만 업로드할 수 있습니다.")

    compressed_bytes, filename, detail_bytes, detail_filename = process_and_resize_image(
        contents,
        file.filename or "image.jpg",
        include_detail=purpose == "post",
    )

    upload_tasks = [upload_to_supabase_storage(compressed_bytes, filename)]
    if detail_bytes is not None and detail_filename is not None:
        upload_tasks.append(
            upload_to_supabase_storage(detail_bytes, detail_filename)
        )
    uploaded_urls = await asyncio.gather(*upload_tasks)
    supabase_public_url = uploaded_urls[0]
    detail_public_url = uploaded_urls[1] if len(uploaded_urls) > 1 else None

    if supabase_public_url:
        final_url = supabase_public_url
    else:
        final_url = f"/static/uploads/{filename}"
    if detail_filename:
        detail_url = (
            detail_public_url
            or (
                f"/static/uploads/{detail_filename}"
                if not supabase_public_url
                else final_url
            )
        )
    else:
        detail_url = final_url

    return ApiResponse.ok({
        "url": final_url,
        "filename": filename,
        "detail_url": detail_url,
        "detail_filename": detail_filename,
    })
