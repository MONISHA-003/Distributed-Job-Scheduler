import uuid
from sqlalchemy import Boolean, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class SystemSettings(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "system_settings"

    time_zone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)
    retry_policy_default: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    slack_notifications: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    slack_webhook_url: Mapped[str] = mapped_column(String(512), nullable=True)
    log_retention_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    worker_concurrency_default: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
