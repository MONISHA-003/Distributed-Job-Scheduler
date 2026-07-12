import uuid
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field

from app.core.enums import JobStatus, JobType, RetryStrategy, WorkerStatus, ExecutionStatus


# --- Project Schemas ---
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    organization_id: uuid.UUID


class ProjectResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Queue Schemas ---
class QueueCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    priority: int = Field(5, ge=1, le=10)
    concurrency_limit: int = Field(4, ge=1, le=64)
    retry_policy_id: Optional[uuid.UUID] = None


class QueueResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    priority: int = Field(validation_alias="default_priority")
    concurrency_limit: int
    is_paused: bool
    retry_policy_id: Optional[uuid.UUID] = Field(default=None, validation_alias="default_retry_policy_id")
    created_at: datetime

    class Config:
        from_attributes = True


# --- Job Schemas ---
class JobCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    job_type: JobType = JobType.IMMEDIATE
    payload: dict = Field(default_factory=dict)
    handler: str = Field(..., description="Dotted path/task name executed by the worker")
    priority: int = Field(5, ge=1, le=10)
    run_at: Optional[datetime] = None
    cron_expression: Optional[str] = None
    idempotency_key: Optional[str] = None
    timeout_seconds: int = Field(300, ge=10, le=3600)
    max_retries: int = Field(3, ge=0, le=20)
    retry_policy_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    command: Optional[str] = None
    tags: Optional[List[str]] = Field(default_factory=list)


class JobResponse(BaseModel):
    id: uuid.UUID
    queue_id: uuid.UUID
    name: str
    job_type: JobType
    status: JobStatus
    payload: dict
    handler: str
    priority: int
    run_at: Optional[datetime]
    cron_expression: Optional[str]
    idempotency_key: Optional[str]
    attempt_count: int
    max_retries: int
    claimed_by_worker_id: Optional[uuid.UUID]
    claimed_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    description: Optional[str]
    command: Optional[str]
    is_paused: bool
    tags: Optional[List[str]]

    class Config:
        from_attributes = True


# --- Worker Schemas ---
class WorkerResponse(BaseModel):
    id: uuid.UUID
    name: str
    status: WorkerStatus
    hostname: str
    pid: int
    concurrency: int
    active_jobs: int
    started_at: datetime
    last_heartbeat_at: datetime

    class Config:
        from_attributes = True


# --- Job Execution Schemas ---
class JobExecutionResponse(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    attempt_number: int
    status: ExecutionStatus
    worker_id: Optional[uuid.UUID]
    started_at: datetime
    finished_at: Optional[datetime]
    error_message: Optional[str]

    class Config:
        from_attributes = True


# --- Audit Log Schemas ---
class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    user_email: str
    action: str
    target_type: str
    target_id: Optional[uuid.UUID]
    details: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Settings Schemas ---
class SystemSettingsResponse(BaseModel):
    id: uuid.UUID
    time_zone: str
    retry_policy_default: dict
    email_notifications: bool
    slack_notifications: bool
    slack_webhook_url: Optional[str]
    log_retention_days: int
    worker_concurrency_default: int
    created_at: datetime

    class Config:
        from_attributes = True


class SystemSettingsUpdate(BaseModel):
    time_zone: Optional[str] = None
    retry_policy_default: Optional[dict] = None
    email_notifications: Optional[bool] = None
    slack_notifications: Optional[bool] = None
    slack_webhook_url: Optional[str] = None
    log_retention_days: Optional[int] = None
    worker_concurrency_default: Optional[int] = None


# --- Notification Schemas ---
class NotificationResponse(BaseModel):
    id: uuid.UUID
    notification_type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- User Schemas ---
class UserRoleUpdate(BaseModel):
    role: str  # admin, operator, viewer

