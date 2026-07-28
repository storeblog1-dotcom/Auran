"""Backfill persistent nicknames for legacy users."""

import re

from alembic import op
import sqlalchemy as sa


revision = "20260728_nickname_backfill"
down_revision = "20260726_anonymous_categories"
branch_labels = None
depends_on = None
AUTO_PREFIX = "\uc544\uc6b0\ub77c"


def upgrade() -> None:
    bind = op.get_bind()
    nicknames = bind.execute(
        sa.text("SELECT nickname FROM users WHERE nickname IS NOT NULL")
    ).scalars().all()
    used = {value.strip().lower() for value in nicknames if value and value.strip()}
    pattern = re.compile(rf"{re.escape(AUTO_PREFIX)}(\d+)")
    highest = max(
        (int(match.group(1)) for value in used if (match := pattern.fullmatch(value))),
        default=0,
    )

    legacy_users = bind.execute(
        sa.text(
            "SELECT id FROM users "
            "WHERE nickname IS NULL OR btrim(nickname) = '' "
            "ORDER BY created_at ASC, id ASC"
        )
    ).mappings().all()

    for user in legacy_users:
        highest += 1
        nickname = f"{AUTO_PREFIX}{highest:05d}"
        while nickname.lower() in used:
            highest += 1
            nickname = f"{AUTO_PREFIX}{highest:05d}"
        bind.execute(
            sa.text("UPDATE users SET nickname = :nickname WHERE id = :id"),
            {"nickname": nickname, "id": user["id"]},
        )
        used.add(nickname.lower())


def downgrade() -> None:
    # Generated nicknames remain so a downgrade never removes public identities.
    pass
