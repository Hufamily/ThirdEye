"""
User model for Snowflake database
"""

from sqlalchemy import Column, String, Boolean
from snowflake.sqlalchemy import VARIANT, TIMESTAMP_NTZ
from sqlalchemy.sql import func
from utils.database import Base


class User(Base):
    """User model matching BACKEND_INTEGRATION_GUIDE.md specification"""
    
    __tablename__ = "USERS"
    __table_args__ = {"schema": "PUBLIC"}
    
    user_id = Column("USER_ID", String(36), primary_key=True)
    google_sub = Column("GOOGLE_SUB", String(255), unique=True, nullable=False)
    email = Column("EMAIL", String(255), nullable=False)
    name = Column("NAME", String(255))
    picture_url = Column("PICTURE_URL", String(500))
    account_type = Column("ACCOUNT_TYPE", String(20), nullable=False)  # 'personal' | 'enterprise'
    has_enterprise_access = Column("HAS_ENTERPRISE_ACCESS", Boolean, default=False)
    persona_card = Column("PERSONA_CARD", VARIANT)  # JSON: expertise_levels, learning_style, etc.
    created_at = Column("CREATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp())
    updated_at = Column("UPDATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp(), onupdate=func.current_timestamp())
    last_login = Column("LAST_LOGIN", TIMESTAMP_NTZ)
    
    def to_dict(self):
        """Convert user to dictionary matching API response format"""
        return {
            "id": self.user_id,
            "name": self.name,
            "email": self.email,
            "picture": self.picture_url,
            "sub": self.google_sub,
        }
