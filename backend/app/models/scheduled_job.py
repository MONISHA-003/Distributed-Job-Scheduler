import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class ScheduledJob(Base, UUIDPKMixin, TimestampMixin):
    """
    A cron *template*. `app.services.scheduler_service` runs on a periodic
    Celery beat tick, scans for rows where `next_run_at <= now()` and
    `is_paused = false`, materializes a concrete `Job` row (job_type=
    recurring, scheduled_job_id=this row), and advances `next_run_at`
    using croniter. Splitting template from instance keeps the Job table's
    claim index free of untriggered future work.
    """

    __tablename__ = "scheduled_jobs"
    __table_args__ = (Index("ix_scheduled_next_run", "next_run_at", "is_paused"),)

    queue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queues.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    handler: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    cron_expression: Mapped[str] = mapped_column(String(120), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)

    is_paused: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    retry_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("retry_policies.id", ondelete="SET NULL"), nullable=True
    )

    queue: Mapped["Queue"] = relationship()  # noqa: F821
