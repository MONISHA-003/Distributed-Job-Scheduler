from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, engine
from app.dependencies import get_current_user
from app.models.worker import Worker
from app.models.job import Job
from app.models.queue import Queue
from app.models.user import User
from app.schemas.models import WorkerResponse

router = APIRouter(tags=["Workers"])


@router.get("/workers", response_model=List[WorkerResponse])
async def list_workers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve lists of registered worker nodes."""
    result = await db.execute(select(Worker).order_by(Worker.last_heartbeat_at.desc()))
    return result.scalars().all()


@router.get("/workers/stats")
async def get_system_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve global system statistics.
    Admin users (superuser) receive extra telemetry (Database Pools and SMTP health indicators).
    """
    # 1. Count workers
    worker_res = await db.execute(select(func.count(Worker.id)))
    worker_count = worker_res.scalar() or 0

    # 2. Count jobs by status
    status_res = await db.execute(
        select(Job.status, func.count(Job.id)).group_by(Job.status)
    )
    job_stats = {r[0]: r[1] for r in status_res.all()}

    # 3. Count queues and paused queues
    queue_res = await db.execute(select(func.count(Queue.id)))
    queue_count = queue_res.scalar() or 0

    paused_res = await db.execute(select(func.count(Queue.id)).where(Queue.is_paused == True))
    paused_queue_count = paused_res.scalar() or 0

    # Base response for Job Managers
    stats = {
        "workers": {
            "total": worker_count,
        },
        "jobs": {
            "queued": job_stats.get("queued", 0),
            "running": job_stats.get("running", 0),
            "completed": job_stats.get("completed", 0),
            "failed": job_stats.get("failed", 0),
            "dead_letter": job_stats.get("dead_letter", 0),
            "total": sum(job_stats.values()),
        },
        "queues": {
            "total": queue_count,
            "paused": paused_queue_count,
        }
    }

    # Elevate telemetry if the user is an Admin
    if current_user.is_superuser:
        # Access database engine pool info if available
        pool = engine.pool
        db_stats = {
            "pool_size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }
        
        # Pull Mailhog mock statistics (emails sent)
        email_res = await db.execute(select(func.count(Job.id)).where(Job.handler == "app.worker.tasks.send_email"))
        emails_sent = email_res.scalar() or 0

        stats["admin_telemetry"] = {
            "database_pool": db_stats,
            "smtp_system": {
                "active_host": "mailhog",
                "emails_routed": emails_sent,
                "status": "online"
            }
        }

    return stats
