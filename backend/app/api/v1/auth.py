import uuid
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import OrgRole
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import Organization, OrganizationMember, User
from app.schemas.user import UserCreate, UserResponse, TokenResponse
from app.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.services.email import send_welcome_email

router = APIRouter(tags=["Authentication"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    data: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user, create a default organization, and send a welcome email in the background.
    """
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == data.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already registered",
        )

    # Create the user
    new_user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
    )
    db.add(new_user)
    await db.flush()  # Populates new_user.id

    # Create default Organization for user
    org_slug = f"org-{str(uuid.uuid4())[:8]}"
    new_org = Organization(
        name=f"{data.full_name}'s Org",
        slug=org_slug,
    )
    db.add(new_org)
    await db.flush()  # Populates new_org.id

    # Create membership record as OWNER
    membership = OrganizationMember(
        organization_id=new_org.id,
        user_id=new_user.id,
        role=OrgRole.OWNER,
    )
    db.add(membership)

    await db.commit()

    # Dispatch welcome email in the background
    background_tasks.add_task(send_welcome_email, new_user.email, new_user.full_name)

    # Generate JWT tokens
    access_token = create_access_token(subject=new_user.id)
    refresh_token = create_refresh_token(subject=new_user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """
    OAuth2 compatible token login, retrieve access and refresh tokens.
    Expects form-data with 'username' (email) and 'password'.
    """
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account",
        )

    # Generate JWT tokens
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Retrieve current authenticated user details.
    """
    return current_user
