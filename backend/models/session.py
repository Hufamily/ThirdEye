"""
Session model for learning sessions
Matches BACKEND_INTEGRATION_GUIDE.md specification
"""

from sqlalchemy import Column, String, Integer, Boolean, Text, ForeignKey
from snowflake.sqlalchemy import VARIANT, TIMESTAMP_NTZ
from sqlalchemy.sql import func
from utils.database import Base


class Session(Base):
    """Session model for learning sessions"""
    
    __tablename__ = "SESSIONS"
    __table_args__ = {"schema": "PUBLIC"}
    
    session_id = Column("SESSION_ID", String(36), primary_key=True)
    user_id = Column("USER_ID", String(36), ForeignKey("PUBLIC.USERS.USER_ID"), nullable=False)
    doc_id = Column("DOC_ID", String(500))  # Google Doc ID or URL
    doc_title = Column("DOC_TITLE", String(500))
    doc_type = Column("DOC_TYPE", String(50))  # 'google-doc' | 'github' | 'notion' | 'confluence' | 'other'
    title = Column("TITLE", String(500))
    started_at = Column("STARTED_AT", TIMESTAMP_NTZ, nullable=False)
    ended_at = Column("ENDED_AT", TIMESTAMP_NTZ)
    duration_seconds = Column("DURATION_SECONDS", Integer)
    concepts_count = Column("CONCEPTS_COUNT", Integer, default=0)
    triggers = Column("TRIGGERS", VARIANT)  # JSON array: ['scroll', 'hover', 'click']
    gap_labels = Column("GAP_LABELS", VARIANT)  # JSON array: ['hooks', 'performance']
    is_complete = Column("IS_COMPLETE", Boolean, default=False)
    summary = Column("SUMMARY", Text)
    session_metadata = Column("METADATA", VARIANT)  # Additional JSON metadata
    created_at = Column("CREATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp())
    updated_at = Column("UPDATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp(), onupdate=func.current_timestamp())
    
    def to_dict(self):
        """Convert session to dictionary matching API response format"""
        from datetime import datetime
        
        # Format date and time from started_at
        date_str = self.started_at.strftime("%Y-%m-%d") if self.started_at else None
        time_str = self.started_at.strftime("%H:%M") if self.started_at else None
        
        # Format duration
        duration_str = None
        if self.duration_seconds:
            hours = self.duration_seconds // 3600
            minutes = (self.duration_seconds % 3600) // 60
            if hours > 0:
                duration_str = f"{hours}h {minutes}m"
            else:
                duration_str = f"{minutes}m"
        
        return {
            "id": self.session_id,
            "date": date_str,
            "time": time_str,
            "duration": duration_str,
            "concepts": self.concepts_count or 0,
            "title": self.title or "",
            "docTitle": self.doc_title or "",
            "triggers": self.triggers if isinstance(self.triggers, list) else [],
            "gapLabels": self.gap_labels if isinstance(self.gap_labels, list) else [],
            "isComplete": self.is_complete
        }
