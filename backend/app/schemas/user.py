import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    full_name: str = Field(..., min_length=1, max_length=100)


class MembershipSchema(BaseModel):
    organization_id: uuid.UUID
    role: str

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    is_active: bool
    is_superuser: bool
    created_at: datetime
    memberships: list[MembershipSchema] = []

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
