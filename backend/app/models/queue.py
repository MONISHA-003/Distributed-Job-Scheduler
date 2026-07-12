import uuid
from typing import List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Queue(Base, UUIDPKMixin, TimestampMixin):
    """
    A queue groups jobs that share concurrency and ordering semantics.
    `concurrency_limit` bounds how many jobs from THIS queue may be
    RUNNING at once across the whole worker fleet -- enforced in the
    atomic claim query (see app/worker/claim.py), not merely in-process.
    """

    __tablename__ = "queues"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_queue_project_name"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), default="", nullable=False)

    default_priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    concurrency_limit: Mapped[int] = mapped_column(Integer, default=10, nullable=False)

    is_paused: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    default_retry_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("retry_policies.id", ondelete="SET NULL"), nullable=True
    )
    default_timeout_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="queues")  # noqa: F821
    jobs: Mapped[List["Job"]] = relationship(  # noqa: F821
        back_populates="queue", cascade="all, delete-orphan"
    )
    default_retry_policy: Mapped[Optional["RetryPolicy"]] = relationship()  # noqa: F821
