from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
import app.models  # Ensure all models are registered on Base
from app.api.v1.auth import router as auth_router
from app.api.v1.projects import router as projects_router
from app.api.v1.queues import router as queues_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.workers import router as workers_router
from app.api.v1.audit import router as audit_router
from app.api.v1.settings import router as settings_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.users import router as users_router


async def seed_default_users():
    """Seed default Admin and Job Manager credentials on startup if missing."""
    from app.models.user import User, Organization, OrganizationMember
    from app.security import hash_password
    from app.core.enums import OrgRole

    async with AsyncSessionLocal() as session:
        # Seed Admin User
        admin_email = "admin@example.com"
        res = await session.execute(select(User).where(User.email == admin_email))
        admin = res.scalar_one_or_none()
        if not admin:
            admin = User(
                email=admin_email,
                hashed_password=hash_password("adminpassword"),
                full_name="System Admin",
                is_superuser=True
            )
            session.add(admin)
            await session.flush()
            
            org = Organization(name="Admin System Org", slug="admin-org")
            session.add(org)
            await session.flush()
            
            member = OrganizationMember(
                organization_id=org.id, user_id=admin.id, role=OrgRole.OWNER
            )
            session.add(member)
            await session.commit()

        # Seed Job Manager User
        manager_email = "manager@example.com"
        res = await session.execute(select(User).where(User.email == manager_email))
        manager = res.scalar_one_or_none()
        if not manager:
            manager = User(
                email=manager_email,
                hashed_password=hash_password("managerpassword"),
                full_name="Job Manager",
                is_superuser=False
            )
            session.add(manager)
            await session.flush()
            
            org = Organization(name="Operations Org", slug="ops-org")
            session.add(org)
            await session.flush()
            
            member = OrganizationMember(
                organization_id=org.id, user_id=manager.id, role=OrgRole.OWNER
            )
            session.add(member)
            
            # Seed default project and queue
            from app.models.project import Project
            from app.models.queue import Queue
            project = Project(name="Primary Project", organization_id=org.id, slug="primary-project")
            session.add(project)
            await session.flush()
            
            queue = Queue(name="default", project_id=project.id, default_priority=5, concurrency_limit=4)
            session.add(queue)
            
            await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dynamically create PostgreSQL tables on container startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Seed default roles
    await seed_default_users()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Distributed Job Scheduler API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth")
app.include_router(projects_router, prefix="/api/v1/projects")
app.include_router(queues_router, prefix="/api/v1/queues")
app.include_router(jobs_router, prefix="/api/v1/jobs")
app.include_router(workers_router, prefix="/api/v1/workers")
app.include_router(audit_router, prefix="/api/v1/audit")
app.include_router(settings_router, prefix="/api/v1/settings")
app.include_router(notifications_router, prefix="/api/v1/notifications")
app.include_router(users_router, prefix="/api/v1/users")


@app.get("/")
async def root():
    return {
        "message": "Welcome to the Distributed Job Scheduler API",
        "environment": settings.ENVIRONMENT,
        "status": "online",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
    }
