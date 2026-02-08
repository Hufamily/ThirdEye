"""
Organization model for enterprise accounts
Matches BACKEND_INTEGRATION_GUIDE.md specification
"""

from sqlalchemy import Column, String, ForeignKey
from snowflake.sqlalchemy import VARIANT, TIMESTAMP_NTZ
from sqlalchemy.sql import func
from utils.database import Base


class Organization(Base):
    """Organization model for enterprise accounts"""
    
    __tablename__ = "ORGANIZATIONS"
    __table_args__ = {"schema": "PUBLIC"}
    
    org_id = Column("ORG_ID", String(36), primary_key=True)
    org_name = Column("ORG_NAME", String(255), nullable=False)
    admin_email = Column("ADMIN_EMAIL", String(255), nullable=False)
    admin_user_id = Column("ADMIN_USER_ID", String(36), ForeignKey("PUBLIC.USERS.USER_ID"))
    settings = Column("SETTINGS", VARIANT)  # JSON: classification_rules, privacy_policies, notification_settings
    created_at = Column("CREATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp())
    updated_at = Column("UPDATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp(), onupdate=func.current_timestamp())
    
    def to_dict(self):
        """Convert organization to dictionary matching API response format"""
        # This will be expanded when we add relationships for members and drive sources
        return {
            "orgName": self.org_name,
            "adminEmail": self.admin_email,
            "memberCount": 0,  # TODO: Calculate from members relationship
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "driveSources": [],  # TODO: Load from relationship
            "members": [],  # TODO: Load from relationship
            "metrics": {}  # TODO: Calculate metrics
        }
