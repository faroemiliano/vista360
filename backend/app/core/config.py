from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import EmailStr, SecretStr, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    app_name: str = "Vista360 API"
    frontend_dist_dir: Path | None = None
    database_url: SecretStr
    cors_origins: list[str] = []
    app_env: Literal["development", "test", "production"] = "development"
    csrf_secret: SecretStr
    cookie_secure: bool = False
    auth_require_verified_email: bool = False
    session_ttl_seconds: int = Field(default=604800, ge=60, le=2592000)
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_dir: Path = BACKEND_DIR / ".data" / "assets"
    s3_endpoint_url: str | None = None
    s3_bucket: str = "vista360-private"
    s3_region: str = "auto"
    s3_access_key: SecretStr | None = None
    s3_secret_key: SecretStr | None = None
    s3_public_bucket: str | None = None
    public_media_base_url: str | None = None
    max_upload_bytes: int = Field(default=50 * 1024 * 1024, ge=1, le=50 * 1024 * 1024)
    max_image_width: int = Field(default=16384, ge=2, le=16384)
    max_image_height: int = Field(default=8192, ge=1, le=8192)
    max_image_pixels: int = Field(default=135000000, ge=2, le=135000000)
    tour_storage_quota_bytes: int = Field(default=1024**3, ge=1)
    owner_storage_quota_bytes: int = Field(default=5 * 1024**3, ge=1)
    upload_ttl_seconds: int = Field(default=600, ge=30, le=3600)
    worker_lease_seconds: int = Field(default=300, ge=180, le=3600)
    image_processing_timeout_seconds: int = Field(default=120, ge=1, le=180)
    resend_api_key: SecretStr | None = None
    service_notification_to: EmailStr | None = None
    service_notification_from: EmailStr | None = None
    public_app_url: str | None = None
    platform_admin_user_ids: list[UUID] = []
    organization_tour_limit: int = Field(default=10, ge=1, le=100000)
    organization_member_limit: int = Field(default=10, ge=1, le=10000)
    organization_storage_quota_bytes: int = Field(default=5 * 1024**3, ge=1)

    @field_validator("csrf_secret")
    @classmethod
    def validate_csrf_secret(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32 or value.get_secret_value().startswith("replace-"):
            raise ValueError("CSRF_SECRET requiere un secreto aleatorio de al menos 32 caracteres")
        return value

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, values: list[str]) -> list[str]:
        for value in values:
            url = urlsplit(value)
            if url.scheme not in ("http", "https") or not url.netloc or url.path or url.query or url.fragment or "*" in value:
                raise ValueError("CORS_ORIGINS requiere orígenes exactos sin path ni comodines")
        return values

    @model_validator(mode="after")
    def production_settings(self):
        if self.public_app_url:
            app_url = urlsplit(self.public_app_url)
            if (app_url.scheme not in ('http', 'https') or not app_url.netloc or app_url.path not in ('', '/')
                or app_url.query or app_url.fragment or app_url.username
                or (self.app_env == 'production' and app_url.scheme != 'https')):
                raise ValueError('PUBLIC_APP_URL requiere el origen público, HTTPS en producción, sin credenciales ni ruta')
        if self.public_media_base_url:
            media = urlsplit(self.public_media_base_url)
            if media.scheme != "https" or not media.netloc or media.query or media.fragment or media.username:
                raise ValueError("PUBLIC_MEDIA_BASE_URL requiere una URL HTTPS sin credenciales, query ni fragmento")
        if self.s3_public_bucket and self.s3_public_bucket == self.s3_bucket:
            raise ValueError("Los buckets privado y público deben ser distintos")
        if self.app_env == "production" and (
            not self.cookie_secure or not self.cors_origins
            or any(not origin.startswith("https://") for origin in self.cors_origins)
        ):
            raise ValueError("Producción requiere cookies Secure y orígenes HTTPS explícitos")
        if self.storage_backend == "s3" and (not self.s3_access_key or not self.s3_secret_key or not self.s3_bucket):
            raise ValueError("Storage S3 requiere bucket y credenciales configuradas")
        if self.app_env == "production" and self.storage_backend == "local":
            raise ValueError("Producción requiere storage externo; local sólo es para desarrollo")
        if self.worker_lease_seconds < self.image_processing_timeout_seconds + 120:
            raise ValueError("El lease del worker debe superar el timeout de procesamiento más 120 segundos")
        return self

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr) -> SecretStr:
        try:
            url = make_url(value.get_secret_value())
        except Exception:
            raise ValueError("DATABASE_URL debe ser una URL PostgreSQL válida") from None
        if url.drivername != "postgresql+psycopg" or not url.database:
            raise ValueError("DATABASE_URL requiere postgresql+psycopg y nombre de base")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
