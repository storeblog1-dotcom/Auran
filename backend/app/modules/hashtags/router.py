import re
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import get_optional_current_user
from app.modules.auth.models import User
from app.modules.hashtags.models import Hashtag, PostHashtag
from app.modules.hashtags.schemas import HashtagResponse
from app.modules.posts.models import Post
from app.modules.posts.service import _build_post_responses_batch

router = APIRouter(prefix="/tags", tags=["Hashtags"])


def parse_hashtags_from_caption(caption: str | None) -> list[str]:
    if not caption:
        return []
    # 한글, 영문, 숫자, 언더스코어 해시태그 파싱
    tags = re.findall(r"#([a-zA-Z0-9_가-힣]+)", caption)
    # 중복 제거 및 소문자 정규화 (필요시)
    unique_tags = list(dict.fromkeys(tags))
    return unique_tags


async def update_post_hashtags(db: AsyncSession, post_id, caption: str | None):
    tags = parse_hashtags_from_caption(caption)

    # 기존 포스트-해시태그 매핑 삭제
    existing_stmt = select(PostHashtag).where(PostHashtag.post_id == post_id)
    res = await db.execute(existing_stmt)
    for ph in res.scalars().all():
        await db.delete(ph)

    if not tags:
        await db.commit()
        return

    for tag_name in tags:
        clean_tag = tag_name.strip()
        if not clean_tag:
            continue

        # 태그 존재 여부 확인
        h_stmt = select(Hashtag).where(Hashtag.name == clean_tag)
        h_res = await db.execute(h_stmt)
        hashtag = h_res.scalars().first()

        if not hashtag:
            hashtag = Hashtag(name=clean_tag)
            db.add(hashtag)
            await db.flush()

        # 연결
        ph = PostHashtag(post_id=post_id, hashtag_id=hashtag.id)
        db.add(ph)

    await db.commit()


@router.get("/search", response_model=List[HashtagResponse])
async def search_hashtags(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """해시태그 이름 검색"""
    clean_q = q.lstrip("#").strip()
    stmt = (
        select(Hashtag.id, Hashtag.name, func.count(PostHashtag.id).label("posts_count"))
        .outerjoin(PostHashtag, Hashtag.id == PostHashtag.hashtag_id)
        .where(Hashtag.name.ilike(f"%{clean_q}%"))
        .group_by(Hashtag.id, Hashtag.name)
        .order_by(func.count(PostHashtag.id).desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    rows = res.all()

    return [
        HashtagResponse(id=r.id, name=r.name, posts_count=r.posts_count)
        for r in rows
    ]


@router.get("/trending", response_model=List[HashtagResponse])
async def get_trending_hashtags(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """트렌딩/인기 해시태그 목록 조회"""
    stmt = (
        select(Hashtag.id, Hashtag.name, func.count(PostHashtag.id).label("posts_count"))
        .join(PostHashtag, Hashtag.id == PostHashtag.hashtag_id)
        .group_by(Hashtag.id, Hashtag.name)
        .order_by(func.count(PostHashtag.id).desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    rows = res.all()

    return [
        HashtagResponse(id=r.id, name=r.name, posts_count=r.posts_count)
        for r in rows
    ]


@router.get("/{tag_name}/posts")
async def get_hashtag_posts(
    tag_name: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """특정 해시태그가 포함된 게시물 목록 조회"""
    # 해시태그 조회
    h_stmt = select(Hashtag).where(Hashtag.name == tag_name)
    h_res = await db.execute(h_stmt)
    hashtag = h_res.scalars().first()

    if not hashtag:
        return {"items": [], "total": 0, "page": page, "size": size, "has_more": False}

    posts_stmt = (
        select(Post)
        .join(PostHashtag, Post.id == PostHashtag.post_id)
        .where(PostHashtag.hashtag_id == hashtag.id)
        .order_by(Post.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    posts_res = await db.execute(posts_stmt)
    posts = list(posts_res.scalars().all())

    items = await _build_post_responses_batch(db, posts, current_user=current_user)

    return {
        "items": items,
        "total": len(items),
        "page": page,
        "size": size,
        "has_more": len(items) == size,
    }
