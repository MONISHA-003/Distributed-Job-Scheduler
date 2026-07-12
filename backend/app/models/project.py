import uuid
from typing import List

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Project(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("organization_id", "slug", name="uq_project_org_slug"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(1000), default="", nullable=False)

    organization: Mapped["Organization"] = relationship(back_populates="projects")  # noqa: F821
    queues: Mapped[List["Queue"]] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan"
    )
