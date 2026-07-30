import uuid
from typing import List, Optional

from sqlalchemy import and_, exists, func, literal_column, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.common.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.modules.auth.models import User
from app.modules.audit.content_retention import (
    preserve_comment,
    preserve_comment_tree_for_deletion,
    preserve_post,
    preserve_post_comments_for_deletion,
)
from app.modules.audit.service import record
from app.modules.community.models import CommunityBoard
from app.modules.posts.models import Comment, CommentLike, Post, PostBookmark, PostLike, PostMedia, PostRepost
from app.modules.reports.models import HiddenContent
from app.modules.posts.schemas import (
    CommentCreateRequest,
    CommentLikeToggleResponse,
    CommentResponse,
    CommentUpdateRequest,
    PostBookmarkToggleResponse,
    PostCreateRequest,
    PostLikeToggleResponse,
    PostMediaResponse,
    PostRepostToggleResponse,
    PostResponse,
    PostUpdateRequest,
    PostUserSummary,
)
from app.modules.posts.youtube import VerifiedYouTubeVideo, verify_youtube_watch_url
from app.modules.users.models import Follow


def should_anonymize_user(board_type: str | None, is_admin: bool) -> bool:
    """익명 게시판에서도 관리자 신원은 서비스 운영 주체로 공개한다."""
    return board_type == "anonymous" and not is_admin


def _post_visibility_clause(current_user: Optional[User]):
    """계정 공개 설정과 게시물 공개 범위를 함께 적용한다."""
    public_author = User.is_private.is_(False)

    if current_user is None:
        return and_(
            public_author,
            Post.visibility == "public",
            Post.moderation_hidden.is_(False),
        )
    if current_user.is_admin:
        return True

    current_user_id = current_user.id

    is_follower = exists(
        select(Follow.id).where(
            Follow.follower_id == current_user_id,
            Follow.following_id == Post.user_id,
        )
    )
    author_visible = or_(
        Post.user_id == current_user_id,
        and_(public_author, Post.user_id != current_user_id),
        is_follower,
    )
    post_visible = or_(
        Post.visibility == "public",
        and_(Post.visibility == "followers", is_follower),
        and_(Post.visibility == "private", Post.user_id == current_user_id),
    )
    user_hidden = exists(
        select(HiddenContent.id).where(
            HiddenContent.user_id == current_user_id,
            HiddenContent.target_type == "post",
            HiddenContent.target_id == Post.id,
        )
    )
    return and_(
        author_visible,
        post_visible,
        Post.moderation_hidden.is_(False),
        ~user_hidden,
    )


async def _can_view_post(
    db: AsyncSession, post: Post, current_user: Optional[User]
) -> bool:
    if current_user and current_user.is_admin:
        return True
    if post.moderation_hidden:
        return False
    if current_user:
        hidden = await db.scalar(
            select(HiddenContent.id).where(
                HiddenContent.user_id == current_user.id,
                HiddenContent.target_type == "post",
                HiddenContent.target_id == post.id,
            )
        )
        if hidden:
            return False
    if current_user and post.user_id == current_user.id:
        return True
    if post.user.is_private:
        return False
    if post.visibility == "private":
        return False
    if post.visibility == "followers":
        if not current_user:
            return False
        follower_res = await db.execute(
            select(Follow.id).where(
                Follow.follower_id == current_user.id,
                Follow.following_id == post.user_id,
            )
        )
        return follower_res.scalar_one_or_none() is not None
    return True


