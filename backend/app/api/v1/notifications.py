from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.notification import Notification
from app.schemas.models import NotificationResponse

router = APIRouter(tags=["Notifications"])


@router.get("", response_model=List[NotificationResponse])
async def list_notifications(
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve list of system notifications."""
    result = await db.execute(select(Notification).order_by(Notification.created_at.desc()))
    return result.scalars().all()


@router.put("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a notification as read."""
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    await db.commit()
    await db.refresh(notif)
    return notif


@router.post("", response_model=NotificationResponse)
async def create_notification(
    notification_type: str,
    title: str,
    message: str,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a new mock system notification."""
    notif = Notification(
        notification_type=notification_type,
        title=title,
        message=message
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)
    return notif
