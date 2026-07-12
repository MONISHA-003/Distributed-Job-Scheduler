import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import BatchStatus
from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class DeadLetterEntry(Base, UUIDPKMixin):
    """
    Snapshot of a job that exhausted its retry budget. We snapshot the
    payload/handler at time of failure (rather than only pointing at
    `job_id`) so the DLQ entry remains inspectable/replayable even if the
    original job row is later purged by a retention job.
    """

    __tablename__ = "dead_letter_entries"

    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), index=True
    )
    queue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queues.id", ondelete="CASCADE"), index=True
    )
    handler: Mapped[str] = mapped_column(String(255), nullable=False)
    payload_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    total_attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    moved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    replayed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    job: Mapped["Job"] = relationship()  # noqa: F821


class BatchJob(Base, UUIDPKMixin, TimestampMixin):
    """
    Groups many Job rows created from one submission (e.g. "send 10,000
    emails"). Counters are maintained transactionally by the worker as
    each child job finishes -- see app/services/batch_service.py -- rather
    than computed with a COUNT(*) on read, so the dashboard's batch
    progress bar is O(1) to render.
    """

    __tablename__ = "batch_jobs"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[BatchStatus] = mapped_column(String(30), default=BatchStatus.PENDING, nullable=False)
    total_jobs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_jobs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_jobs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