async def _build_post_responses_batch(
    db: AsyncSession, posts: List[Post], current_user: Optional[User] = None
) -> List[PostResponse]:
    """여러 Post ORM 객체를 배치 처리하여 likes_count, comments_count, reposts_count, is_liked, is_bookmarked, is_reposted를 계산한 PostResponse DTO 목록으로 변환합니다."""
    if not posts:
        return []

    import time
    t_batch_start = time.perf_counter()
    post_ids = [p.id for p in posts]
    board_ids = {p.board_id for p in posts if p.board_id}
    board_map: dict[uuid.UUID, CommunityBoard] = {}
    t_boards_start = time.perf_counter()
    if board_ids:
        boards_res = await db.execute(
            select(CommunityBoard).options(joinedload(CommunityBoard.parent)).where(CommunityBoard.id.in_(board_ids))
        )
        board_map = {board.id: board for board in boards_res.scalars().all()}
    t_boards_end = time.perf_counter()

    following_user_ids: set[uuid.UUID] = set()
    t_author_profile_start = time.perf_counter()
    if current_user:
        author_ids = {p.user_id for p in posts}
        following_res = await db.execute(
            select(Follow.following_id).where(
                Follow.follower_id == current_user.id,
                Follow.following_id.in_(author_ids),
            )
        )
        following_user_ids = set(following_res.scalars().all())
    t_author_profile_end = time.perf_counter()

    # 1. [통합 쿼리] 게시물별 좋아요 수, 댓글 수, 리포스트 수 (단 1회의 DB 왕복)
    t_likes_start = time.perf_counter()
    q_likes = (
        select(PostLike.post_id.label("post_id"), literal_column("'like'").label("kind"), func.count(PostLike.id).label("cnt"))
        .where(PostLike.post_id.in_(post_ids))
        .group_by(PostLike.post_id)
    )
    q_comments = (
        select(Comment.post_id.label("post_id"), literal_column("'comment'").label("kind"), func.count(Comment.id).label("cnt"))
        .where(Comment.post_id.in_(post_ids), Comment.moderation_hidden.is_(False))
        .group_by(Comment.post_id)
    )
    q_reposts = (
        select(PostRepost.post_id.label("post_id"), literal_column("'repost'").label("kind"), func.count(PostRepost.id).label("cnt"))
        .where(PostRepost.post_id.in_(post_ids))
        .group_by(PostRepost.post_id)
    )
    counts_union = union_all(q_likes, q_comments, q_reposts)
    counts_res = await db.execute(counts_union)

    likes_map = {}
    comments_map = {}
    reposts_map = {}
    for pid, kind, cnt in counts_res.all():
        if kind == 'like':
            likes_map[pid] = cnt
        elif kind == 'comment':
            comments_map[pid] = cnt
        elif kind == 'repost':
            reposts_map[pid] = cnt

    # 2. [통합 쿼리] 현재 사용자의 좋아요, 북마크, 리포스트 여부 (단 1회의 DB 왕복)
    liked_set = set()
    bookmarked_set = set()
    reposted_set = set()
    if current_user:
        u_likes = select(PostLike.post_id.label("post_id"), literal_column("'like'").label("kind")).where(
            PostLike.post_id.in_(post_ids), PostLike.user_id == current_user.id
        )
        u_bookmarks = select(PostBookmark.post_id.label("post_id"), literal_column("'bookmark'").label("kind")).where(
            PostBookmark.post_id.in_(post_ids), PostBookmark.user_id == current_user.id
        )
        u_reposts = select(PostRepost.post_id.label("post_id"), literal_column("'repost'").label("kind")).where(
            PostRepost.post_id.in_(post_ids), PostRepost.user_id == current_user.id
        )
        user_union = union_all(u_likes, u_bookmarks, u_reposts)
        user_res = await db.execute(user_union)
        for pid, kind in user_res.all():
            if kind == 'like':
                liked_set.add(pid)
            elif kind == 'bookmark':
                bookmarked_set.add(pid)
            elif kind == 'repost':
                reposted_set.add(pid)
    t_likes_end = time.perf_counter()

    # 3. [통합 쿼리] 게시물별 댓글 미리보기 및 작성자 프로필 JOIN (단 1회의 DB 왕복)
    t_comments_preview_start = time.perf_counter()
    comments_preview_res = await db.execute(
        select(Comment)
        .options(joinedload(Comment.user))
        .where(Comment.post_id.in_(post_ids), Comment.moderation_hidden.is_(False))
        .order_by(Comment.created_at.asc())
    )
    all_comments = comments_preview_res.scalars().all()
    preview_comments_map: dict[uuid.UUID, List[CommentResponse]] = {}
    for c in all_comments:
        if c.post_id not in preview_comments_map:
            preview_comments_map[c.post_id] = []
        if len(preview_comments_map[c.post_id]) < 3:
            preview_comments_map[c.post_id].append(
                CommentResponse(
                    id=c.id,
                    post_id=c.post_id,
                    parent_id=c.parent_id,
                    user=PostUserSummary(
                        id=c.user.id,
                        username=c.user.username,
                        nickname=c.user.nickname,
                        full_name=c.user.full_name,
                        profile_image_url=c.user.profile_image_url,
                        is_admin=c.user.is_admin,
                    ),
                    content=c.content,
                    created_at=c.created_at,
                    updated_at=c.updated_at,
                )
            )
    t_comments_preview_end = time.perf_counter()

    t_anonymize_start = time.perf_counter()
    result = []
    for post in posts:
        media_responses = [
            PostMediaResponse(
                id=m.id,
                media_url=m.media_url,
                detail_media_url=m.detail_media_url or m.media_url,
                media_type=m.media_type,
                order=m.order,
            )
            for m in sorted(post.media, key=lambda x: x.order)
        ]
        is_mine = current_user is not None and (
            current_user.is_admin or post.user_id == current_user.id
        )
        if should_anonymize_user(post.board_type, post.user.is_admin):
            user_summary = PostUserSummary(
                id=uuid.UUID(int=0),
                username="익명",
                full_name="익명 사용자",
                profile_image_url=post.user.profile_image_url,
            )
        else:
            user_summary = PostUserSummary(
                id=post.user.id,
                username=post.user.username,
                nickname=post.user.nickname,
                full_name=post.user.full_name,
                profile_image_url=post.user.profile_image_url,
                is_following=post.user.id in following_user_ids,
                is_admin=post.user.is_admin,
            )
        
        raw_previews = preview_comments_map.get(post.id, [])
        final_previews = []
        for pc in raw_previews:
            pc_copy = pc.model_copy()
            if should_anonymize_user(post.board_type, pc.user.is_admin):
                pc_copy.user = PostUserSummary(
                    id=uuid.UUID(int=0),
                    username="익명",
                    full_name="익명 사용자",
                    profile_image_url=pc.user.profile_image_url,
                )
            if current_user and (current_user.is_admin or pc.user.id == current_user.id):
                pc_copy.is_mine = True
            final_previews.append(pc_copy)

        result.append(
            PostResponse(
                id=post.id,
                user=user_summary,
                title=post.title,
                board_type=post.board_type,
                board_id=post.board_id,
                board_name=board_map[post.board_id].name if post.board_id in board_map else None,
                parent_board_name=(
                    board_map[post.board_id].parent.name
                    if post.board_id in board_map and board_map[post.board_id].parent
                    else None
                ),
                caption=post.caption,
                location=post.location,
                youtube_url=post.youtube_url,
                youtube_video_id=post.youtube_video_id,
                youtube_title=post.youtube_title,
                youtube_thumbnail_url=post.youtube_thumbnail_url,
                visibility=post.visibility,
                media=media_responses,
                likes_count=likes_map.get(post.id, 0),
                comments_count=comments_map.get(post.id, 0),
                reposts_count=reposts_map.get(post.id, 0),
                preview_comments=final_previews,
                is_liked=post.id in liked_set,
                is_bookmarked=post.id in bookmarked_set,
                is_reposted=post.id in reposted_set,
                is_mine=is_mine,
                created_at=post.created_at,
                updated_at=post.updated_at,
            )
        )
    t_anonymize_end = time.perf_counter()

    print(f"[PERF_LOG] [SERVICE] 작성자 프로필/팔로우 조회 시간: {(t_author_profile_end - t_author_profile_start)*1000:.2f} ms")
    print(f"[PERF_LOG] [SERVICE] 통합 집계수 (좋아요/댓글/리포스트) & 내 반응 상태 조회 시간: {(t_likes_end - t_likes_start)*1000:.2f} ms")
    print(f"[PERF_LOG] [SERVICE] 댓글 미리보기 및 댓글 유저 JOIN 조회 시간: {(t_comments_preview_end - t_comments_preview_start)*1000:.2f} ms")
    print(f"[PERF_LOG] [SERVICE] 익명 닉네임/DTO 가공 시간: {(t_anonymize_end - t_anonymize_start)*1000:.2f} ms")
    print(f"[PERF_LOG] [SERVICE] _build_post_responses_batch 전체 소요시간: {(t_anonymize_end - t_batch_start)*1000:.2f} ms")

    return result


