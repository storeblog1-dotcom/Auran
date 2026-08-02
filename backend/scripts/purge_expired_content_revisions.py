"""Finalize withdrawals and purge personal data after its retention deadline."""

import asyncio

from app.core.database import AsyncSessionLocal, engine
from app.modules.audit.content_retention import purge_expired_revisions
from app.modules.audit.withdrawal import process_expired_withdrawals
from app.modules.governance.service import process_expired_sanctions
from app.modules.feature_audit.service import purge_stale_throttles
from app.modules.uploads.router import delete_supabase_storage_urls


async def main() -> None:
    async with AsyncSessionLocal() as session:
        sanction_counts = await process_expired_sanctions(session)
        feature_audit_throttles = await purge_stale_throttles(session)
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
        f"reports={counts['reports']}, "
        f"finalized_accounts={withdrawal_counts['finalized_accounts']}, "
        f"purged_accounts={withdrawal_counts['purged_accounts']}, "
        f"deleted_profile_images={deleted_profile_images}"
        f", expired_sanctions={sanction_counts['expired_sanctions']}"
        f", permanent_reviews_due={len(sanction_counts['permanent_review_due_user_ids'])}"
        f", purged_feature_audit_throttles={feature_audit_throttles}"
    )


if __name__ == "__main__":
    asyncio.run(main())
