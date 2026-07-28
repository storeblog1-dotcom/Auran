"""Finalize withdrawals and purge personal data after its retention deadline."""

import asyncio

from app.core.database import AsyncSessionLocal, engine
from app.modules.audit.content_retention import purge_expired_revisions
from app.modules.audit.withdrawal import process_expired_withdrawals
from app.modules.uploads.router import delete_supabase_storage_urls


async def main() -> None:
    async with AsyncSessionLocal() as session:
        withdrawal_counts = await process_expired_withdrawals(session)
        counts = await purge_expired_revisions(session)
    deleted_profile_images = await delete_supabase_storage_urls(
        withdrawal_counts["profile_urls"]
    )
    await engine.dispose()
    print(
        "Purged expired content revisions: "
        f"audit_events={counts['audit_events']}, "
        f"posts={counts['post_revisions']}, "
        f"comments={counts['comment_revisions']}, "
        f"finalized_accounts={withdrawal_counts['finalized_accounts']}, "
        f"purged_accounts={withdrawal_counts['purged_accounts']}, "
        f"deleted_profile_images={deleted_profile_images}"
    )


if __name__ == "__main__":
    asyncio.run(main())
