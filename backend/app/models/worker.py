import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import WorkerStatus
from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Worker(Base, UUIDPKMixin, TimestampMixin):
    """
    A worker process registers itself here on startup and is expected to
    send heartbeats every WORKER_HEARTBEAT_INTERVAL_SECONDS. A worker whose
    `last_heartbeat_at` is older than WORKER_HEARTBEAT_TIMEOUT_SECONDS is
    considered dead by the reaper service, which requeues its claimed jobs.
    """

    __tablename__ = "workers"
    __table_args__ = (Index("ix_worker_status_heartbeat", "status", "last_heartbeat_at"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True,
        doc="Optional: scope a worker to a single project; NULL = polls all projects it can see",
    )
    status: Mapped[WorkerStatus] = mapped_column(
        String(20), default=WorkerStatus.ONLINE, nullable=False
    )
    concurrency: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    current_job_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_heartbeat_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stopped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    heartbeats: Mapped[List["WorkerHeartbeat"]] = relationship(
        back_populates="worker", cascade="all, delete-orphan"
    )


class WorkerHeartbeat(Base, UUIDPKMixin):
    """
    Time-series of heartbeats, kept separately from `Worker` (whose row is
    updated in place for O(1) liveness checks) so the dashboard can chart
    load over time without contending on the hot Worker row.
    """

    __tablename__ = "worker_heartbeats"
    __table_args__ = (Index("ix_heartbeat_worker_time", "worker_id", "created_at"),)

    worker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workers.id", ondelete="CASCADE"), index=True
    )
    active_job_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    worker: Mapped["Worker"] = relationship(back_populates="heartbeats")
