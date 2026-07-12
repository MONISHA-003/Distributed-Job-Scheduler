import uuid
from typing import List

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import OrgRole
from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class User(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    memberships: Mapped[List["OrganizationMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Organization(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)

    members: Mapped[List["OrganizationMember"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    projects: Mapped[List["Project"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )


class OrganizationMember(Base, UUIDPKMixin, TimestampMixin):
    """
    Join table encoding RBAC: a user's role is scoped to an organization and
    (by inheritance) to every project underneath it. Roles are additive in
    capability: OWNER > ADMIN > MEMBER > VIEWER (see app/security.py for the
    permission matrix).
    """

    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_user"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[OrgRole] = mapped_column(String(20), default=OrgRole.MEMBER, nullable=False)

    user: Mapped["User"] = relationship(back_populates="memberships")
    organization: Mapped["Organization"] = relationship(back_populates="members")
