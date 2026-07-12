import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import RetryStrategy
from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class RetryPolicy(Base, UUIDPKMixin, TimestampMixin):
    """
    A reusable retry configuration. Queues have a default retry policy;
    individual jobs may override it. Delay math lives in
    app/services/retry_policy.py to keep the model a plain data holder.
    """

    __tablename__ = "retry_policies"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    strategy: Mapped[RetryStrategy] = mapped_column(
        String(20), default=RetryStrategy.EXPONENTIAL, nullable=False
    )
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    base_delay_seconds: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    multiplier: Mapped[float] = mapped_column(Float, default=2.0, nullable=False)
    max_delay_seconds: Mapped[float] = mapped_column(Float, default=3600.0, nullable=False)
    jitter: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