async def _build_post_response(
    db: AsyncSession, post: Post, current_user: Optional[User] = None
) -> PostResponse:
    """단일 Post ORM 객체를 PostResponse DTO로 변환합니다."""
    res = await _build_post_responses_batch(db, [post], current_user=current_user)
    return res[0]


async def create_post(
    db: AsyncSession,
    current_user: User,
    data: PostCreateRequest,
    ip_address: str | None = None,
) -> PostResponse:
    """신규 게시물을 작성하고 미디어를 저장합니다."""
    if data.board_id:
        board = (await db.execute(select(CommunityBoard).where(CommunityBoard.id == data.board_id))).scalar_one_or_none()
        if not board or not board.is_active:
            raise BadRequestException("사용할 수 없는 게시판입니다.")
        if not board.parent_id:
            raise BadRequestException("하위 게시판을 선택해 주세요.")
        if ("partner" in board.slug.lower() or "제휴업소" in board.name) and not current_user.is_admin:
            raise ForbiddenException("제휴업소 게시판은 관리자만 게시물을 작성할 수 있습니다.")

    verified_video: VerifiedYouTubeVideo | None = None
    if data.youtube_url:
        verified_video = await verify_youtube_watch_url(data.youtube_url)

    post = Post(
        user_id=current_user.id,
        title=data.title,
        board_type=("anonymous" if board and board.is_anonymous else "info") if data.board_id else data.board_type,
        board_id=data.board_id,
        caption=data.caption,
        location=data.location,
        youtube_url=verified_video.url if verified_video else None,
        youtube_video_id=verified_video.video_id if verified_video else None,
        youtube_title=verified_video.title if verified_video else None,
        youtube_thumbnail_url=verified_video.thumbnail_url if verified_video else None,
        visibility=data.visibility or "public",
    )
    db.add(post)
    await db.flush()

    for item in data.media:
        media_obj = PostMedia(
            post_id=post.id,
            media_url=item.media_url,
            detail_media_url=item.detail_media_url or item.media_url,
            media_type=item.media_type,
            order=item.order,
        )
        db.add(media_obj)

    await db.flush()
    revision = await preserve_post(
        db, post, lifecycle_event="created", ip_address=ip_address
    )
    await record(
        db,
        user_id=current_user.id,
        event_type="post_created",
        ip_address=ip_address,
        target_type="post",
        target_id=post.id,
        revision_id=revision.id,
        snapshot={"title": post.title, "caption": post.caption},
    )
    await db.commit()

    if post.caption:
        from app.modules.hashtags.router import update_post_hashtags
        await update_post_hashtags(db, post.id, post.caption)

    # 연관 데이터 로딩 후 반환
    result = await db.execute(
        select(Post)
        .options(selectinload(Post.user), selectinload(Post.media))
        .where(Post.id == post.id)
    )
    created_post = result.scalar_one()

    return await _build_post_response(db, created_post, current_user=current_user)


