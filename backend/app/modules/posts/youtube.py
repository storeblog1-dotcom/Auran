"""Strict server-side verification for YouTube videos shared in posts."""

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

import httpx

from app.common.exceptions import BadRequestException
from app.core.config import settings


VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
ALLOWED_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"}
YOUTUBE_VIDEOS_API = "https://www.googleapis.com/youtube/v3/videos"


@dataclass(frozen=True)
class VerifiedYouTubeVideo:
    url: str
    video_id: str
    title: str
    thumbnail_url: str | None


def _extract_video_id(raw_url: str) -> str:
    try:
        parsed = urlparse(raw_url.strip())
    except ValueError as exc:
        raise BadRequestException("YouTube 일반 영상 주소만 허용됩니다.") from exc

    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise BadRequestException("YouTube 일반 영상 주소만 허용됩니다.")

    if parsed.hostname == "youtu.be":
        video_id = parsed.path.lstrip("/")
        if not VIDEO_ID_RE.fullmatch(video_id):
            raise BadRequestException("YouTube 일반 영상 주소만 허용됩니다.")
        return video_id

    if parsed.path != "/watch":
        raise BadRequestException("YouTube 일반 영상 주소만 허용됩니다.")

    values = parse_qs(parsed.query, keep_blank_values=True).get("v", [])
    if len(values) != 1 or not VIDEO_ID_RE.fullmatch(values[0]):
        raise BadRequestException("YouTube 일반 영상 주소만 허용됩니다.")
    return values[0]


def _has_explicit_age_restriction(content_details: dict) -> bool:
    ratings = content_details.get("contentRating") or {}
    if ratings.get("ytRating") == "ytAgeRestricted":
        return True

    restricted_markers = ("adult", "mature", "restricted", "nc17")
    for value in ratings.values():
        if isinstance(value, str) and any(marker in value.lower() for marker in restricted_markers):
            return True
    return False


async def verify_youtube_watch_url(raw_url: str) -> VerifiedYouTubeVideo:
    """Fail closed unless YouTube confirms a public, embeddable, unrestricted video."""
    video_id = _extract_video_id(raw_url)
    if not settings.youtube_data_api_key:
        raise BadRequestException("YouTube 영상 안전 검증에 실패했습니다. 링크는 등록되지 않았습니다.")

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.get(
                YOUTUBE_VIDEOS_API,
                params={
                    "part": "snippet,contentDetails,status",
                    "id": video_id,
                    "key": settings.youtube_data_api_key,
                },
            )
    except httpx.HTTPError as exc:
        raise BadRequestException("YouTube 영상 안전 검증에 실패했습니다. 링크는 등록되지 않았습니다.") from exc

    if response.status_code != 200:
        raise BadRequestException("YouTube 영상 안전 검증에 실패했습니다. 링크는 등록되지 않았습니다.")

    items = response.json().get("items") or []
    if len(items) != 1:
        raise BadRequestException("공개된 YouTube 영상만 등록할 수 있습니다.")

    video = items[0]
    status = video.get("status") or {}
    if status.get("privacyStatus") != "public":
        raise BadRequestException("공개된 YouTube 영상만 등록할 수 있습니다.")
    if status.get("embeddable") is not True:
        raise BadRequestException("외부 재생이 허용되지 않은 YouTube 영상입니다.")
    if _has_explicit_age_restriction(video.get("contentDetails") or {}):
        raise BadRequestException("연령 제한 또는 성인 등급이 있는 YouTube 영상은 등록할 수 없습니다.")

    snippet = video.get("snippet") or {}
    thumbnails = snippet.get("thumbnails") or {}
    thumbnail = (thumbnails.get("high") or thumbnails.get("medium") or thumbnails.get("default") or {}).get("url")
    return VerifiedYouTubeVideo(
        url=f"https://www.youtube.com/watch?v={video_id}",
        video_id=video_id,
        title=str(snippet.get("title") or "YouTube 영상")[:500],
        thumbnail_url=thumbnail,
    )
