"""
Async SQLAlchemy engine and session management for FastAPI request handlers.

A separate *synchronous* engine (see app/worker/db.py) is used by the
standalone worker process and Celery tasks, since the worker's polling loop
is simpler to reason about (and to keep transactionally tight for atomic
job claiming) with psycopg2's synchronous driver.
"""
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine, expire_on_commit=False, autoflush=False
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
