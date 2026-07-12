import psycopg2
import psycopg2.extras
from app.config import settings


def get_conn():
    """
    Get a synchronous psycopg2 connection to the PostgreSQL database.
    Replaces the sqlalchemy driver prefix with a standard postgresql connection string.
    """
    conn_str = settings.DATABASE_URL_SYNC.replace("postgresql+psycopg2://", "postgresql://")
    conn = psycopg2.connect(conn_str)
    # Enable automatic dictionary results for easier column access
    conn.cursor_factory = psycopg2.extras.DictCursor
    return conn
