from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Meta(BaseModel):
    total: int | None = None
    next_cursor: str | None = None
    has_more: bool = False


class ApiResponse(BaseModel, Generic[T]):
    """표준 API 응답 포맷: { data, meta, error }"""
    data: T | None = None
    meta: Meta = Meta()
    error: dict | None = None

    @classmethod
    def ok(cls, data: T, meta: Meta | None = None) -> "ApiResponse[T]":
        return cls(data=data, meta=meta or Meta())

    @classmethod
    def paginated(
        cls,
        data: T,
        total: int | None = None,
        next_cursor: str | None = None,
        has_more: bool = False,
    ) -> "ApiResponse[T]":
        return cls(
            data=data,
            meta=Meta(total=total, next_cursor=next_cursor, has_more=has_more),
        )
