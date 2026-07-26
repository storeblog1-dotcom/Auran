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
from app.modules.community.schemas import BoardCreateRequest, BoardResponse, BoardUpdateRequest, NoticeCreateRequest, NoticeResponse

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
async def list_notices(board_id: UUID | None = None, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    stmt = select(CommunityNotice).where(CommunityNotice.is_active.is_(True)).order_by(CommunityNotice.created_at.desc())
    result = await db.execute(stmt)
    notices = [n for n in result.scalars().all() if n.board_id is None or n.board_id == board_id]
    return ApiResponse.ok(notices)


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
    await db.commit()
    await db.refresh(board)
    return ApiResponse.ok(board)


@router.patch("/admin/boards/{board_id}", response_model=ApiResponse[BoardResponse])
async def update_board(board_id: UUID, body: BoardUpdateRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    require_admin(current_user)
    board = (await db.execute(select(CommunityBoard).where(CommunityBoard.id == board_id))).scalar_one_or_none()
    if not board:
        raise NotFoundException("게시판")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(board, key, value)
    await db.commit()
    await db.refresh(board)
    return ApiResponse.ok(board)


@router.delete("/admin/boards/{board_id}", response_model=ApiResponse[dict])
async def delete_board(board_id: UUID, confirm_name: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    require_admin(current_user)
    board = (await db.execute(select(CommunityBoard).where(CommunityBoard.id == board_id))).scalar_one_or_none()
    if not board:
        raise NotFoundException("게시판")
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
    notice = CommunityNotice(**body.model_dump())
    db.add(notice)
    await db.commit()
    await db.refresh(notice)
    return ApiResponse.ok(notice)
