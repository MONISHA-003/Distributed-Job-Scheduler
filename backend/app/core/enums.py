"""
Enumerations shared by ORM models, Pydantic schemas, and the worker.

Kept as plain `str, Enum` subclasses (rather than native Postgres ENUM types)
so that adding a new value is a pure application-level migration -- no
`ALTER TYPE ... ADD VALUE` needed, which is notoriously awkward to run
inside a transaction on Postgres.
"""
from enum import Enum


class OrgRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class JobType(str, Enum):
    IMMEDIATE = "immediate"
    DELAYED = "delayed"
    SCHEDULED = "scheduled"
    RECURRING = "recurring"
    BATCH = "batch"


class JobStatus(str, Enum):
    QUEUED = "queued"
    SCHEDULED = "scheduled"
    CLAIMED = "claimed"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"
    DEAD_LETTER = "dead_letter"


class ExecutionStatus(str, Enum):
    STARTED = "started"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMED_OUT = "timed_out"


class RetryStrategy(str, Enum):
    FIXED = "fixed"
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    NONE = "none"


class WorkerStatus(str, Enum):
    ONLINE = "online"
    DRAINING = "draining"
    OFFLINE = "offline"


class LogLevel(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class BatchStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    COMPLETED_WITH_ERRORS = "completed_with_errors"
    FAILED = "failed"
