from uuid import UUID
from pydantic import BaseModel, ConfigDict


class HashtagResponse(BaseModel):
    id: UUID
    name: str
    posts_count: int = 0

    model_config = ConfigDict(from_attributes=True)
