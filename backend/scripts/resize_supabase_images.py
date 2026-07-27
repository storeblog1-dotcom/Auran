"""Resize every image in the configured Supabase Storage bucket in place.

Run from the backend directory after setting SUPABASE_KEY, or use --dry-run
to inspect the number of objects before replacing anything.
"""

import argparse
import asyncio
import os
from pathlib import PurePosixPath

import httpx

from app.core.config import settings
from app.modules.uploads.router import _encode_for_display
from PIL import Image, ImageOps
from io import BytesIO


async def list_objects(client: httpx.AsyncClient, prefix: str = "") -> list[str]:
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/list/{settings.supabase_storage_bucket}"
    response = await client.post(
        url,
        json={"prefix": prefix, "limit": 1000, "offset": 0, "sortBy": {"column": "name", "order": "asc"}},
        headers=_headers(),
    )
    response.raise_for_status()

    files: list[str] = []
    for item in response.json():
        name = item.get("name", "")
        path = str(PurePosixPath(prefix) / name) if prefix else name
        if item.get("id") is None:
            files.extend(await list_objects(client, path))
        else:
            files.append(path)
    return files


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.supabase_key}",
        "apiKey": settings.supabase_key,
    }


def resize_image(data: bytes) -> bytes:
    image = Image.open(BytesIO(data))
    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    image.thumbnail((1080, 1080), Image.Resampling.LANCZOS)
    return _encode_for_display(image)


async def process_object(client: httpx.AsyncClient, path: str, dry_run: bool) -> tuple[bool, str]:
    base = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{settings.supabase_storage_bucket}"
    response = await client.get(f"{base}/{path}", headers=_headers())
    response.raise_for_status()
    resized = resize_image(response.content)

    if not dry_run:
        upload = await client.post(
            f"{base}/{path}",
            content=resized,
            headers={**_headers(), "Content-Type": "image/jpeg", "x-upsert": "true"},
        )
        upload.raise_for_status()
    return True, f"{path}: {len(response.content)} -> {len(resized)} bytes"


async def main(dry_run: bool) -> None:
    if not settings.supabase_key:
        raise RuntimeError("SUPABASE_KEY is required")

    async with httpx.AsyncClient(timeout=60.0) as client:
        paths = await list_objects(client)
        print(f"Found {len(paths)} objects")
        for path in paths:
            try:
                _, message = await process_object(client, path, dry_run)
                print(message)
            except Exception as exc:
                # Do not delete or overwrite the source until processing succeeds.
                print(f"FAILED {path}: {exc}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.dry_run))
