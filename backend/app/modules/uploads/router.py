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
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_FILE_SIZE = 1 * 1024 * 1024
MAX_OUTPUT_SIZE = 400 * 1024


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
            else:
                print(f"[Supabase Storage Warning] Status {resp.status_code}: {resp.text}")
                return None
    except Exception as e:
        print(f"[Supabase Storage Error] {e}")
        return None


def process_and_resize_image(file_bytes: bytes, original_filename: str) -> tuple[bytes, str]:
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = ".jpg"

    try:
        image = Image.open(BytesIO(file_bytes))

        # EXIF 회전값 자동 보정 (스마트폰 카메라 세로/가로 직립 보정)
        image = ImageOps.exif_transpose(image)

        # RGBA/Paletted -> RGB 변환 (JPEG 저장 표준화)
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        # 모바일용 비율 유지 다운스케일링 (1080px)
        image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

        filename = f"{uuid.uuid4().hex}.jpg"
        
        compressed_bytes = _encode_for_display(image)

        # 로컬 폴백 저장
        save_path = os.path.join(UPLOAD_DIR, filename)
        with open(save_path, "wb") as f:
            f.write(compressed_bytes)

        return compressed_bytes, filename
    except Exception as e:
        raise BadRequestException(f"이미지 처리 중 오류가 발생했습니다: {str(e)}")


def _encode_for_display(image: Image.Image) -> bytes:
    working = image.copy()
    while True:
        for quality in range(85, 4, -5):
            buffer = BytesIO()
            working.save(buffer, format="JPEG", quality=quality, optimize=True, progressive=True)
            encoded = buffer.getvalue()
            if len(encoded) <= MAX_OUTPUT_SIZE:
                return encoded

        width, height = working.size
        if max(width, height) <= 320:
            return encoded
        working.thumbnail((max(320, int(width * 0.85)), max(320, int(height * 0.85))), Image.Resampling.LANCZOS)


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
        raise BadRequestException("Upload file must be 1MB or less.")

    compressed_bytes, filename = process_and_resize_image(
        contents,
        file.filename or "image.jpg",
    )
    
    # 1. Supabase Storage 업로드 시도
    supabase_public_url = await upload_to_supabase_storage(compressed_bytes, filename)
    
    if supabase_public_url:
        final_url = supabase_public_url
    else:
        final_url = f"/static/uploads/{filename}"

    return ApiResponse.ok({
        "url": final_url,
        "filename": filename
    })
