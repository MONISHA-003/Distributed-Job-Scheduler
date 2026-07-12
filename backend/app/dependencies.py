import uuid

from fastapi import Depends, HTTPException, Path, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import OrgRole
from app.database import get_db
from app.models.user import OrganizationMember, User
from app.security import decode_token, role_at_least

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


from sqlalchemy.orm import selectinload

async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exc
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        raise credentials_exc

    # Eagerly load user memberships to avoid lazy loading MissingGreenlet errors
    result = await db.execute(
        select(User).options(selectinload(User.memberships)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exc
    return user


async def get_org_membership(
    organization_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganizationMember:
    if user.is_superuser:
        # Superusers act as an implicit OWNER on every org without a row.
        return OrganizationMember(
            organization_id=organization_id, user_id=user.id, role=OrgRole.OWNER
        )
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user.id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this organization")
    return membership


def require_role(required: OrgRole):
    """
    Dependency factory: `Depends(require_role(OrgRole.ADMIN))` guards a route
    so only ADMIN/OWNER members (of the org identified by the `organization_id`
    path param) may proceed.
    """

    async def _checker(
        membership: OrganizationMember = Depends(get_org_membership),
    ) -> OrganizationMember:
        if not role_at_least(membership.role, required):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Requires role '{required.value}' or higher",
            )
        return membership

    return _checker


async def _membership_for_org(
    organization_id: uuid.UUID, user: User, db: AsyncSession
) -> OrganizationMember:
    if user.is_superuser:
        return OrganizationMember(organization_id=organization_id, user_id=user.id, role=OrgRole.OWNER)
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user.id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this organization")
    return membership


def require_project_role(required: OrgRole):
    """
    Same as `require_role`, but resolves the organization from a `project_id`
    path parameter -- used by every /projects/{project_id}/... route so
    callers never have to pass organization_id redundantly.
    """
    from app.models.project import Project

    async def _checker(
        project_id: uuid.UUID = Path(...),
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> Project:
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if project is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
        membership = await _membership_for_org(project.organization_id, user, db)
        if not role_at_least(membership.role, required):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role '{required.value}' or higher")
        return project

    return _checker


def require_queue_role(required: OrgRole):
    """Resolves org via queue -> project -> organization."""
    from app.models.project import Project
    from app.models.queue import Queue

    async def _checker(
        queue_id: uuid.UUID = Path(...),
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> Queue:
        result = await db.execute(select(Queue).where(Queue.id == queue_id))
        queue = result.scalar_one_or_none()
        if queue is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Queue not found")
        proj_result = await db.execute(select(Project).where(Project.id == queue.project_id))
        project = proj_result.scalar_one_or_none()
        membership = await _membership_for_org(project.organization_id, user, db)
        if not role_at_least(membership.role, required):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role '{required.value}' or higher")
        return queue

    return _checker
