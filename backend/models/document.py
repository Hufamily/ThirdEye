"""
Document model for Google Docs and other documents
Matches BACKEND_INTEGRATION_GUIDE.md specification
"""

from sqlalchemy import Column, String, Integer, Float, Text, ForeignKey
from snowflake.sqlalchemy import VARIANT, TIMESTAMP_NTZ
from sqlalchemy.sql import func
from utils.database import Base


class Document(Base):
    """Document model for Google Docs with confusion metrics"""
    
    __tablename__ = "DOCUMENTS"
    __table_args__ = {"schema": "PUBLIC"}
    
    doc_id = Column("DOC_ID", String(500), primary_key=True)  # Google Doc file ID or URL hash
    org_id = Column("ORG_ID", String(36), ForeignKey("PUBLIC.ORGANIZATIONS.ORG_ID"))
    title = Column("TITLE", String(500), nullable=False)
    google_doc = Column("GOOGLE_DOC", VARIANT)  # JSON: fileId, url, name, folderPath, lastModified
    confusion_density = Column("CONFUSION_DENSITY", Float)
    total_triggers = Column("TOTAL_TRIGGERS", Integer, default=0)
    users_affected = Column("USERS_AFFECTED", Integer, default=0)
    content = Column("CONTENT", Text)  # Full document text (or reference to external storage)
    hotspots = Column("HOTSPOTS", VARIANT)  # JSON array of hotspot objects
    last_analyzed = Column("LAST_ANALYZED", TIMESTAMP_NTZ)
    created_at = Column("CREATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp())
    updated_at = Column("UPDATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp(), onupdate=func.current_timestamp())
    
    def to_dict(self):
        """Convert document to dictionary matching API response format"""
        google_doc_data = self.google_doc if isinstance(self.google_doc, dict) else {}
        
        return {
            "id": self.doc_id,
            "title": self.title,
            "googleDoc": {
                "fileId": google_doc_data.get("fileId", ""),
                "url": google_doc_data.get("url", ""),
                "name": google_doc_data.get("name", self.title),
                "folderPath": google_doc_data.get("folderPath", ""),
                "lastModified": google_doc_data.get("lastModified")
            },
            "confusionDensity": self.confusion_density or 0.0,
            "totalTriggers": self.total_triggers or 0,
            "usersAffected": self.users_affected or 0
        }
    
    def to_content_dict(self):
        """Convert to document content format with hotspots"""
        google_doc_data = self.google_doc if isinstance(self.google_doc, dict) else {}
        hotspots_list = self.hotspots if isinstance(self.hotspots, list) else []
        
        return {
            "id": self.doc_id,
            "title": self.title,
            "content": self.content or "",
            "googleDoc": {
                "fileId": google_doc_data.get("fileId", ""),
                "url": google_doc_data.get("url", ""),
                "name": google_doc_data.get("name", self.title),
                "folderPath": google_doc_data.get("folderPath", "")
            },
            "hotspots": hotspots_list
        }
