import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ExecutionStatus, LogLevel
from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class JobExecution(Base, UUIDPKMixin, TimestampMixin):
    """
    One row per *attempt*. Keeping attempts as separate rows (rather than
    overwriting fields on Job) preserves full retry history for the
    dashboard's job detail view and for CSV export.
    """

    __tablename__ = "job_executions"
    __table_args__ = (
        Index("ix_execution_job", "job_id", "attempt_number"),
        Index("ix_execution_worker", "worker_id"),
    )

    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), index=True
    )
    worker_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workers.id", ondelete="SET NULL"), nullable=True
    )
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[ExecutionStatus] = mapped_column(
        String(20), default=ExecutionStatus.STARTED, nullable=False
    )

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    result: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_traceback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    next_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    retry_delay_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    job: Mapped["Job"] = relationship(back_populates="executions")  # noqa: F821
    logs: Mapped[list["JobLog"]] = relationship(
        back_populates="execution", cascade="all, delete-orphan"
    )


class JobLog(Base, UUIDPKMixin):
    """
    Structured log lines emitted during job execution. Deliberately append
    only / immutable (no updated_at) since logs are a stream, not a record
    that gets edited.
    """

    __tablename__ = "job_logs"
    __table_args__ = (Index("ix_joblog_job_created", "job_id", "created_at"),)

    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), index=True
    )
    execution_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job_executions.id", ondelete="CASCADE"), nullable=True
    )
    level: Mapped[LogLevel] = mapped_column(String(10), default=LogLevel.INFO, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    execution: Mapped[Optional["JobExecution"]] = relationship(back_populates="logs")
