"""Create missing 480px post thumbnails without replacing existing images.

Run ``python -m scripts.backfill_post_thumbnails`` to inspect the work, then
add ``--apply`` after the thumbnail migration and backend deployment.
"""

import argparse
import asyncio
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageOps
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.modules.posts.models import PostMedia
from app.modules.uploads.router import (
    THUMBNAIL_MAX_DIMENSION,
    THUMBNAIL_MAX_OUTPUT_SIZE,
    UPLOAD_DIR,
    _encode_with_limit,
    upload_to_supabase_storage,
)


async def _download_source(client: httpx.AsyncClient, url: str) -> bytes:
    if url.startswith("/static/uploads/"):
        return (Path(UPLOAD_DIR) / Path(url).name).read_bytes()
    response = await client.get(url)
    response.raise_for_status()
    return response.content


def _make_thumbnail(source: bytes) -> bytes:
    image = ImageOps.exif_transpose(Image.open(BytesIO(source)))
    if image.mode != "RGB":
        image = image.convert("RGB")
    image.thumbnail(
        (THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION),
        Image.Resampling.LANCZOS,
    )
    return _encode_with_limit(image, THUMBNAIL_MAX_OUTPUT_SIZE)


async def run(*, apply: bool, limit: int | None) -> None:
    async with AsyncSessionLocal() as db:
        query = (
            select(PostMedia)
            .where(
                PostMedia.media_type == "image",
                PostMedia.thumbnail_media_url.is_(None),
            )
            .order_by(PostMedia.created_at, PostMedia.id)
        )
        if limit is not None:
            query = query.limit(limit)
        media_items = list((await db.scalars(query)).all())

        print(f"missing_thumbnails={len(media_items)} apply={apply}")
        if not apply:
            return

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            completed = 0
            for item in media_items:
                source_url = item.detail_media_url or item.media_url
                try:
                    source = await _download_source(client, source_url)
                    thumbnail = await asyncio.to_thread(_make_thumbnail, source)
                    filename = f"{item.id.hex}_thumbnail.jpg"
                    uploaded_url = await upload_to_supabase_storage(
                        thumbnail,
                        filename,
                    )
                    if uploaded_url:
                        item.thumbnail_media_url = uploaded_url
                    else:
                        local_path = Path(UPLOAD_DIR) / filename
                        local_path.write_bytes(thumbnail)
                        item.thumbnail_media_url = f"/static/uploads/{filename}"
                    await db.commit()
                    completed += 1
                    print(
                        f"updated={item.id} bytes={len(thumbnail)} "
                        f"source_host={urlparse(source_url).hostname or 'local'}"
                    )
                except Exception as exc:
                    await db.rollback()
                    print(f"failed={item.id} error={exc}")

        print(f"completed={completed} total={len(media_items)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    asyncio.run(run(apply=args.apply, limit=args.limit))
