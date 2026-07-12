from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import OrgRole
from app.database import get_db
from app.dependencies import require_project_role, require_queue_role
from app.models.project import Project
from app.models.queue import Queue
from app.schemas.models import QueueCreate, QueueResponse

router = APIRouter(tags=["Queues"])


@router.get("/projects/{project_id}/queues", response_model=List[QueueResponse])
async def list_project_queues(
    project: Project = Depends(require_project_role(OrgRole.VIEWER)),
    db: AsyncSession = Depends(get_db),
):
    """List all queues under a specific project."""
    result = await db.execute(select(Queue).where(Queue.project_id == project.id))
    return result.scalars().all()


@router.post("/projects/{project_id}/queues", response_model=QueueResponse, status_code=status.HTTP_201_CREATED)
async def create_project_queue(
    data: QueueCreate,
    project: Project = Depends(require_project_role(OrgRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new job queue for a project."""
    # Ensure queue name is unique within this project
    existing = await db.execute(
        select(Queue).where(Queue.project_id == project.id, Queue.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Queue '{data.name}' already exists in this project",
        )

    queue = Queue(
        project_id=project.id,
        name=data.name,
        default_priority=data.priority,
        concurrency_limit=data.concurrency_limit,
        default_retry_policy_id=data.retry_policy_id,
    )
    db.add(queue)
    await db.commit()
    await db.refresh(queue)
    return queue


@router.get("/queues/{queue_id}", response_model=QueueResponse)
async def get_queue(
    queue: Queue = Depends(require_queue_role(OrgRole.VIEWER)),
):
    """Get single queue details."""
    return queue


@router.post("/queues/{queue_id}/pause", response_model=QueueResponse)
async def pause_queue(
    queue: Queue = Depends(require_queue_role(OrgRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """Pause a queue so workers stop claiming new jobs from it."""
    queue.is_paused = True
    await db.commit()
    await db.refresh(queue)
    return queue


@router.post("/queues/{queue_id}/resume", response_model=QueueResponse)
async def resume_queue(
    queue: Queue = Depends(require_queue_role(OrgRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused queue."""
    queue.is_paused = False
    await db.commit()
    await db.refresh(queue)
    return queue