async def get_post_by_id(
    db: AsyncSession,
    post_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> PostResponse:
    """특정 게시물을 단건 조회합니다."""
    result = await db.execute(
        select(Post)
        .options(selectinload(Post.user), selectinload(Post.media))
        .where(Post.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise NotFoundException("Post")
    if not await _can_view_post(db, post, current_user):
        raise NotFoundException("Post")

    return await _build_post_response(db, post, current_user=current_user)


async def get_feed_posts(
    db: AsyncSession,
    current_user: Optional[User] = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[List[PostResponse], int]:
    """로그인한 사용자가 팔로우하는 사람들과 본인의 피드 게시물을 최신순으로 조회합니다 (게시판 글 제외)."""
    import time
    from app.core.config import settings
    t_posts_start = time.perf_counter()
    # COUNT(*) 쿼리를 제거하고 limit + 1 조회를 통해 has_more 및 total을 연산 (SQL 1회 절감)
    result = await db.execute(
        select(Post)
        .join(User, Post.user_id == User.id)
        .options(joinedload(Post.user), selectinload(Post.media))
        .where(
            Post.board_type.is_(None),
            _post_visibility_clause(current_user),
        )
        .order_by(Post.created_at.desc(), Post.id.desc())
        .offset(offset)
        .limit(limit + 1)
    )
    fetched_posts = list(result.scalars().all())
    t_posts_end = time.perf_counter()

    has_more = len(fetched_posts) > limit
    posts = fetched_posts[:limit] if has_more else fetched_posts
    total = offset + len(posts)

    if settings.enable_perf_log:
        print(f"[PERF_LOG] [FEED] 기본 게시물 목록 쿼리 시간 (joinedload user + selectinload media 포함): {(t_posts_end - t_posts_start)*1000:.2f} ms")

    items = await _build_post_responses_batch(db, posts, current_user=current_user)
    return items, total


async def get_community_posts(
    db: AsyncSession,
    board_type: str | None = None,
    board_id: uuid.UUID | None = None,
    parent_board_id: uuid.UUID | None = None,
    current_user: Optional[User] = None,
    limit: int = 30,
    offset: int = 0,
) -> tuple[List[PostResponse], int]:
    """커뮤니티 게시판(익명게시판 / 정보게시판) 게시물 목록 조회"""
    import time
    from app.core.config import settings
    visibility_clause = _post_visibility_clause(current_user)
    board_filter = (
        CommunityBoard.parent_id == parent_board_id
        if parent_board_id
        else (Post.board_id == board_id) if board_id else (Post.board_type == board_type)
    )

    t_posts_start = time.perf_counter()
    # COUNT(*) 쿼리를 제거하고 limit + 1 조회를 통해 has_more 및 total을 연산 (SQL 1회 절감)
    query = (
        select(Post)
        .join(User, Post.user_id == User.id)
        .outerjoin(CommunityBoard, CommunityBoard.id == Post.board_id)
        .options(joinedload(Post.user), selectinload(Post.media))
        .where(board_filter, visibility_clause)
        .order_by(Post.created_at.desc(), Post.id.desc())
        .offset(offset)
        .limit(limit + 1)
    )
    res = await db.execute(query)
    fetched_posts = list(res.scalars().all())
    t_posts_end = time.perf_counter()

    has_more = len(fetched_posts) > limit
    posts = fetched_posts[:limit] if has_more else fetched_posts
    total = offset + len(posts)

    print(f"[PERF_LOG] [COMMUNITY] 기본 게시물 목록 쿼리 시간 (joinedload user + selectinload media 포함): {(t_posts_end - t_posts_start)*1000:.2f} ms")

    items = await _build_post_responses_batch(db, posts, current_user=current_user)
    return items, total


async def get_user_posts(
    db: AsyncSession,
    username: str,
    current_user: Optional[User] = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[List[PostResponse], int]:
    """특정 사용자가 작성한 게시물 목록을 최신순으로 조회합니다."""
    # 유저 존재 여부 확인
    user_res = await db.execute(select(User).where(User.username == username))
    target_user = user_res.scalar_one_or_none()
    if not target_user:
        raise NotFoundException("User")

    # 총 게시물 수
    count_res = await db.execute(
        select(func.count(Post.id))
        .join(User, Post.user_id == User.id)
        .where(
            Post.user_id == target_user.id,
            _post_visibility_clause(current_user),
        )
    )
    total = count_res.scalar() or 0

    # 게시물 목록
    result = await db.execute(
        select(Post)
        .join(User, Post.user_id == User.id)
        .options(selectinload(Post.user), selectinload(Post.media))
        .where(
            Post.user_id == target_user.id,
            _post_visibility_clause(current_user),
        )
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    posts = result.scalars().all()

    items = await _build_post_responses_batch(db, list(posts), current_user=current_user)
    return items, total


async def update_post(
    db: AsyncSession,
    post_id: uuid.UUID,
    current_user: User,
    data: PostUpdateRequest,
    ip_address: str | None = None,
) -> PostResponse:
    """본인이 작성한 게시물의 제목, 게시판 타입, 문구, 위치 및 미디어를 수정합니다."""
    result = await db.execute(
        select(Post)
        .options(selectinload(Post.user), selectinload(Post.media))
        .where(Post.id == post_id)
        .with_for_update()
    )
    post = result.scalar_one_or_none()
    if not post:
        raise NotFoundException("Post")

    if post.user_id != current_user.id and not current_user.is_admin:
        raise ForbiddenException("You can only edit your own posts")

    if data.title is not None:
        post.title = data.title
    if data.board_id is not None:
        board = (await db.execute(select(CommunityBoard).where(CommunityBoard.id == data.board_id))).scalar_one_or_none()
        if not board or not board.is_active or not board.parent_id:
            raise BadRequestException("사용할 수 없는 하위 게시판입니다.")
        if ("partner" in board.slug.lower() or "제휴업소" in board.name) and not current_user.is_admin:
            raise ForbiddenException("제휴업소 게시판은 관리자만 게시물을 작성할 수 있습니다.")
        post.board_id = board.id
        post.board_type = "anonymous" if board.is_anonymous else "info"
    elif data.board_type is not None:
        post.board_type = data.board_type
    if data.caption is not None:
        post.caption = data.caption
    if data.location is not None:
        post.location = data.location
    if data.visibility is not None:
        post.visibility = data.visibility

    if "youtube_url" in data.model_fields_set:
        verified_video: VerifiedYouTubeVideo | None = None
        if data.youtube_url:
            verified_video = await verify_youtube_watch_url(data.youtube_url)
        post.youtube_url = verified_video.url if verified_video else None
        post.youtube_video_id = verified_video.video_id if verified_video else None
        post.youtube_title = verified_video.title if verified_video else None
        post.youtube_thumbnail_url = verified_video.thumbnail_url if verified_video else None

    if data.media is not None:
        for old_m in list(post.media):
            await db.delete(old_m)
        await db.flush()

        for item in data.media:
            media_obj = PostMedia(
                post_id=post.id,
                media_url=item.media_url,
                detail_media_url=item.detail_media_url or item.media_url,
                media_type=item.media_type,
                order=item.order,
            )
            db.add(media_obj)

    await db.flush()
    # `updated_at` is server-managed. Refresh it explicitly before the audit
    # snapshot reads it so async SQLAlchemy does not attempt implicit IO.
    await db.refresh(post, attribute_names=["updated_at"])
    revision = await preserve_post(
        db, post, lifecycle_event="updated", ip_address=ip_address
    )
    await record(
        db,
        user_id=current_user.id,
        event_type="post_updated",
        ip_address=ip_address,
        target_type="post",
        target_id=post.id,
        revision_id=revision.id,
        snapshot={"title": post.title, "caption": post.caption, "location": post.location},
    )
    await db.commit()

    from app.modules.hashtags.router import update_post_hashtags
    await update_post_hashtags(db, post.id, post.caption or "")

    result = await db.execute(
        select(Post)
        .options(selectinload(Post.user), selectinload(Post.media))
        .where(Post.id == post.id)
    )
    updated_post = result.scalar_one()

    return await _build_post_response(db, updated_post, current_user=current_user)


async def delete_post(
    db: AsyncSession,
    post_id: uuid.UUID,
    current_user: User,
    ip_address: str | None = None,
    record_audit: bool = True,
) -> None:
    """본인이 작성한 게시물을 삭제합니다 (연관 미디어 연쇄 삭제)."""
    result = await db.execute(
        select(Post).options(selectinload(Post.media)).where(Post.id == post_id)
        .with_for_update()
    )
    post = result.scalar_one_or_none()
    if not post:
        raise NotFoundException("Post")

    if post.user_id != current_user.id and not current_user.is_admin:
        raise ForbiddenException("You can only delete your own posts")

    await preserve_post_comments_for_deletion(
        db, post.id, ip_address=ip_address
    )
    revision = await preserve_post(
        db, post, lifecycle_event="deleted", ip_address=ip_address
    )
    if record_audit:
        await record(
            db,
            user_id=post.user_id,
            event_type="post_deleted",
            ip_address=ip_address,
            target_type="post",
            target_id=post.id,
            revision_id=revision.id,
            snapshot={
                "title": post.title,
                "caption": post.caption,
                "deleted_by": str(current_user.id),
                "deleted_by_admin": current_user.is_admin and current_user.id != post.user_id,
            },
        )
    await db.delete(post)
    await db.commit()


# ─── LIKES SERVICE ──────────────────────────────────────────────────────────


async def toggle_like_post(
    db: AsyncSession,
    post_id: uuid.UUID,
    current_user: User,
) -> PostLikeToggleResponse:
    """게시물 좋아요를 토글(추가 / 취소)합니다."""
    # 1. 게시물 존재 여부 확인
    post_res = await db.execute(select(Post.id).where(Post.id == post_id))
    if not post_res.scalar_one_or_none():
        raise NotFoundException("Post")

    # 2. 기존 좋아요 확인
    like_res = await db.execute(
        select(PostLike).where(
            PostLike.post_id == post_id, PostLike.user_id == current_user.id
        )
    )
    existing_like = like_res.scalar_one_or_none()

    if existing_like:
        await db.delete(existing_like)
        await db.commit()
        is_liked = False
    else:
        new_like = PostLike(user_id=current_user.id, post_id=post_id)
        db.add(new_like)
        await db.commit()
        is_liked = True

        # 알림 생성 (게시물 작성자에게)
        post_obj_res = await db.execute(select(Post).where(Post.id == post_id))
        post_obj = post_obj_res.scalar_one_or_none()
        if post_obj:
            from app.modules.notifications.models import NotificationType
            from app.modules.notifications.service import create_notification

            await create_notification(
                db,
                recipient_id=post_obj.user_id,
                sender_id=current_user.id,
                type=NotificationType.LIKE.value,
                message=f"{current_user.nickname or current_user.username}님이 회원님의 게시물을 좋아합니다.",
                post_id=post_id,
            )

    # 3. 최신 좋아요 개수 계산
    count_res = await db.execute(
        select(func.count(PostLike.id)).where(PostLike.post_id == post_id)
    )
    likes_count = count_res.scalar() or 0

    return PostLikeToggleResponse(is_liked=is_liked, likes_count=likes_count)


async def get_post_likes(
    db: AsyncSession,
    post_id: uuid.UUID,
) -> List[PostUserSummary]:
    """특정 게시물을 좋아요 한 사용자 목록을 조회합니다."""
    post_res = await db.execute(select(Post.id).where(Post.id == post_id))
    if not post_res.scalar_one_or_none():
        raise NotFoundException("Post")

    result = await db.execute(
        select(PostLike)
        .options(selectinload(PostLike.user))
        .where(PostLike.post_id == post_id)
        .order_by(PostLike.created_at.desc())
    )
    likes = result.scalars().all()

    return [
        PostUserSummary(
            id=like.user.id,
            username=like.user.username,
            nickname=like.user.nickname,
            full_name=like.user.full_name,
            profile_image_url=like.user.profile_image_url,
            is_admin=like.user.is_admin,
        )
        for like in likes
    ]


# ─── COMMENTS SERVICE ───────────────────────────────────────────────────────


async def create_comment(
    db: AsyncSession,
    post_id: uuid.UUID,
    current_user: User,
    data: CommentCreateRequest,
    ip_address: str | None = None,
) -> CommentResponse:
    """특정 게시물에 댓글을 작성합니다."""
    post_res = await db.execute(select(Post.id).where(Post.id == post_id))
    if not post_res.scalar_one_or_none():
        raise NotFoundException("Post")

    reply_to_display_name = None
    if data.mention_user_id:
        reply_target = (
            await db.execute(select(User).where(User.id == data.mention_user_id))
        ).scalar_one_or_none()
        if reply_target:
            reply_to_display_name = reply_target.nickname or reply_target.username

    comment = Comment(
        user_id=current_user.id,
        post_id=post_id,
        content=data.content,
        parent_id=data.parent_id,
        reply_to_user_id=data.mention_user_id,
        reply_to_display_name=reply_to_display_name,
    )
    db.add(comment)
    await db.flush()
    revision = await preserve_comment(
        db, comment, lifecycle_event="created", ip_address=ip_address
    )
    await record(
        db,
        user_id=current_user.id,
        event_type="comment_created",
        ip_address=ip_address,
        target_type="comment",
        target_id=comment.id,
        revision_id=revision.id,
        snapshot={"content": comment.content, "post_id": str(comment.post_id)},
    )
    await db.commit()

    # 연관 유저 정보 로딩
    res = await db.execute(
        select(Comment)
        .options(selectinload(Comment.user), selectinload(Comment.reply_to_user))
        .where(Comment.id == comment.id)
    )
    created_comment = res.scalar_one()

    # 게시물 정보 및 작성자 알림
    post_obj_res = await db.execute(select(Post).where(Post.id == post_id))
    post_obj = post_obj_res.scalar_one_or_none()
    if post_obj:
        from app.modules.notifications.models import NotificationType
        from app.modules.notifications.service import create_notification

        # 댓글 작성 알림
        await create_notification(
            db,
            recipient_id=post_obj.user_id,
            sender_id=current_user.id,
            type=NotificationType.COMMENT.value,
            message=f"{current_user.nickname or current_user.username}님이 댓글을 남겼습니다: {data.content}",
            post_id=post_id,
            comment_id=str(comment.id),
        )

        # @멘션 언급 알림
        import re
        mentioned_usernames = set(re.findall(r"@([a-zA-Z0-9_]+)", data.content))
        if mentioned_usernames:
            users_res = await db.execute(
                select(User).where(User.username.in_(mentioned_usernames))
            )
            for mentioned_user in users_res.scalars().all():
                if mentioned_user.id != post_obj.user_id:  # 작성자 중복 알림 방지
                    await create_notification(
                        db,
                        recipient_id=mentioned_user.id,
                        sender_id=current_user.id,
                        type=NotificationType.MENTION.value,
                        message=f"{current_user.nickname or current_user.username}님이 댓글에서 회원님을 언급했습니다.",
                        post_id=post_id,
                        comment_id=str(comment.id),
                    )

    if data.mention_user_id and data.mention_user_id != current_user.id:
        mentioned_user = (
            await db.execute(select(User).where(User.id == data.mention_user_id))
        ).scalar_one_or_none()
        if mentioned_user:
            from app.modules.notifications.models import NotificationType
            from app.modules.notifications.service import create_notification

            await create_notification(
                db,
                recipient_id=mentioned_user.id,
                sender_id=current_user.id,
                type=NotificationType.MENTION.value,
                message=f"{current_user.nickname or current_user.username}님이 댓글에서 회원님을 언급했습니다.",
                post_id=post_id,
                comment_id=str(comment.id),
            )

    if should_anonymize_user(
        post_obj.board_type if post_obj else None,
        created_comment.user.is_admin,
    ):
        user_summary = PostUserSummary(
            id=uuid.UUID(int=0),
            username="익명",
            full_name="익명 사용자",
            profile_image_url=None,
        )
    else:
        user_summary = PostUserSummary(
            id=created_comment.user.id,
            username=created_comment.user.username,
            nickname=created_comment.user.nickname,
            full_name=created_comment.user.full_name,
            profile_image_url=created_comment.user.profile_image_url,
            is_admin=created_comment.user.is_admin,
        )
    reply_to_user_summary = None
    if created_comment.reply_to_user:
        if should_anonymize_user(
            post_obj.board_type if post_obj else None,
            created_comment.reply_to_user.is_admin,
        ):
            reply_to_user_summary = PostUserSummary(
                id=uuid.UUID(int=0),
                username="익명",
                full_name="익명 사용자",
                profile_image_url=None,
            )
        else:
            reply_to_user_summary = PostUserSummary(
                id=created_comment.reply_to_user.id,
                username=created_comment.reply_to_user.username,
                nickname=created_comment.reply_to_user.nickname,
                full_name=created_comment.reply_to_user.full_name,
                profile_image_url=created_comment.reply_to_user.profile_image_url,
                is_admin=created_comment.reply_to_user.is_admin,
            )

    return CommentResponse(
        id=created_comment.id,
        post_id=created_comment.post_id,
        parent_id=created_comment.parent_id,
        user=user_summary,
        reply_to_user=reply_to_user_summary,
        reply_to_display_name=created_comment.reply_to_display_name,
        content=created_comment.content,
        created_at=created_comment.created_at,
        updated_at=created_comment.updated_at,
        likes_count=0,
        is_liked=False,
        is_mine=True,
        replies_count=0,
        replies=[],
    )


async def get_post_comments(
    db: AsyncSession,
    post_id: uuid.UUID,
    current_user: Optional[User] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[CommentResponse]:
    """특정 게시물의 무제한 깊이 대댓글 트리를 생성일 순으로 조회합니다."""
    post_res = await db.execute(
        select(Post)
        .options(selectinload(Post.user))
        .where(Post.id == post_id)
    )
    post_obj = post_res.scalar_one_or_none()
    if not post_obj:
        raise NotFoundException("Post")
    if not await _can_view_post(db, post_obj, current_user):
        raise NotFoundException("Post")
    is_anon = post_obj.board_type == "anonymous"

    # 게시물의 모든 댓글 조회
    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.user),
            selectinload(Comment.likes),
        )
        .where(
            Comment.post_id == post_id,
            True if current_user and current_user.is_admin else Comment.moderation_hidden.is_(False),
            True
            if not current_user or current_user.is_admin
            else ~exists(
                select(HiddenContent.id).where(
                    HiddenContent.user_id == current_user.id,
                    HiddenContent.target_type == "comment",
                    HiddenContent.target_id == Comment.id,
                )
            ),
        )
        .order_by(Comment.created_at.asc())
    )
    all_comments = result.scalars().all()

    # parent_id 별로 맵핑 (UUID -> str 변환으로 안전하게 매칭)
    replies_by_parent: dict[str, List[Comment]] = {}
    top_level_comments: List[Comment] = []

    for c in all_comments:
        if c.parent_id is None:
            top_level_comments.append(c)
        else:
            pid_str = str(c.parent_id)
            if pid_str not in replies_by_parent:
                replies_by_parent[pid_str] = []
            replies_by_parent[pid_str].append(c)

    viewer_id = current_user.id if current_user else None

    def _build_tree(c: Comment) -> CommentResponse:
        cid_str = str(c.id)
        child_comments = replies_by_parent.get(cid_str, [])
        child_responses = [_build_tree(child) for child in child_comments]
        viewer_liked = any(lk.user_id == viewer_id for lk in c.likes) if viewer_id else False
        is_mine = current_user is not None and (
            current_user.is_admin or c.user_id == current_user.id
        )

        if should_anonymize_user(post_obj.board_type, c.user.is_admin):
            c_user = PostUserSummary(
                id=uuid.UUID(int=0),
                username="익명",
                full_name="익명 사용자",
                profile_image_url=None,
            )
        else:
            c_user = PostUserSummary(
                id=c.user.id,
                username=c.user.username,
                nickname=c.user.nickname,
                full_name=c.user.full_name,
                profile_image_url=c.user.profile_image_url,
                is_admin=c.user.is_admin,
            )

        return CommentResponse(
            id=c.id,
            post_id=c.post_id,
            parent_id=c.parent_id,
            user=c_user,
            reply_to_user=(
                PostUserSummary(
                    id=(
                        uuid.UUID(int=0)
                        if should_anonymize_user(
                            post_obj.board_type, c.reply_to_user.is_admin
                        )
                        else c.reply_to_user.id
                    ),
                    username=(
                        "익명"
                        if should_anonymize_user(
                            post_obj.board_type, c.reply_to_user.is_admin
                        )
                        else c.reply_to_user.username
                    ),
                    nickname=(
                        "익명"
                        if should_anonymize_user(
                            post_obj.board_type, c.reply_to_user.is_admin
                        )
                        else c.reply_to_user.nickname
                    ),
                    full_name=(
                        "익명 사용자"
                        if should_anonymize_user(
                            post_obj.board_type, c.reply_to_user.is_admin
                        )
                        else c.reply_to_user.full_name
                    ),
                    profile_image_url=(
                        None
                        if should_anonymize_user(
                            post_obj.board_type, c.reply_to_user.is_admin
                        )
                        else c.reply_to_user.profile_image_url
                    ),
                    is_admin=c.reply_to_user.is_admin,
                )
                if c.reply_to_user
                else None
            ),
            reply_to_display_name=(
                "익명"
                if (
                    post_obj.board_type == "anonymous"
                    and c.reply_to_display_name
                    and (
                        not c.reply_to_user
                        or not c.reply_to_user.is_admin
                    )
                )
                else c.reply_to_display_name
            ),
            content=c.content,
            created_at=c.created_at,
            updated_at=c.updated_at,
            likes_count=len(c.likes),
            is_liked=viewer_liked,
            is_mine=is_mine,
            replies_count=len(child_responses),
            replies=child_responses,
        )

    # 페이지네이션 (최상위 댓글 기준)
    paginated_top_level = top_level_comments[offset : offset + limit]
    return [_build_tree(c) for c in paginated_top_level]


async def toggle_comment_like(
    db: AsyncSession,
    comment_id: uuid.UUID,
    current_user: User,
) -> CommentLikeToggleResponse:
    """댓글 좋아요를 토글(추가 / 취소)합니다."""
    comment_res = await db.execute(
        select(Comment)
        .options(selectinload(Comment.likes))
        .where(Comment.id == comment_id)
    )
    comment = comment_res.scalar_one_or_none()
    if not comment:
        raise NotFoundException("Comment")

    existing = next((lk for lk in comment.likes if lk.user_id == current_user.id), None)
    if existing:
        await db.delete(existing)
        await db.commit()
        is_liked = False
        likes_count = len(comment.likes) - 1
    else:
        new_like = CommentLike(user_id=current_user.id, comment_id=comment_id)
        db.add(new_like)
        await db.commit()
        is_liked = True
        likes_count = len(comment.likes) + 1

    return CommentLikeToggleResponse(
        comment_id=comment_id,
        is_liked=is_liked,
        likes_count=max(0, likes_count),
    )


async def update_comment(
    db: AsyncSession,
    comment_id: uuid.UUID,
    current_user: User,
    data: CommentUpdateRequest,
    ip_address: str | None = None,
) -> CommentResponse:
    """댓글을 수정합니다."""
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.user))
        .where(Comment.id == comment_id)
        .with_for_update()
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise NotFoundException("Comment")

    if comment.user_id != current_user.id and not current_user.is_admin:
        raise ForbiddenException("댓글 작성자만 수정할 수 있습니다.")

    comment.content = data.content
    await db.flush()
    revision = await preserve_comment(
        db, comment, lifecycle_event="updated", ip_address=ip_address
    )
    await record(
        db,
        user_id=current_user.id,
        event_type="comment_updated",
        ip_address=ip_address,
        target_type="comment",
        target_id=comment.id,
        revision_id=revision.id,
        snapshot={"content": comment.content, "post_id": str(comment.post_id)},
    )
    await db.commit()
    await db.refresh(comment)

    post_res = await db.execute(select(Post.board_type).where(Post.id == comment.post_id))
    board_type = post_res.scalar_one_or_none()
    is_anon = board_type == "anonymous"

    if should_anonymize_user(board_type, comment.user.is_admin):
        user_summary = PostUserSummary(
            id=uuid.UUID(int=0),
            username="익명",
            full_name="익명 사용자",
            profile_image_url=None,
        )
    else:
        user_summary = PostUserSummary(
            id=comment.user.id,
            username=comment.user.username,
            nickname=comment.user.nickname,
            full_name=comment.user.full_name,
            profile_image_url=comment.user.profile_image_url,
            is_admin=comment.user.is_admin,
        )

    return CommentResponse(
        id=comment.id,
        post_id=comment.post_id,
        parent_id=comment.parent_id,
        user=user_summary,
        reply_to_user=(
            PostUserSummary(
                id=comment.reply_to_user.id,
                username=comment.reply_to_user.username,
                nickname=comment.reply_to_user.nickname,
                full_name=comment.reply_to_user.full_name,
                profile_image_url=comment.reply_to_user.profile_image_url,
                is_admin=comment.reply_to_user.is_admin,
            )
            if comment.reply_to_user
            else None
        ),
        reply_to_display_name=comment.reply_to_display_name,
        content=comment.content,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        is_mine=True,
    )


async def delete_comment(
    db: AsyncSession,
    comment_id: uuid.UUID,
    current_user: User,
    ip_address: str | None = None,
) -> None:
    """댓글을 삭제합니다 (댓글 작성자 또는 게시물 작성자만 삭제 가능)."""
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.post))
        .where(Comment.id == comment_id)
        .with_for_update()
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise NotFoundException("Comment")

    if (
        comment.user_id != current_user.id
        and comment.post.user_id != current_user.id
        and not current_user.is_admin
    ):
        raise ForbiddenException("You can only delete your own comments or comments on your post")

    revisions = await preserve_comment_tree_for_deletion(
        db, comment, ip_address=ip_address
    )
    root_revision = next(
        revision for revision in revisions if revision.comment_id == comment.id
    )
    await record(
        db,
        user_id=comment.user_id,
        event_type="comment_deleted",
        ip_address=ip_address,
        target_type="comment",
        target_id=comment.id,
        revision_id=root_revision.id,
        snapshot={
            "content": comment.content,
            "post_id": str(comment.post_id),
            "deleted_by": str(current_user.id),
            "deleted_by_admin": current_user.is_admin and current_user.id != comment.user_id,
        },
    )
    await db.delete(comment)
    await db.commit()


