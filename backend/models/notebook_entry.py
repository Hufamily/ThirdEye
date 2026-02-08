"""
Notebook Entry model
Matches BACKEND_INTEGRATION_GUIDE.md specification
"""

from sqlalchemy import Column, String, Text, Date, ForeignKey
from snowflake.sqlalchemy import VARIANT, TIMESTAMP_NTZ
from sqlalchemy.sql import func
from utils.database import Base


class NotebookEntry(Base):
    """Notebook Entry model for session notes and entries"""
    
    __tablename__ = "NOTEBOOK_ENTRIES"
    __table_args__ = {"schema": "PUBLIC"}
    
    entry_id = Column("ENTRY_ID", String(36), primary_key=True)
    user_id = Column("USER_ID", String(36), ForeignKey("PUBLIC.USERS.USER_ID"), nullable=False)
    session_id = Column("SESSION_ID", String(36), ForeignKey("PUBLIC.SESSIONS.SESSION_ID"))
    title = Column("TITLE", String(500), nullable=False)
    content = Column("CONTENT", Text)  # Markdown content
    snippet = Column("SNIPPET", String(1000))
    preview = Column("PREVIEW", String(2000))
    tags = Column("TAGS", VARIANT)  # JSON array of tags
    related_entries = Column("RELATED_ENTRIES", VARIANT)  # JSON array of entry IDs
    date = Column("DATE", Date, nullable=False)
    created_at = Column("CREATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp())
    updated_at = Column("UPDATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp(), onupdate=func.current_timestamp())
    
    def to_dict(self):
        """Convert notebook entry to dictionary matching API response format"""
        return {
            "id": self.entry_id,
            "sessionId": self.session_id,
            "title": self.title,
            "date": self.date.isoformat() if self.date else None,
            "snippet": self.snippet or "",
            "preview": self.preview or ""
        }
    
    def to_detail_dict(self):
        """Convert to full detail dictionary"""
        return {
            "id": self.entry_id,
            "sessionId": self.session_id,
            "title": self.title,
            "date": self.date.isoformat() if self.date else None,
            "content": self.content or "",
            "snippet": self.snippet or "",
            "preview": self.preview or "",
            "tags": self.tags if isinstance(self.tags, list) else [],
            "relatedEntries": self.related_entries if isinstance(self.related_entries, list) else []
        }
