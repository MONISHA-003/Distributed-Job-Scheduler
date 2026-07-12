from typing import List, Optional
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.enums import OrgRole, JobStatus, JobType
from app.database import get_db
from app.dependencies import require_queue_role, get_current_user, _membership_for_org
from app.models.job import Job
from app.models.job_execution import JobExecution, JobLog
from app.models.queue import Queue
from app.models.dead_letter import BatchJob
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.schemas.models import JobCreate, JobResponse, JobExecutionResponse

router = APIRouter(tags=["Jobs"])
logger = structlog.get_logger()


@router.post("/queues/{queue_id}/jobs", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    data: JobCreate,
    queue: Queue = Depends(require_queue_role(OrgRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """Submit a single job to the queue (Immediate, Delayed, or Scheduled)."""
    # If run_at is not provided and it's delayed/scheduled, raise error
    if data.job_type in (JobType.DELAYED, JobType.SCHEDULED) and not data.run_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="run_at timestamp is required for delayed or scheduled jobs"
        )
    
    # Check idempotency
    if data.idempotency_key:
        stmt = select(Job).where(
            Job.queue_id == queue.id,
            Job.idempotency_key == data.idempotency_key
        )
        existing = await db.execute(stmt)
        existing_job = existing.scalar_one_or_none()
        if existing_job:
            logger.info("Idempotent job submission ignored", key=data.idempotency_key)
            return existing_job

    job = Job(
        queue_id=queue.id,
        name=data.name,
        job_type=data.job_type,
        status=JobStatus.QUEUED,
        payload=data.payload,
        handler=data.handler,
        priority=data.priority,
        run_at=data.run_at,
        cron_expression=data.cron_expression,
        idempotency_key=data.idempotency_key,
        timeout_seconds=data.timeout_seconds,
        max_retries=data.max_retries,
        retry_policy_id=data.retry_policy_id,
        description=data.description,
        command=data.command,
        tags=data.tags,
    )

    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/queues/{queue_id}/batches", response_model=List[JobResponse], status_code=status.HTTP_201_CREATED)
async def create_batch_jobs(
    batch_name: str,
    job_templates: List[JobCreate],
    queue: Queue = Depends(require_queue_role(OrgRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a batch of jobs. Creates a parent BatchJob record 
    and inserts all child jobs linked via batch_id.
    """
    if not job_templates:
        raise HTTPException(status_code=400, detail="Batch must contain at least 1 job template")

    # Create BatchJob parent
    batch_job = BatchJob(
        project_id=queue.project_id,
        name=batch_name,
        total_jobs=len(job_templates),
    )
    db.add(batch_job)
    await db.flush()

    jobs = []
    for template in job_templates:
        job = Job(
            queue_id=queue.id,
            name=template.name,
            job_type=JobType.BATCH,
            status=JobStatus.QUEUED,
            payload=template.payload,
            handler=template.handler,
            priority=template.priority,
            run_at=template.run_at,
            max_retries=template.max_retries,
            batch_id=batch_job.id,
        )
        db.add(job)
        jobs.append(job)

    await db.commit()
    
    # Refresh jobs
    for j in jobs:
        await db.refresh(j)
    return jobs


@router.get("/queues/{queue_id}/jobs", response_model=List[JobResponse])
async def list_queue_jobs(
    queue: Queue = Depends(require_queue_role(OrgRole.VIEWER)),
    db: AsyncSession = Depends(get_db),
):
    """List jobs currently in the queue."""
    result = await db.execute(select(Job).where(Job.queue_id == queue.id).order_by(Job.created_at.desc()))
    return result.scalars().all()


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job_details(
    job_id: uuid.UUID,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve job details and check permissions."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get associated queue and project to verify org membership
    q_result = await db.execute(select(Queue).where(Queue.id == job.queue_id))
    queue = q_result.scalar_one()
    
    from app.models.project import Project
    p_result = await db.execute(select(Project).where(Project.id == queue.project_id))
    project = p_result.scalar_one()
    
    await _membership_for_org(project.organization_id, current_user, db)
    return job


@router.post("/jobs/{job_id}/retry", response_model=JobResponse)
async def retry_failed_job(
    job_id: uuid.UUID,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually requeue/retry a failed or cancelled job."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    q_result = await db.execute(select(Queue).where(Queue.id == job.queue_id))
    queue = q_result.scalar_one()
    
    from app.models.project import Project
    p_result = await db.execute(select(Project).where(Project.id == queue.project_id))
    project = p_result.scalar_one()
    
    await _membership_for_org(project.organization_id, current_user, db)

    if job.status not in (JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.DEAD_LETTER):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only failed or cancelled jobs can be retried. Current status is '{job.status}'."
        )

    # Requeue job
    job.status = JobStatus.QUEUED
    job.attempt_count = 0
    job.run_at = None
    job.completed_at = None
    job.started_at = None
    job.claimed_by_worker_id = None
    
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/jobs/{job_id}/executions", response_model=List[JobExecutionResponse])
async def list_job_executions(
    job_id: uuid.UUID,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List execution attempts for a job."""
    result = await db.execute(select(JobExecution).where(JobExecution.job_id == job_id).order_by(JobExecution.attempt_number.asc()))
    return result.scalars().all()


@router.get("/jobs/{job_id}/logs")
async def get_job_logs(
    job_id: uuid.UUID,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve raw logs captured during the job execution."""
    result = await db.execute(select(JobLog).where(JobLog.job_id == job_id).order_by(JobLog.created_at.asc()))
    logs = result.scalars().all()
    return [{"timestamp": log.created_at, "level": log.level, "message": log.message} for log in logs]


@router.put("/jobs/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: uuid.UUID,
    data: JobCreate,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit job details."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.name = data.name
    job.job_type = data.job_type
    job.payload = data.payload
    job.handler = data.handler
    job.priority = data.priority
    job.run_at = data.run_at
    job.cron_expression = data.cron_expression
    job.timeout_seconds = data.timeout_seconds
    job.max_retries = data.max_retries
    job.retry_policy_id = data.retry_policy_id
    job.description = data.description
    job.command = data.command
    job.tags = data.tags

    # Audit Logging
    audit = AuditLog(
        user_id=current_user.id,
        user_email=current_user.email,
        action="edit",
        target_type="job",
        target_id=job.id,
        details=f"Updated job configurations for job '{job.name}'"
    )
    db.add(audit)
    
    await db.commit()
    await db.refresh(job)
    return job


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: uuid.UUID,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a job."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Audit Logging
    audit = AuditLog(
        user_id=current_user.id,
        user_email=current_user.email,
        action="delete",
        target_type="job",
        target_id=job.id,
        details=f"Deleted job '{job.name}'"
    )
    db.add(audit)

    await db.delete(job)
    await db.commit()
    return None


@router.post("/jobs/{job_id}/run", response_model=JobResponse)
async def run_job_now(
    job_id: uuid.UUID,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run a scheduled or queued job immediately."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = JobStatus.QUEUED
    job.run_at = None  # Eligible immediately
    job.attempt_count = 0

    # Audit Logging
    audit = AuditLog(
        user_id=current_user.id,
        user_email=current_user.email,
        action="run_now",
        target_type="job",
        target_id=job.id,
        details=f"Forced immediate execution ('Run Now') for job '{job.name}'"
    )
    db.add(audit)

    # Notification Trigger
    notif = Notification(
        notification_type="info",
        title="Immediate Job Triggered",
        message=f"Job '{job.name}' was manually triggered to run now by {current_user.email}."
    )
    db.add(notif)

    await db.commit()
    await db.refresh(job)
    return job


@router.post("/jobs/{job_id}/duplicate", response_model=JobResponse)
async def duplicate_job(
    job_id: uuid.UUID,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate a job template."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    new_job = Job(
        queue_id=job.queue_id,
        name=f"{job.name} (Copy)",
        job_type=job.job_type,
        status=JobStatus.QUEUED,
        payload=job.payload,
        handler=job.handler,
        priority=job.priority,
        run_at=job.run_at,
        cron_expression=job.cron_expression,
        idempotency_key=None,
        timeout_seconds=job.timeout_seconds,
        max_retries=job.max_retries,
        retry_policy_id=job.retry_policy_id,
        description=job.description,
        command=job.command,
        tags=job.tags,
    )
    db.add(new_job)
    await db.flush()

    # Audit Logging
    audit = AuditLog(
        user_id=current_user.id,
        user_email=current_user.email,
        action="duplicate",
        target_type="job",
        target_id=new_job.id,
        details=f"Duplicated job '{job.name}' to copy '{new_job.name}'"
    )
    db.add(audit)

    await db.commit()
    await db.refresh(new_job)
    return new_job


@router.post("/jobs/{job_id}/pause", response_model=JobResponse)
async def pause_job(
    job_id: uuid.UUID,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pause a recurring/scheduled job."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.is_paused = True

    # Audit Logging
    audit = AuditLog(
        user_id=current_user.id,
        user_email=current_user.email,
        action="pause",
        target_type="job",
        target_id=job.id,
        details=f"Paused execution for recurring job '{job.name}'"
    )
    db.add(audit)

    await db.commit()
    await db.refresh(job)
    return job


@router.post("/jobs/{job_id}/resume", response_model=JobResponse)
async def resume_job(
    job_id: uuid.UUID,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resume execution of a paused recurring/scheduled job."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.is_paused = False

    # Audit Logging
    audit = AuditLog(
        user_id=current_user.id,
        user_email=current_user.email,
        action="resume",
        target_type="job",
        target_id=job.id,
        details=f"Resumed execution for recurring job '{job.name}'"
    )
    db.add(audit)

    await db.commit()
    await db.refresh(job)
    return job

