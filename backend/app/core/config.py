from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App
    app_name: str = "Aura+n"
    app_env: str = "development"
    enable_perf_log: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/instagram"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # JWT
    secret_key: str = "change-this-secret-key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # AWS S3
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_s3_bucket: str = ""
    aws_region: str = "ap-northeast-2"

    # Supabase Storage
    supabase_url: str = "https://swhaukkqjsdciwpynnsy.supabase.co"
    supabase_key: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_storage_bucket: str = "uploads"

    # Expo Push Service
    expo_access_token: str = ""
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    expo_push_receipts_url: str = "https://exp.host/--/api/v2/push/getReceipts"

    # Server-only YouTube Data API v3 key for video safety verification.
    youtube_data_api_key: str = ""

    # Governance and external integrations. The bootstrap key must be supplied
    # by the deployment secret manager, never by an admin API or the database.
    integration_master_key: str = ""
    integration_key_version: str = "v1"
    content_moderation_required: bool = False
    installation_hmac_secret: str = ""
    bootstrap_admin_username: str = ""
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""
    feature_audit_initial_password: str = ""
    feature_audit_session_hours: int = 8

    # CORS
    allowed_origins: str = "*,http://localhost:3000,http://localhost:8081"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()
