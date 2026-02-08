"""
Snowflake database connection and session management
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool
from snowflake.sqlalchemy import URL
from app.config import settings
from pathlib import Path
from dotenv import load_dotenv
import json
import os
import time

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


def qualified_table(table_name: str) -> str:
    """
    Return a fully-qualified Snowflake table reference using config values.
    E.g. qualified_table("USERS") -> "THIRDEYE_DEV.PUBLIC.USERS"
    """
    return f"{settings.snowflake_database}.{settings.snowflake_schema}.{table_name}"


def safe_variant(value, expected_type=dict):
    """
    Safely deserialize a Snowflake VARIANT column value.
    Some driver versions return raw JSON strings instead of parsed Python objects.
    
    Args:
        value: The raw column value from Snowflake
        expected_type: dict or list — what the parsed value should be
    
    Returns:
        Parsed object of expected_type, or an empty instance if parsing fails
    """
    if value is None:
        return expected_type()
    if isinstance(value, expected_type):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, expected_type):
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
    return expected_type()


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


# Warehouse resume caching — avoid hitting Snowflake on every single request
_warehouse_last_resumed: float = 0.0
_WAREHOUSE_RESUME_TTL: float = 300.0  # 5 minutes


async def ensure_warehouse_resumed():
    """
    Ensure Snowflake warehouse is resumed before queries.
    Snowflake warehouses auto-suspend, so we need to resume them.
    Cached for 5 minutes to avoid redundant ALTER WAREHOUSE calls.
    """
    global _warehouse_last_resumed

    now = time.monotonic()
    if now - _warehouse_last_resumed < _WAREHOUSE_RESUME_TTL:
        return  # already resumed recently

    try:
        warehouse = settings.snowflake_warehouse.replace('"', '')
        with engine.connect() as conn:
            conn.execute(
                text(f'ALTER WAREHOUSE "{warehouse}" RESUME IF SUSPENDED')
            )
            conn.commit()
        _warehouse_last_resumed = now
    except Exception as e:
        # Log error but don't fail - warehouse might auto-resume
        print(f"Warning: Could not ensure warehouse resumed: {e}")
