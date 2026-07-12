from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.settings import SystemSettings
from app.models.audit_log import AuditLog
from app.schemas.models import SystemSettingsResponse, SystemSettingsUpdate

router = APIRouter(tags=["Settings"])


@router.get("", response_model=SystemSettingsResponse)
async def get_system_settings(
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve global system settings. Auto-creates defaults if none exist."""
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = SystemSettings()
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.put("", response_model=SystemSettingsResponse)
async def update_system_settings(
    data: SystemSettingsUpdate,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update global system settings."""
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = SystemSettings()
        db.add(settings)
        await db.flush()

    if data.time_zone is not None:
        settings.time_zone = data.time_zone
    if data.retry_policy_default is not None:
        settings.retry_policy_default = data.retry_policy_default
    if data.email_notifications is not None:
        settings.email_notifications = data.email_notifications
    if data.slack_notifications is not None:
        settings.slack_notifications = data.slack_notifications
    if data.slack_webhook_url is not None:
        settings.slack_webhook_url = data.slack_webhook_url
    if data.log_retention_days is not None:
        settings.log_retention_days = data.log_retention_days
    if data.worker_concurrency_default is not None:
        settings.worker_concurrency_default = data.worker_concurrency_default

    # Log action to audit history
    audit = AuditLog(
        user_id=current_user.id,
        user_email=current_user.email,
        action="edit",
        target_type="settings",
        target_id=settings.id,
        details="Updated system configurations and policies."
    )
    db.add(audit)

    await db.commit()
    await db.refresh(settings)
    return settings
