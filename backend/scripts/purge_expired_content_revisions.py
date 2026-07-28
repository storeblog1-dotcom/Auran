"""Purge expired immutable content revisions unless a legal hold is active."""

import asyncio

from app.core.database import AsyncSessionLocal, engine
from app.modules.audit.content_retention import purge_expired_revisions


async def main() -> None:
    async with AsyncSessionLocal() as session:
        counts = await purge_expired_revisions(session)
    await engine.dispose()
    print(
        "Purged expired content revisions: "
        f"audit_events={counts['audit_events']}, "
        f"posts={counts['post_revisions']}, "
        f"comments={counts['comment_revisions']}"
    )


if __name__ == "__main__":
    asyncio.run(main())