# ─── BOOKMARKS SERVICE ───────────────────────────────────────────────────────


async def toggle_bookmark_post(
    db: AsyncSession,
    post_id: uuid.UUID,
    current_user: User,
) -> PostBookmarkToggleResponse:
    """게시물 북마크(저장)를 토글(추가 / 취소)합니다."""
    post_res = await db.execute(select(Post.id).where(Post.id == post_id))
    if not post_res.scalar_one_or_none():
        raise NotFoundException("Post")

    bm_res = await db.execute(
        select(PostBookmark).where(
            PostBookmark.post_id == post_id, PostBookmark.user_id == current_user.id
        )
    )
    existing_bm = bm_res.scalar_one_or_none()

    if existing_bm:
        await db.delete(existing_bm)
        await db.commit()
        is_bookmarked = False
    else:
        new_bm = PostBookmark(user_id=current_user.id, post_id=post_id)
        db.add(new_bm)
        await db.commit()
        is_bookmarked = True

    return PostBookmarkToggleResponse(post_id=post_id, is_bookmarked=is_bookmarked)


async def get_saved_posts(
    db: AsyncSession,
    current_user: User,
    limit: int = 20,
    offset: int = 0,
) -> tuple[List[PostResponse], int]:
    """현재 로그인한 사용자가 저장(북마크)한 게시물 목록을 최신 저장순으로 조회합니다."""
    visibility_clause = _post_visibility_clause(current_user)
    count_res = await db.execute(
        select(func.count(PostBookmark.id))
        .join(Post, Post.id == PostBookmark.post_id)
        .join(User, Post.user_id == User.id)
        .where(PostBookmark.user_id == current_user.id, visibility_clause)
    )
    total = count_res.scalar() or 0

    result = await db.execute(
        select(Post)
        .join(PostBookmark, Post.id == PostBookmark.post_id)
        .join(User, Post.user_id == User.id)
        .options(selectinload(Post.user), selectinload(Post.media))
        .where(PostBookmark.user_id == current_user.id, visibility_clause)
        .order_by(PostBookmark.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    posts = result.scalars().all()

    items = await _build_post_responses_batch(db, list(posts), current_user=current_user)
    return items, total


async def get_explore_posts(
    db: AsyncSession,
    current_user: Optional[User] = None,
    limit: int = 30,
    offset: int = 0,
) -> tuple[List[PostResponse], int]:
    """전체 사용자의 게시물을 최신순으로 조회하여 탐색(Explore) 피드에 제공합니다."""
    visibility_clause = _post_visibility_clause(current_user)
    count_res = await db.execute(
        select(func.count(Post.id))
        .join(User, Post.user_id == User.id)
        .where(visibility_clause)
    )
    total = count_res.scalar() or 0

    result = await db.execute(
        select(Post)
        .join(User, Post.user_id == User.id)
        .options(selectinload(Post.user), selectinload(Post.media))
        .where(visibility_clause)
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    posts = result.scalars().all()

    items = await _build_post_responses_batch(db, list(posts), current_user=current_user)
    return items, total


async def toggle_repost_post(
    db: AsyncSession,
    post_id: uuid.UUID,
    current_user: User,
) -> PostRepostToggleResponse:
    """게시물 리포스트를 토글(추가 / 취소)합니다."""
    post_res = await db.execute(select(Post.id).where(Post.id == post_id))
    if not post_res.scalar_one_or_none():
        raise NotFoundException("Post")

    repost_res = await db.execute(
        select(PostRepost).where(
            PostRepost.post_id == post_id, PostRepost.user_id == current_user.id
        )
    )
    existing_repost = repost_res.scalar_one_or_none()

    if existing_repost:
        await db.delete(existing_repost)
        await db.commit()
        is_reposted = False
    else:
        new_repost = PostRepost(user_id=current_user.id, post_id=post_id)
        db.add(new_repost)
        await db.commit()
        is_reposted = True

    count_res = await db.execute(
        select(func.count(PostRepost.id)).where(PostRepost.post_id == post_id)
    )
    reposts_count = count_res.scalar() or 0

    return PostRepostToggleResponse(
        post_id=post_id, is_reposted=is_reposted, reposts_count=reposts_count
    )


async def get_reposted_posts(
    db: AsyncSession,
    current_user: User,
    limit: int = 20,
    offset: int = 0,
) -> tuple[List[PostResponse], int]:
    """현재 로그인한 사용자가 리포스트한 게시물 목록을 최신 리포스트순으로 조회합니다."""
    visibility_clause = _post_visibility_clause(current_user)
    count_res = await db.execute(
        select(func.count(PostRepost.id))
        .join(Post, Post.id == PostRepost.post_id)
        .join(User, Post.user_id == User.id)
        .where(PostRepost.user_id == current_user.id, visibility_clause)
    )
    total = count_res.scalar() or 0

    result = await db.execute(
        select(Post)
        .join(PostRepost, Post.id == PostRepost.post_id)
        .join(User, Post.user_id == User.id)
        .options(selectinload(Post.user), selectinload(Post.media))
        .where(PostRepost.user_id == current_user.id, visibility_clause)
        .order_by(PostRepost.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    posts = result.scalars().all()

    items = await _build_post_responses_batch(db, list(posts), current_user=current_user)
    return items, total


async def get_user_reposted_posts(
    db: AsyncSession,
    username: str,
    current_user: Optional[User] = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[List[PostResponse], int]:
    """특정 사용자가 리포스트한 게시물 목록을 최신 리포스트순으로 조회합니다."""
    user_res = await db.execute(select(User.id).where(User.username == username))
    target_user_id = user_res.scalar_one_or_none()
    if not target_user_id:
        raise NotFoundException("User")

    visibility_clause = _post_visibility_clause(current_user)
    count_res = await db.execute(
        select(func.count(PostRepost.id))
        .join(Post, Post.id == PostRepost.post_id)
        .join(User, Post.user_id == User.id)
        .where(PostRepost.user_id == target_user_id, visibility_clause)
    )
    total = count_res.scalar() or 0

    result = await db.execute(
        select(Post)
        .join(PostRepost, Post.id == PostRepost.post_id)
        .join(User, Post.user_id == User.id)
        .options(selectinload(Post.user), selectinload(Post.media))
        .where(PostRepost.user_id == target_user_id, visibility_clause)
        .order_by(PostRepost.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    posts = result.scalars().all()

    items = await _build_post_responses_batch(db, list(posts), current_user=current_user)
    return items, total
