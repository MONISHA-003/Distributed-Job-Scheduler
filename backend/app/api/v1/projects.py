from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, _membership_for_org
from app.models.project import Project
from app.models.user import User
from app.schemas.models import ProjectCreate, ProjectResponse

router = APIRouter(tags=["Projects"])


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all projects in the organizations the user belongs to."""
    org_ids = [m.organization_id for m in current_user.memberships]
    if not org_ids:
        return []
    
    result = await db.execute(
        select(Project).where(Project.organization_id.in_(org_ids))
    )
    return result.scalars().all()


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new project scoped to an organization the user belongs to."""
    # Validate membership
    await _membership_for_org(data.organization_id, current_user, db)

    import re
    slug = re.sub(r'[^a-z0-9]+', '-', data.name.lower()).strip('-')
    if not slug:
        slug = str(uuid.uuid4())[:8]
    # Add random suffix to ensure organization scope uniqueness
    slug = f"{slug}-{str(uuid.uuid4())[:6]}"

    project = Project(
        name=data.name,
        organization_id=data.organization_id,
        slug=slug,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get project details."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check permissions
    await _membership_for_org(project.organization_id, current_user, db)
    return project
