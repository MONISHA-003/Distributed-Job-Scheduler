"""
Centralized application configuration.

All runtime configuration is sourced from environment variables (see
`.env.example` at the repo root). Using pydantic-settings gives us type
validation and a single object to inject wherever config is needed, instead
of scattering `os.environ.get(...)` calls across the codebase.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- General -----------------------------------------------------
    APP_NAME: str = "Distributed Job Scheduler"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # --- Database ------------------------------------------------------
    DATABASE_URL: str = (
        "postgresql+asyncpg://scheduler:scheduler@postgres:5432/scheduler"
    )
    # Synchronous URL used by Alembic migrations and Celery worker (psycopg2)
    DATABASE_URL_SYNC: str = (
        "postgresql+psycopg2://scheduler:scheduler@postgres:5432/scheduler"
    )
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    # --- Redis / Celery --------------------------------------------------
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    # --- Auth ------------------------------------------------------------
    JWT_SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- Worker ------------------------------------------------------------
    WORKER_POLL_INTERVAL_SECONDS: float = 1.0
    WORKER_HEARTBEAT_INTERVAL_SECONDS: float = 5.0
    WORKER_HEARTBEAT_TIMEOUT_SECONDS: int = 20
    WORKER_DEFAULT_CONCURRENCY: int = 4
    WORKER_SHUTDOWN_GRACE_SECONDS: int = 30

    # --- Email / notifications ------------------------------------------
    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "scheduler@example.com"
    SMTP_USE_TLS: bool = False
    NOTIFY_ON_FAILURE: bool = True
    NOTIFY_ON_RETRY: bool = False

    # --- CORS --------------------------------------------------------------
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
