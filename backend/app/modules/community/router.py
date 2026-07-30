from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.common.response import ApiResponse
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.models import User
from app.modules.community.models import CommunityBoard, CommunityNotice
from app.modules.community.schemas import BoardCreateRequest, BoardReorderRequest, BoardResponse, BoardUpdateRequest, NoticeCreateRequest, NoticeResponse, NoticeUpdateRequest

router = APIRouter(prefix="/community", tags=["Community"])


def require_admin(user: User) -> None:
    if not user.is_admin:
        raise ForbiddenException("관리자 권한이 필요합니다.")


@router.get("/boards", response_model=ApiResponse[list[BoardResponse]])
async def list_boards(include_inactive: bool = False, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    stmt = select(CommunityBoard).order_by(CommunityBoard.parent_id.nullsfirst(), CommunityBoard.sort_order, CommunityBoard.name)
    if not include_inactive or not current_user.is_admin:
        stmt = stmt.where(CommunityBoard.is_active.is_(True))
    result = await db.execute(stmt)
    return ApiResponse.ok(result.scalars().all())


@router.get("/notices", response_model=ApiResponse[list[NoticeResponse]])
async def list_notices(
    notice_type: str | None = None,
    board_id: UUID | None = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(CommunityNotice).where(CommunityNotice.is_active.is_(True)).order_by(CommunityNotice.is_global.desc(), CommunityNotice.created_at.desc())
    if notice_type == "global":
        stmt = stmt.where(CommunityNotice.is_global.is_(True))
    elif notice_type == "general":
        stmt = stmt.where(CommunityNotice.is_global.is_(False))

    result = await db.execute(stmt)
    notices = [n for n in result.scalars().all() if n.board_id is None or n.board_id == board_id]
    if notice_type == "global":
        notices = notices[:1]
    return ApiResponse.ok(notices)


@router.get("/admin/notices", response_model=ApiResponse[list[NoticeResponse]])
async def list_admin_notices(current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    require_admin(current_user)
    stmt = select(CommunityNotice).where(CommunityNotice.is_active.is_(True)).order_by(CommunityNotice.created_at.desc())
    result = await db.execute(stmt)
    return ApiResponse.ok(result.scalars().all())


@router.post("/admin/boards", response_model=ApiResponse[BoardResponse])
async def create_board(body: BoardCreateRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    require_admin(current_user)
    if body.parent_id:
        parent = (await db.execute(select(CommunityBoard).where(CommunityBoard.id == body.parent_id))).scalar_one_or_none()
        if not parent:
            raise NotFoundException("상위 게시판")
        if parent.parent_id:
            raise BadRequestException("하위 게시판은 2단계까지만 만들 수 있습니다.")
    board = CommunityBoard(**body.model_dump())
    db.add(board)
    await db.flush()
    if body.parent_id is None:
        common_slug = f"{body.slug[:64]}-common-{str(board.id).replace('-', '')[:8]}"
        db.add(
            CommunityBoard(
                name="공통",
                slug=common_slug,
                parent_id=board.id,
                is_anonymous=body.is_anonymous,
                is_default=True,
                sort_order=0,
            )
        )
    await db.commit()
    await db.refresh(board)
    return ApiResponse.ok(board)


@router.patch("/admin/boards/{board_id}", response_model=ApiResponse[BoardResponse])
async def update_board(board_id: UUID, body: BoardUpdateRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    require_admin(current_user)
    board = (await db.execute(select(CommunityBoard).where(CommunityBoard.id == board_id))).scalar_one_or_none()
    if not board:
        raise NotFoundException("게시판")
    if board.is_default and "is_active" in body.model_dump(exclude_unset=True):
        raise BadRequestException("기본 하위 게시판은 폐쇄할 수 없습니다.")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(board, key, value)
    await db.commit()
    await db.refresh(board)
    return ApiResponse.ok(board)


@router.post("/admin/boards/{board_id}/reorder", response_model=ApiResponse[list[BoardResponse]])
async def reorder_board(board_id: UUID, body: BoardReorderRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    require_admin(current_user)
    board = (await db.execute(select(CommunityBoard).where(CommunityBoard.id == board_id))).scalar_one_or_none()
    if not board:
        raise NotFoundException("게시판")
    siblings = (await db.execute(select(CommunityBoard).where(CommunityBoard.parent_id == board.parent_id).order_by(CommunityBoard.sort_order, CommunityBoard.name, CommunityBoard.created_at))).scalars().all()
    index = next((i for i, item in enumerate(siblings) if item.id == board.id), -1)
    target_index = index - 1 if body.direction == "up" else index + 1
    if index < 0 or target_index < 0 or target_index >= len(siblings):
        return ApiResponse.ok(siblings)
    siblings[index], siblings[target_index] = siblings[target_index], siblings[index]
    for position, sibling in enumerate(siblings):
        sibling.sort_order = position
    await db.commit()
    result = await db.execute(select(CommunityBoard).order_by(CommunityBoard.parent_id.nullsfirst(), CommunityBoard.sort_order, CommunityBoard.name))
    return ApiResponse.ok(result.scalars().all())


@router.delete("/admin/boards/{board_id}", response_model=ApiResponse[dict])
async def delete_board(board_id: UUID, confirm_name: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    require_admin(current_user)
    board = (await db.execute(select(CommunityBoard).where(CommunityBoard.id == board_id))).scalar_one_or_none()
    if not board:
        raise NotFoundException("게시판")
    if board.is_default:
        raise BadRequestException("기본 하위 게시판은 삭제할 수 없습니다.")
    if confirm_name != board.name:
        raise BadRequestException("삭제하려면 게시판명을 정확히 입력해야 합니다.")
    children = (await db.execute(select(CommunityBoard.id).where(CommunityBoard.parent_id == board.id))).scalars().first()
    if children:
        raise BadRequestException("하위 게시판이 있어 삭제할 수 없습니다. 먼저 폐쇄하거나 삭제하세요.")
    board.is_active = False
    await db.commit()
    return ApiResponse.ok({"message": "게시판을 폐쇄했습니다."})


@router.post("/admin/notices", response_model=ApiResponse[NoticeResponse])
async def create_notice(body: NoticeCreateRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    require_admin(current_user)
    from sqlalchemy import update
    if body.is_global:
        # Enforce max 1 active global notice: deactivate existing active global notices
        await db.execute(
            update(CommunityNotice)
            .where(CommunityNotice.is_global.is_(True), CommunityNotice.is_active.is_(True))
            .values(is_active=False)
        )
    notice = CommunityNotice(**body.model_dump())
    db.add(notice)
    await db.commit()
    await db.refresh(notice)
    return ApiResponse.ok(notice)


@router.patch("/admin/notices/{notice_id}", response_model=ApiResponse[NoticeResponse])
@router.put("/admin/notices/{notice_id}", response_model=ApiResponse[NoticeResponse])
@router.post("/admin/notices/{notice_id}", response_model=ApiResponse[NoticeResponse])
async def update_notice(notice_id: UUID, body: NoticeUpdateRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    require_admin(current_user)
    stmt = select(CommunityNotice).where(CommunityNotice.id == notice_id, CommunityNotice.is_active.is_(True))
    result = await db.execute(stmt)
    notice = result.scalar_one_or_none()
    if not notice:
        raise NotFoundException("공지사항을 찾을 수 없습니다.")

    from sqlalchemy import update
    if body.is_global is True:
        await db.execute(
            update(CommunityNotice)
            .where(CommunityNotice.is_global.is_(True), CommunityNotice.is_active.is_(True), CommunityNotice.id != notice_id)
            .values(is_active=False)
        )
        notice.is_global = True
    elif body.is_global is False:
        notice.is_global = False

    if body.title is not None:
        notice.title = body.title
    if body.content is not None:
        notice.content = body.content
    if body.board_id is not None:
        notice.board_id = body.board_id
    await db.commit()
    await db.refresh(notice)
    return ApiResponse.ok(notice)


@router.delete("/admin/notices/{notice_id}", response_model=ApiResponse[dict])
@router.post("/admin/notices/{notice_id}/delete", response_model=ApiResponse[dict])
async def delete_notice(notice_id: UUID, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    require_admin(current_user)
    stmt = select(CommunityNotice).where(CommunityNotice.id == notice_id, CommunityNotice.is_active.is_(True))
    result = await db.execute(stmt)
    notice = result.scalar_one_or_none()
    if not notice:
        raise NotFoundException("공지사항을 찾을 수 없습니다.")
    notice.is_active = False
    await db.commit()
    return ApiResponse.ok({"message": "공지사항이 성공적으로 삭제되었습니다."})
