import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Boolean,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import JobStatus, JobType
from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Job(Base, UUIDPKMixin, TimestampMixin):
    """
    Central work-item entity. A single table backs immediate, delayed,
    scheduled, recurring (child instances), and batch jobs -- distinguished
    by `job_type` -- rather than per-type tables, so the worker's claim
    query and the dashboard's job explorer stay simple (one table to scan,
    one set of indexes to reason about). Recurring jobs are *templates*
    living in `scheduled_jobs`; each firing inserts one Job row here with
    job_type=recurring and scheduled_job_id set.

    `run_at` is the single field the claim query filters on for delayed /
    scheduled / recurring jobs: NULL run_at means "eligible immediately".
    """

    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint(
            "queue_id", "idempotency_key", name="uq_job_queue_idempotency_key"
        ),
        # Core claim index: workers scan for QUEUED/SCHEDULED jobs in a queue,
        # ordered by priority then age, filtered by run_at <= now().
        Index("ix_jobs_claim", "queue_id", "status", "priority", "run_at"),
        Index("ix_jobs_batch", "batch_id"),
        Index("ix_jobs_status_created", "status", "created_at"),
    )

    queue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queues.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    job_type: Mapped[JobType] = mapped_column(String(20), default=JobType.IMMEDIATE, nullable=False)
    status: Mapped[JobStatus] = mapped_column(
        String(20), default=JobStatus.QUEUED, nullable=False, index=True
    )

    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    handler: Mapped[str] = mapped_column(
        String(255), nullable=False, doc="Dotted path/task name executed by the worker"
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    command: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tags: Mapped[Optional[list]] = mapped_column(JSONB, default=list, nullable=True)

    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False, doc="1=highest,10=lowest")
    run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, doc="Not eligible for claim before this time"
    )
    cron_expression: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    timeout_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)

    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    retry_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("retry_policies.id", ondelete="SET NULL"), nullable=True
    )

    # Atomic-claim bookkeeping
    claimed_by_worker_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workers.id", ondelete="SET NULL"), nullable=True
    )
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    lock_token: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, doc="Unique token proving the claim, guards against stale renewals"
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batch_jobs.id", ondelete="CASCADE"), nullable=True
    )
    scheduled_job_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scheduled_jobs.id", ondelete="SET NULL"), nullable=True
    )

    created_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    queue: Mapped["Queue"] = relationship(back_populates="jobs")  # noqa: F821
    executions: Mapped[List["JobExecution"]] = relationship(
        back_populates="job", cascade="all, delete-orphan", order_by="JobExecution.attempt_number"
    )
