from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.audit_log import AuditLog
from app.schemas.models import AuditLogResponse

router = APIRouter(tags=["Audit Logs"])


@router.get("", response_model=List[AuditLogResponse])
async def list_audit_logs(
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve lists of system audit logs."""
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()))
    return result.scalars().all()
