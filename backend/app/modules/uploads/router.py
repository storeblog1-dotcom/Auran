import asyncio
import base64
import os
import uuid
from io import BytesIO

import httpx
from PIL import Image, ImageOps
from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.exceptions import BadRequestException
from app.common.response import ApiResponse
from app.core.config import settings
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.models import User

router = APIRouter(prefix="/uploads", tags=["Uploads"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
UPLOAD_DIR = os.path.abspath(os.path.join(BASE_DIR, "static", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_DIMENSION = 1080  # 모바일 인스타그램 표준 최대 너비/높이
THUMBNAIL_MAX_DIMENSION = 480
DETAIL_MAX_DIMENSION = 2048
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_FILE_SIZE = 15 * 1024 * 1024
MAX_OUTPUT_SIZE = 400 * 1024
POST_DISPLAY_MAX_OUTPUT_SIZE = 300 * 1024
THUMBNAIL_MAX_OUTPUT_SIZE = 100 * 1024
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
) -> tuple[
    bytes,
    str,
    bytes | None,
    str | None,
    bytes | None,
    str | None,
]:
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
        display_limit = (
            POST_DISPLAY_MAX_OUTPUT_SIZE if include_detail else MAX_OUTPUT_SIZE
        )
        compressed_bytes = _encode_with_limit(display_image, display_limit)

        thumbnail_bytes = None
        thumbnail_filename = None
        detail_bytes = None
        detail_filename = None
        if include_detail:
            thumbnail_image = image.copy()
            thumbnail_image.thumbnail(
                (THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION),
                Image.Resampling.LANCZOS,
            )
            thumbnail_filename = f"{base_name}_thumbnail.jpg"
            thumbnail_bytes = _encode_with_limit(
                thumbnail_image,
                THUMBNAIL_MAX_OUTPUT_SIZE,
            )
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
        return (
            compressed_bytes,
            filename,
            thumbnail_bytes,
            thumbnail_filename,
            detail_bytes,
            detail_filename,
        )
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
    summary="이미지 파일 업로드 (게시물용 썸네일·피드·상세 파생본 생성)",
)
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    purpose: str = Query("post", pattern="^(post|profile|story)$"),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise BadRequestException("이미지 파일만 업로드할 수 있습니다.")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise BadRequestException("원본 이미지는 15MB 이하만 업로드할 수 있습니다.")

    (
        compressed_bytes,
        filename,
        thumbnail_bytes,
        thumbnail_filename,
        detail_bytes,
        detail_filename,
    ) = process_and_resize_image(
        contents,
        file.filename or "image.jpg",
        include_detail=purpose == "post",
    )

    if purpose == "post" and hasattr(db, "scalar"):
        from app.modules.governance.service import moderate_openai, notify_content_moderation

        data_url = "data:image/jpeg;base64," + base64.b64encode(compressed_bytes).decode("ascii")
        decision = await moderate_openai(
            db,
            user_id=current_user.id,
            target_type="image_upload",
            image_data_url=data_url,
        )
        if decision.status in {"rejected", "review_required", "provider_error"}:
            await notify_content_moderation(db, user_id=current_user.id, decision=decision)
            raise BadRequestException(decision.user_message)

    # Only persist variants after the pre-publication moderation gate passes.
    local_variants = [(filename, compressed_bytes)]
    if thumbnail_filename and thumbnail_bytes is not None:
        local_variants.append((thumbnail_filename, thumbnail_bytes))
    if detail_filename and detail_bytes is not None:
        local_variants.append((detail_filename, detail_bytes))
    for local_filename, local_bytes in local_variants:
        with open(os.path.join(UPLOAD_DIR, local_filename), "wb") as local_file:
            local_file.write(local_bytes)

    upload_variants = [("display", compressed_bytes, filename)]
    if thumbnail_bytes is not None and thumbnail_filename is not None:
        upload_variants.append(("thumbnail", thumbnail_bytes, thumbnail_filename))
    if detail_bytes is not None and detail_filename is not None:
        upload_variants.append(("detail", detail_bytes, detail_filename))
    uploaded_urls = await asyncio.gather(
        *[
            upload_to_supabase_storage(variant_bytes, variant_filename)
            for _, variant_bytes, variant_filename in upload_variants
        ]
    )
    uploaded_by_kind = {
        kind: uploaded_urls[index]
        for index, (kind, _, _) in enumerate(upload_variants)
    }
    supabase_public_url = uploaded_by_kind.get("display")
    thumbnail_public_url = uploaded_by_kind.get("thumbnail")
    detail_public_url = uploaded_by_kind.get("detail")

    if supabase_public_url:
        final_url = supabase_public_url
    else:
        final_url = f"/static/uploads/{filename}"
    if thumbnail_filename:
        thumbnail_url = (
            thumbnail_public_url
            or (
                f"/static/uploads/{thumbnail_filename}"
                if not supabase_public_url
                else final_url
            )
        )
    else:
        thumbnail_url = final_url
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
        "thumbnail_url": thumbnail_url,
        "thumbnail_filename": thumbnail_filename,
        "detail_url": detail_url,
        "detail_filename": detail_filename,
    })
