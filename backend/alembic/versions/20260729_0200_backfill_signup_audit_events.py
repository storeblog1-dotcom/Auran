"""Create visible signup logs for accounts that predate auditing."""
from alembic import op

revision = "20260729_signup_audit_backfill"
down_revision = "20260729_content_display_numbers"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("""INSERT INTO audit_events (id, user_id, event_type, target_type, target_id, created_at)
    SELECT gen_random_uuid(), u.id, 'signup', 'user', u.id::text, u.created_at
    FROM users u WHERE NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.user_id = u.id AND a.event_type = 'signup')""")

def downgrade() -> None:
    pass
