"""
Snowflake database connection and session management
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool
from snowflake.sqlalchemy import URL
from app.config import settings
from pathlib import Path
from dotenv import load_dotenv
import os

# Ensure root .env is loaded (config.py handles this, but ensure it's loaded here too)
root_dir = Path(__file__).parent.parent.parent
load_dotenv(root_dir / ".env")

# Create SQLAlchemy Base for models
Base = declarative_base()


def get_snowflake_url() -> str:
    """Build Snowflake connection URL"""
    return URL(
        account=settings.snowflake_account,
        user=settings.snowflake_user,
        password=settings.snowflake_password,
        warehouse=settings.snowflake_warehouse,
        database=settings.snowflake_database,
        schema=settings.snowflake_schema,
        role=settings.snowflake_role,
    )


# Create SQLAlchemy engine with connection pooling
engine = create_engine(
    get_snowflake_url(),
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,  # Verify connections before using
    echo=False,  # Set to True for SQL debugging
    connect_args={
        "connect_timeout": 60,
    }
)

# Create session factory
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False
)


def get_db():
    """
    Dependency function for FastAPI routes
    Yields a database session and closes it after use
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def ensure_warehouse_resumed():
    """
    Ensure Snowflake warehouse is resumed before queries
    Snowflake warehouses auto-suspend, so we need to resume them
    """
    try:
        with engine.connect() as conn:
            # Execute ALTER WAREHOUSE to resume (if suspended)
            # This is a no-op if already running
            from sqlalchemy import text
            conn.execute(
                text(f"ALTER WAREHOUSE {settings.snowflake_warehouse} RESUME IF SUSPENDED")
            )
            conn.commit()
    except Exception as e:
        # Log error but don't fail - warehouse might auto-resume
        print(f"Warning: Could not ensure warehouse resumed: {e}")
