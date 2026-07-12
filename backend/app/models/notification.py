import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import UUIDPKMixin


class Notification(Base, UUIDPKMixin):
    __tablename__ = "notifications"

    notification_type: Mapped[str] = mapped_column(String(20), default="info", nullable=False)  # info, success, warning, error
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
