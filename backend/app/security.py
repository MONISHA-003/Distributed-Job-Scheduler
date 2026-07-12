"""
Authentication (JWT) and RBAC (role-based access control) primitives.

Design choice: RBAC is enforced at the *organization* level via
`OrganizationMember.role`, and every project/queue/job permission check
walks up to that membership row rather than duplicating role columns on
each child resource. This keeps permission logic in one place and avoids
the classic bug where a project-level role and an org-level role drift out
of sync.

Role hierarchy (each role implies everything below it):
    OWNER  > ADMIN > MEMBER > VIEWER

    VIEWER  - read-only access to everything in the org
    MEMBER  - VIEWER + create/update/cancel/retry jobs, pause/resume queues
    ADMIN   - MEMBER + manage queues/projects/retry policies/workers
    OWNER   - ADMIN + manage organization membership & billing-equivalent settings
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings
from app.core.enums import OrgRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_ROLE_RANK = {
    OrgRole.VIEWER: 0,
    OrgRole.MEMBER: 1,
    OrgRole.ADMIN: 2,
    OrgRole.OWNER: 3,
}


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def role_at_least(role: OrgRole, required: OrgRole) -> bool:
    """True if `role` grants at least the privileges of `required`."""
    return _ROLE_RANK[OrgRole(role)] >= _ROLE_RANK[OrgRole(required)]


def create_access_token(subject: uuid.UUID, expires_minutes: Optional[int] = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": str(subject), "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(subject), "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc
