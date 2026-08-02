"""Create deterministic Auran test users and non-duplicated social content.

Run from ``backend`` after configuring the target DATABASE_URL and Supabase
credentials::

    python scripts/seed_test_social_content.py --apply

The script is idempotent by username and feed post marker. It writes the
resulting account/status manifest to ``docs/feature-audit/test-accounts.js``.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from sqlalchemy import delete, func, select, update

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.modules.auth.models import User  # noqa: E402
from app.modules.community.models import CommunityBoard  # noqa: E402
from app.modules.posts.models import Post, PostMedia  # noqa: E402
from app.modules.uploads.router import (  # noqa: E402
    UPLOAD_DIR,
    process_and_resize_image,
    upload_to_supabase_storage,
)

ACCOUNT_COUNT = 20
FEED_POSTS_PER_ACCOUNT = 15
ANONYMOUS_POSTS_PER_ACCOUNT = 1
USERNAME_PREFIX = "auran_test_"
FEED_TITLE_PREFIX = "AURAN-SEED-FEED"
PHOTO_ENDPOINT = "https://picsum.photos/seed/{seed}/1600/2000"
MANIFEST_PATH = PROJECT_ROOT / "docs" / "feature-audit" / "test-accounts.js"

NAMES = [
    "김민서", "이지훈", "박서연", "최현우", "정하린", "강도윤", "조유진", "윤시우", "장나연", "임건우",
    "한소희", "오준서", "서지아", "신태윤", "권예린", "황민재", "안수빈", "송재현", "전아영", "홍지호",
]

NICKNAMES = [
    "새벽산책", "느린오후", "초록기록", "도시여행자", "따뜻한창가", "주말탐험", "작은행복", "빛의조각", "오늘의온도", "마음한켠",
    "구름수집가", "골목사진관", "잔잔한파도", "한낮의꿈", "소소한발견", "저녁산책", "푸른메모", "다정한시선", "계절우체국", "별빛일기",
]

PASSWORDS = [
    "Auran!T01#M7q", "Auran!T02#V4n", "Auran!T03#K8p", "Auran!T04#R2x", "Auran!T05#B9m",
    "Auran!T06#H3z", "Auran!T07#Q6c", "Auran!T08#L5w", "Auran!T09#S7j", "Auran!T10#F2v",
    "Auran!T11#N8d", "Auran!T12#P4y", "Auran!T13#G6k", "Auran!T14#W9r", "Auran!T15#C3h",
    "Auran!T16#J7s", "Auran!T17#X5a", "Auran!T18#D8u", "Auran!T19#E4t", "Auran!T20#Z6b",
]

SCENES = [
    ("창가에 번지는 아침빛을 천천히 바라봤어요.", "아침빛"),
    ("골목 끝 작은 카페에서 향긋한 한 잔을 만났어요.", "카페산책"),
    ("바람이 좋은 날 강변을 따라 오래 걸었습니다.", "강변걷기"),
    ("계절의 색이 담긴 나무 아래 잠시 머물렀어요.", "계절기록"),
    ("오늘의 점심은 눈으로 먼저 즐거운 한 접시였어요.", "오늘의식탁"),
    ("낯선 동네의 조용한 길에서 멋진 장면을 발견했어요.", "동네탐험"),
    ("해 질 무렵 하늘이 선물한 색을 사진에 담았습니다.", "노을"),
    ("비가 그친 뒤 반짝이는 거리의 표정이 좋았어요.", "비온뒤"),
    ("책과 음악이 함께한 느긋한 오후를 보냈습니다.", "오후휴식"),
    ("주말 시장에서 싱그러운 색과 활기를 만났어요.", "주말시장"),
    ("멀리 떠나지 않아도 여행 같은 순간은 찾아오네요.", "가까운여행"),
    ("따뜻한 조명 아래 오늘의 이야기를 차분히 정리했어요.", "저녁기록"),
    ("푸른 하늘과 선명한 그림자가 유난히 예쁜 날이었어요.", "푸른하루"),
    ("작지만 마음을 환하게 만든 순간을 오래 기억하려 해요.", "작은행복"),
    ("하루의 마지막 풍경을 바라보며 천천히 숨을 골랐습니다.", "하루마무리"),
]

ANON_TOPICS = [
    "새로운 환경에 적응하는 나만의 방법", "관계에서 솔직함의 적당한 선", "혼자 보내는 주말이 편안해진 이유", "요즘 작은 성취를 기록하고 있어요",
    "친구에게 먼저 연락하기가 망설여질 때", "일과 휴식의 경계를 만드는 연습", "낯선 모임에서 긴장을 줄이는 방법", "꾸준함을 지키기 어려운 날의 마음",
    "가족과 생각이 다를 때 대화하는 법", "좋아하는 일을 다시 시작해 보려 해요", "비교하는 습관에서 조금 멀어지는 중", "나를 위한 시간을 가져도 괜찮을까요",
    "진로를 바꿀지 고민하고 있습니다", "오래된 관계를 잘 정리하는 방법", "작은 친절이 오래 기억에 남았어요", "계획대로 되지 않은 날을 받아들이기",
    "새로운 취미를 시작할 용기가 필요해요", "말하지 못한 고마움을 전하고 싶어요", "지친 날에 스스로를 돌보는 방식", "올해 안에 꼭 해보고 싶은 한 가지",
]

ANON_LINES = [
    ("최근 비슷한 고민을 자주 떠올리게 됩니다.", "서두르지 않고 제 마음부터 살펴보려고 해요.", "주변의 조언도 듣지만 결국 제 속도가 중요하겠죠.", "작은 변화부터 시도해 본 분의 경험이 궁금합니다.", "편하게 이야기 나눠주시면 감사하겠습니다."),
    ("정답을 찾으려 할수록 생각이 더 복잡해지는 것 같아요.", "그래서 요즘은 하루에 하나씩 할 수 있는 일만 적고 있습니다.", "생각보다 마음이 가벼워지는 순간도 있었어요.", "여러분은 비슷한 시기를 어떻게 지나왔는지 궁금합니다.", "서로 부담 없이 경험을 나눠보면 좋겠어요."),
    ("혼자 결정하기에는 아직 확신이 부족합니다.", "무엇을 선택하든 아쉬움이 남을 것 같아 망설여져요.", "그래도 지금의 감정을 외면하지는 않으려고 합니다.", "같은 고민을 해본 분이 있다면 조언을 듣고 싶어요.", "천천히 읽고 참고해 보겠습니다."),
    ("요즘 일상의 균형을 다시 맞추는 중입니다.", "예전에는 결과만 중요하다고 생각했던 것 같아요.", "지금은 과정에서 느끼는 감정도 소중히 보려고 합니다.", "작은 습관을 오래 유지하는 팁이 있다면 알려주세요.", "오늘도 각자의 자리에서 잘 버티셨으면 좋겠습니다."),
]


def account_spec(index: int) -> dict[str, object]:
    number = index + 1
    return {
        "username": f"{USERNAME_PREFIX}{number:02d}",
        "email": f"auran.test.{number:02d}@example.invalid",
        "password": PASSWORDS[index],
        "nickname": NICKNAMES[index],
        "fullName": NAMES[index],
    }


def caption_for(user_index: int, post_index: int) -> str:
    scene, tag = SCENES[post_index]
    return f"{scene}\n{NICKNAMES[user_index]}의 {post_index + 1:02d}번째 기록입니다. #{tag} #{NICKNAMES[user_index]}"


def anonymous_body(index: int) -> str:
    lines = ANON_LINES[index % len(ANON_LINES)]
    return "\n".join(lines)


def feed_marker(user_index: int, post_index: int) -> str:
    return f"{FEED_TITLE_PREFIX}-{user_index + 1:02d}-{post_index + 1:02d}"


def source_photo_id(url: str) -> str:
    match = re.search(r"/id/(\d+)/", url)
    return match.group(1) if match else url


async def ensure_users() -> list[User]:
    users: list[User] = []
    async with AsyncSessionLocal() as db:
        for index in range(ACCOUNT_COUNT):
            spec = account_spec(index)
            user = (
                await db.execute(select(User).where(func.lower(User.username) == str(spec["username"]).lower()))
            ).scalar_one_or_none()
            if user is None:
                user = User(
                    username=spec["username"],
                    email=spec["email"],
                    full_name=spec["fullName"],
                    nickname=spec["nickname"],
                    age=22 + (index % 12),
                    bio=f"{spec['nickname']}의 테스트 프로필입니다.",
                    profile_visibility="public",
                    hashed_password=hash_password(str(spec["password"])),
                    is_active=True,
                    is_verified=True,
                    is_private=False,
                    allow_message_requests=True,
                )
                db.add(user)
                await db.flush()
            else:
                user.hashed_password = hash_password(str(spec["password"]))
                user.is_active = True
                user.is_verified = True
                user.is_private = False
                user.profile_visibility = "public"
            users.append(user)
        await db.commit()
        for user in users:
            await db.refresh(user)
    return users


async def get_anonymous_boards() -> list[CommunityBoard]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CommunityBoard)
            .where(
                CommunityBoard.is_anonymous.is_(True),
                CommunityBoard.is_active.is_(True),
                CommunityBoard.parent_id.is_not(None),
            )
            .order_by(CommunityBoard.sort_order, CommunityBoard.slug)
        )
        boards = list(result.scalars().all())
    if not boards:
        raise RuntimeError("활성 익명 하위 게시판이 없습니다.")
    return boards


async def existing_feed_markers(user_id) -> set[str]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Post.title).where(
                Post.user_id == user_id,
                Post.board_id.is_(None),
                Post.title.like(f"{FEED_TITLE_PREFIX}-%"),
            )
        )
        return {title for title in result.scalars().all() if title}


async def prepare_photo(
    client: httpx.AsyncClient,
    user_index: int,
    post_index: int,
    used_photo_ids: set[str],
    used_hashes: set[str],
    lock: asyncio.Lock,
) -> dict[str, str]:
    for retry in range(30):
        seed = f"auran-{user_index + 1:02d}-{post_index + 1:02d}-{retry:02d}"
        response = await client.get(PHOTO_ENDPOINT.format(seed=seed))
        response.raise_for_status()
        photo_id = source_photo_id(str(response.url))
        digest = hashlib.sha256(response.content).hexdigest()
        async with lock:
            if photo_id in used_photo_ids or digest in used_hashes:
                continue
            used_photo_ids.add(photo_id)
            used_hashes.add(digest)

        (
            display_bytes,
            display_name,
            thumbnail_bytes,
            thumbnail_name,
            detail_bytes,
            detail_name,
        ) = await asyncio.to_thread(
            process_and_resize_image,
            response.content,
            f"{seed}.jpg",
            include_detail=True,
        )
        if (
            thumbnail_bytes is None
            or thumbnail_name is None
            or detail_bytes is None
            or detail_name is None
        ):
            raise RuntimeError("게시물 이미지 파생본 생성에 실패했습니다.")
        try:
            display_url, thumbnail_url, detail_url = await asyncio.gather(
                upload_to_supabase_storage(display_bytes, display_name),
                upload_to_supabase_storage(thumbnail_bytes, thumbnail_name),
                upload_to_supabase_storage(detail_bytes, detail_name),
            )
        finally:
            for filename in (display_name, thumbnail_name, detail_name):
                path = Path(UPLOAD_DIR) / filename
                if path.exists():
                    path.unlink()
        if not display_url or not thumbnail_url or not detail_url:
            raise RuntimeError("Supabase 이미지 업로드에 실패했습니다.")
        return {
            "media_url": display_url,
            "thumbnail_media_url": thumbnail_url,
            "detail_media_url": detail_url,
            "source_url": str(response.url),
            "source_photo_id": photo_id,
            "source_sha256": digest,
        }
    raise RuntimeError("중복되지 않는 사진을 확보하지 못했습니다.")


async def create_feed_post(user: User, user_index: int, post_index: int, photo: dict[str, str]) -> None:
    created_at = datetime.now(timezone.utc) - timedelta(
        days=(FEED_POSTS_PER_ACCOUNT - post_index),
        minutes=user_index * 11,
    )
    async with AsyncSessionLocal() as db:
        post = Post(
            user_id=user.id,
            title=feed_marker(user_index, post_index),
            caption=caption_for(user_index, post_index),
            visibility="public",
            created_at=created_at,
            updated_at=created_at,
        )
        db.add(post)
        await db.flush()
        db.add(
            PostMedia(
                post_id=post.id,
                media_url=photo["media_url"],
                thumbnail_media_url=photo["thumbnail_media_url"],
                detail_media_url=photo["detail_media_url"],
                media_type="image",
                order=0,
            )
        )
        await db.commit()


async def create_anonymous_posts(users: list[User], boards: list[CommunityBoard]) -> None:
    async with AsyncSessionLocal() as db:
        for index, user in enumerate(users):
            title = ANON_TOPICS[index]
            exists = (
                await db.execute(
                    select(Post.id).where(
                        Post.user_id == user.id,
                        Post.board_type == "anonymous",
                        Post.title == title,
                    )
                )
            ).scalar_one_or_none()
            if exists:
                continue
            board = boards[index % len(boards)]
            created_at = datetime.now(timezone.utc) - timedelta(hours=ACCOUNT_COUNT - index)
            db.add(
                Post(
                    user_id=user.id,
                    title=title,
                    board_type="anonymous",
                    board_id=board.id,
                    caption=anonymous_body(index),
                    visibility="public",
                    created_at=created_at,
                    updated_at=created_at,
                )
            )
        await db.commit()


async def collect_manifest(users: list[User], photo_sources: list[dict[str, object]]) -> dict[str, object]:
    accounts = []
    async with AsyncSessionLocal() as db:
        for index, user in enumerate(users):
            feed_count = (
                await db.execute(
                    select(func.count(Post.id)).where(
                        Post.user_id == user.id,
                        Post.board_id.is_(None),
                        Post.title.like(f"{FEED_TITLE_PREFIX}-%"),
                    )
                )
            ).scalar_one()
            anonymous_count = (
                await db.execute(
                    select(func.count(Post.id)).where(
                        Post.user_id == user.id,
                        Post.board_type == "anonymous",
                    )
                )
            ).scalar_one()
            spec = account_spec(index)
            accounts.append(
                {
                    **spec,
                    "feedPosts": feed_count,
                    "anonymousPosts": anonymous_count,
                    "status": "완료" if feed_count == FEED_POSTS_PER_ACCOUNT and anonymous_count >= 1 else "확인 필요",
                }
            )
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "warning": "테스트 계정 전용 정보입니다. 외부 배포 및 실제 사용자 인증정보로 사용하지 마세요.",
        "targets": {
            "accounts": ACCOUNT_COUNT,
            "feedPostsPerAccount": FEED_POSTS_PER_ACCOUNT,
            "anonymousPostsPerAccount": ANONYMOUS_POSTS_PER_ACCOUNT,
        },
        "accounts": accounts,
        "photoSources": photo_sources,
    }


def write_manifest(manifest: dict[str, object]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(manifest, ensure_ascii=False, indent=2)
    MANIFEST_PATH.write_text(f"window.AURAN_TEST_ACCOUNTS = {payload};\n", encoding="utf-8")


async def apply_seed() -> None:
    users = await ensure_users()
    boards = await get_anonymous_boards()
    used_photo_ids: set[str] = set()
    used_hashes: set[str] = set()
    lock = asyncio.Lock()
    photo_sources: list[dict[str, object]] = []

    timeout = httpx.Timeout(45.0, connect=20.0)
    limits = httpx.Limits(max_connections=8, max_keepalive_connections=8)
    async with httpx.AsyncClient(timeout=timeout, limits=limits, follow_redirects=True) as client:
        for user_index, user in enumerate(users):
            markers = await existing_feed_markers(user.id)
            missing = [index for index in range(FEED_POSTS_PER_ACCOUNT) if feed_marker(user_index, index) not in markers]
            if missing:
                prepared = await asyncio.gather(
                    *(prepare_photo(client, user_index, post_index, used_photo_ids, used_hashes, lock) for post_index in missing)
                )
                for post_index, photo in zip(missing, prepared):
                    await create_feed_post(user, user_index, post_index, photo)
                    photo_sources.append(
                        {
                            "username": user.username,
                            "post": post_index + 1,
                            "sourceUrl": photo["source_url"],
                            "sourcePhotoId": photo["source_photo_id"],
                            "sourceSha256": photo["source_sha256"],
                        }
                    )
            print(f"[{user_index + 1:02d}/{ACCOUNT_COUNT}] {user.username}: feed ready")

    await create_anonymous_posts(users, boards)
    manifest = await collect_manifest(users, photo_sources)
    write_manifest(manifest)
    captions = [caption_for(user_index, post_index) for user_index in range(ACCOUNT_COUNT) for post_index in range(FEED_POSTS_PER_ACCOUNT)]
    if len(captions) != len(set(captions)):
        raise RuntimeError("캡션 중복 검증에 실패했습니다.")
    print(json.dumps({"accounts": len(users), "feedPosts": len(captions), "anonymousPosts": ACCOUNT_COUNT}, ensure_ascii=False))


async def rollback_seed() -> None:
    async with AsyncSessionLocal() as db:
        users = list(
            (
                await db.execute(select(User).where(User.username.like(f"{USERNAME_PREFIX}%")))
            ).scalars().all()
        )
        if not users:
            print("삭제할 테스트 사용자가 없습니다.")
            return
        user_ids = [user.id for user in users]
        media_rows = list(
            (
                await db.execute(
                    select(
                        PostMedia.media_url,
                        PostMedia.thumbnail_media_url,
                        PostMedia.detail_media_url,
                    )
                    .join(Post, PostMedia.post_id == Post.id)
                    .where(Post.user_id.in_(user_ids))
                )
            ).all()
        )
        await db.execute(delete(User).where(User.id.in_(user_ids)))
        await db.commit()
    storage_urls = {
        url
        for row in media_rows
        for url in row
        if url
    }
    print(json.dumps({"deletedUsers": len(user_ids), "storageObjectsRequireManualReview": len(storage_urls)}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--apply", action="store_true")
    action.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    asyncio.run(apply_seed() if args.apply else rollback_seed())


if __name__ == "__main__":
    main()
