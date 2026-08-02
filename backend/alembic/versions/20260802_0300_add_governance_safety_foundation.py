"""add governance, safety, sanctions, and integration foundations

Revision ID: 20260802_governance_safety
Revises: 20260802_post_thumbnail
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260802_governance_safety"
down_revision = "20260802_post_thumbnail"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("admin_role", sa.String(20), nullable=False, server_default="member"))
    op.add_column("users", sa.Column("suspended_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("permanently_suspended_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("forced_deletion_due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("installation_id_hmac", sa.String(64), nullable=True))
    op.create_index("ix_users_admin_role", "users", ["admin_role"])
    op.create_index("ix_users_suspended_until", "users", ["suspended_until"])
    op.create_index("ix_users_forced_deletion_due_at", "users", ["forced_deletion_due_at"])
    op.create_index("ix_users_installation_id_hmac", "users", ["installation_id_hmac"])
    op.execute("UPDATE users SET admin_role = 'superadmin' WHERE is_admin = TRUE")

    op.add_column("posts", sa.Column("moderation_status", sa.String(24), nullable=False, server_default="published"))
    op.add_column("posts", sa.Column("moderation_reason", sa.String(500), nullable=True))
    op.add_column("posts", sa.Column("moderated_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_posts_moderation_status", "posts", ["moderation_status"])

    op.add_column("reports", sa.Column("reason_codes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.execute("UPDATE reports SET reason_codes = jsonb_build_array(reason_code) WHERE reason_codes = '[]'::jsonb")

    op.add_column("notifications", sa.Column("group_key", sa.String(180), nullable=True))
    op.add_column("notifications", sa.Column("actors", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("notifications", sa.Column("aggregate_count", sa.Integer(), nullable=False, server_default="1"))
    op.create_index("ix_notifications_group_key", "notifications", ["group_key"])

    op.create_table(
        "policy_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("policy_key", sa.String(50), nullable=False),
        sa.Column("version", sa.String(30), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_sensitive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("policy_key", "version", name="uq_policy_key_version"),
    )
    op.create_index("ix_policy_documents_policy_key", "policy_documents", ["policy_key"])
    op.create_index("ix_policy_documents_is_active", "policy_documents", ["is_active"])
    op.execute("""
        INSERT INTO policy_documents (id, policy_key, version, title, content, content_hash, is_required, is_sensitive)
        VALUES
          ('10000000-0000-4000-8000-000000000001', 'terms', '2026-08-02', '이용약관', 'Auran 서비스 이용, 이용자 책임, 금지행위, 신고·제재·이의신청 절차에 동의합니다. 만 14세 이상만 가입할 수 있습니다.', '0a6e166fa7f458f1d3a534331e526254b515429c522d6b8877dfd004ef27e0d4', TRUE, FALSE),
          ('10000000-0000-4000-8000-000000000002', 'privacy', '2026-08-02', '개인정보 수집·이용', '계정·프로필·게시물 정보와 가입 및 중요 활동 IP, 설치 식별자 HMAC을 서비스 제공·보안·분쟁 대응 목적으로 처리하며 목적별 보존기간 뒤 파기합니다. IMEI·MAC·광고 ID는 수집하지 않습니다.', '1aecfaa2d3253903b834f6831b467b2e5d15ca98fe08eafcf85bc54c9713b932', TRUE, FALSE),
          ('10000000-0000-4000-8000-000000000003', 'security_logs', '2026-08-02', '보안·부정이용 방지 기록', '가입 IP와 앱 설치 식별자 HMAC, 보안 이벤트를 부정가입·계정탈취 방지에 사용합니다. 동일 IP만으로 계정을 영구 차단하지 않습니다.', '0f9d214692c825f1cc03eb3ffe563c44ee9c3332be5bc011215a52acda10a974', TRUE, FALSE),
          ('10000000-0000-4000-8000-000000000004', 'community', '2026-08-02', '커뮤니티 운영정책', '혐오·차별·성희롱·괴롭힘·아웃팅·비동의 성적 이미지·아동 안전 침해·개인정보 노출·위협·스팸을 금지하며 신고, 콘텐츠 조치, 계정 제재와 이의신청 절차를 적용합니다.', '2c1f678daf503201a0d631620352a951d8c98f9f3e0cc4a0921f8057d48a8c54', TRUE, FALSE),
          ('10000000-0000-4000-8000-000000000005', 'sensitive_profile', '2026-08-02', '민감 프로필 정보 처리', '성적 지향 등 민감 프로필 정보는 선택 입력이며 별도 동의를 받고 기본 공개 범위를 제한합니다. 거부하거나 삭제해도 핵심 서비스 이용에는 불이익이 없습니다.', '1b6f7110a262f9040d1073f2d27453d9862bd5b16d3f7396c84ae092fe5e50ba', FALSE, TRUE)
    """)

    op.create_table(
        "user_consents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("policy_key", sa.String(50), nullable=False),
        sa.Column("version", sa.String(30), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("accepted", sa.Boolean(), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("installation_id_hmac", sa.String(64), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id", "policy_key", "version", name="uq_user_policy_version"),
    )
    op.create_index("ix_user_consents_user_id", "user_consents", ["user_id"])
    op.create_index("ix_user_consents_policy_key", "user_consents", ["policy_key"])
    op.create_index("ix_user_consents_installation_id_hmac", "user_consents", ["installation_id_hmac"])

    op.create_table(
        "moderation_checks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("posts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("categories", sa.JSON(), nullable=False),
        sa.Column("scores", sa.JSON(), nullable=False),
        sa.Column("provider_request_id", sa.String(120), nullable=True),
        sa.Column("error_code", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_moderation_checks_user_id", "moderation_checks", ["user_id"])
    op.create_index("ix_moderation_checks_post_id", "moderation_checks", ["post_id"])
    op.create_index("ix_moderation_checks_target_type", "moderation_checks", ["target_type"])
    op.create_index("ix_moderation_checks_status", "moderation_checks", ["status"])
    op.create_index("ix_moderation_checks_created_at", "moderation_checks", ["created_at"])

    op.create_table(
        "account_sanctions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sanction_type", sa.String(24), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_target_type", sa.String(20), nullable=True),
        sa.Column("source_target_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("lifted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_account_sanctions_user_id", "account_sanctions", ["user_id"])
    op.create_index("ix_account_sanctions_sanction_type", "account_sanctions", ["sanction_type"])
    op.create_index("ix_account_sanctions_ends_at", "account_sanctions", ["ends_at"])
    op.create_index("ix_account_sanctions_status", "account_sanctions", ["status"])

    op.create_table(
        "moderation_appeals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sanction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("account_sanctions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("moderation_check_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("moderation_checks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="received"),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_moderation_appeals_user_id", "moderation_appeals", ["user_id"])
    op.create_index("ix_moderation_appeals_status", "moderation_appeals", ["status"])

    op.create_table(
        "integration_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(40), nullable=False, unique=True),
        sa.Column("encrypted_secret", sa.Text(), nullable=False),
        sa.Column("nonce", sa.String(64), nullable=False),
        sa.Column("key_version", sa.String(30), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("last_four", sa.String(4), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("last_test_status", sa.String(30), nullable=True),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_integration_credentials_provider", "integration_credentials", ["provider"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_integration_credentials_provider", table_name="integration_credentials")
    op.drop_table("integration_credentials")
    op.drop_index("ix_moderation_appeals_status", table_name="moderation_appeals")
    op.drop_index("ix_moderation_appeals_user_id", table_name="moderation_appeals")
    op.drop_table("moderation_appeals")
    op.drop_index("ix_account_sanctions_status", table_name="account_sanctions")
    op.drop_index("ix_account_sanctions_ends_at", table_name="account_sanctions")
    op.drop_index("ix_account_sanctions_sanction_type", table_name="account_sanctions")
    op.drop_index("ix_account_sanctions_user_id", table_name="account_sanctions")
    op.drop_table("account_sanctions")
    op.drop_index("ix_moderation_checks_created_at", table_name="moderation_checks")
    op.drop_index("ix_moderation_checks_status", table_name="moderation_checks")
    op.drop_index("ix_moderation_checks_target_type", table_name="moderation_checks")
    op.drop_index("ix_moderation_checks_post_id", table_name="moderation_checks")
    op.drop_index("ix_moderation_checks_user_id", table_name="moderation_checks")
    op.drop_table("moderation_checks")
    op.drop_index("ix_user_consents_installation_id_hmac", table_name="user_consents")
    op.drop_index("ix_user_consents_policy_key", table_name="user_consents")
    op.drop_index("ix_user_consents_user_id", table_name="user_consents")
    op.drop_table("user_consents")
    op.drop_index("ix_policy_documents_is_active", table_name="policy_documents")
    op.drop_index("ix_policy_documents_policy_key", table_name="policy_documents")
    op.drop_table("policy_documents")
    op.drop_column("reports", "reason_codes")
    op.drop_index("ix_notifications_group_key", table_name="notifications")
    op.drop_column("notifications", "aggregate_count")
    op.drop_column("notifications", "actors")
    op.drop_column("notifications", "group_key")
    op.drop_index("ix_posts_moderation_status", table_name="posts")
    op.drop_column("posts", "moderated_at")
    op.drop_column("posts", "moderation_reason")
    op.drop_column("posts", "moderation_status")
    op.drop_index("ix_users_installation_id_hmac", table_name="users")
    op.drop_index("ix_users_forced_deletion_due_at", table_name="users")
    op.drop_index("ix_users_suspended_until", table_name="users")
    op.drop_index("ix_users_admin_role", table_name="users")
    op.drop_column("users", "installation_id_hmac")
    op.drop_column("users", "forced_deletion_due_at")
    op.drop_column("users", "permanently_suspended_at")
    op.drop_column("users", "suspended_until")
    op.drop_column("users", "admin_role")
