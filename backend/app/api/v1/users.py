from typing import List, Any
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User, OrganizationMember
from app.models.audit_log import AuditLog
from app.core.enums import OrgRole

router = APIRouter(tags=["User Management"])


@router.get("")
async def list_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin only: list all users in the system."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires System Admin rights"
        )
    
    result = await db.execute(
        select(User).options(selectinload(User.memberships)).order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    
    # Format response neatly
    response = []
    for u in users:
        role = "viewer"
        if u.is_superuser:
            role = "admin"
        elif u.memberships:
            # check highest role
            roles = [m.role for m in u.memberships]
            if OrgRole.OWNER in roles or OrgRole.ADMIN in roles:
                role = "operator"
            else:
                role = "viewer"

        response.append({
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "is_active": u.is_active,
            "is_superuser": u.is_superuser,
            "role": role,  # admin, operator, viewer
            "created_at": u.created_at
        })
    return response


@router.put("/{user_id}/role")
async def update_user_role(
    user_id: uuid.UUID,
    role: str,  # admin, operator, viewer
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin only: modify user system role."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires System Admin rights"
        )
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if role == "admin":
        user.is_superuser = True
    elif role == "operator":
        user.is_superuser = False
        # Ensure they have organization member role elevated
        mem_res = await db.execute(select(OrganizationMember).where(OrganizationMember.user_id == user.id))
        member = mem_res.scalar_one_or_none()
        if member:
            member.role = OrgRole.ADMIN
    else:  # viewer
        user.is_superuser = False
        mem_res = await db.execute(select(OrganizationMember).where(OrganizationMember.user_id == user.id))
        member = mem_res.scalar_one_or_none()
        if member:
            member.role = OrgRole.VIEWER

    # Log action to audit history
    audit = AuditLog(
        user_id=current_user.id,
        user_email=current_user.email,
        action="edit",
        target_type="user",
        target_id=user.id,
        details=f"Modified role of user {user.email} to '{role}'"
    )
    db.add(audit)

    await db.commit()
    return {"message": "User role updated successfully"}
