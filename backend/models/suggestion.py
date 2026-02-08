"""
Suggestion model for AI suggestions
Matches BACKEND_INTEGRATION_GUIDE.md specification
"""

from sqlalchemy import Column, String, Text, Float, ForeignKey
from snowflake.sqlalchemy import VARIANT, TIMESTAMP_NTZ
from sqlalchemy.sql import func
from utils.database import Base


class Suggestion(Base):
    """Suggestion model for AI suggestions with hotspots"""
    
    __tablename__ = "SUGGESTIONS"
    __table_args__ = {"schema": "PUBLIC"}
    
    suggestion_id = Column("SUGGESTION_ID", String(36), primary_key=True)
    doc_id = Column("DOC_ID", String(500), ForeignKey("PUBLIC.DOCUMENTS.DOC_ID"), nullable=False)
    org_id = Column("ORG_ID", String(36), ForeignKey("PUBLIC.ORGANIZATIONS.ORG_ID"))
    hotspot_id = Column("HOTSPOT_ID", String(36))
    original_text = Column("ORIGINAL_TEXT", Text, nullable=False)
    suggested_text = Column("SUGGESTED_TEXT", Text, nullable=False)
    confidence = Column("CONFIDENCE", Float)
    reasoning = Column("REASONING", Text)
    confusion_type = Column("CONFUSION_TYPE", String(50))  # 'concept' | 'terminology' | 'application'
    diagnosis = Column("DIAGNOSIS", Text)
    actions = Column("ACTIONS", VARIANT)  # JSON array of action strings
    google_doc_range = Column("GOOGLE_DOC_RANGE", VARIANT)  # JSON: {startIndex, endIndex}
    status = Column("STATUS", String(20), default="pending")  # 'pending' | 'accepted' | 'rejected' | 'applied'
    applied_at = Column("APPLIED_AT", TIMESTAMP_NTZ)
    applied_by = Column("APPLIED_BY", String(36))
    created_at = Column("CREATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp())
    updated_at = Column("UPDATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp(), onupdate=func.current_timestamp())
    
    def to_dict(self):
        """Convert suggestion to dictionary matching API response format"""
        google_doc_data = {}  # TODO: Load from document relationship
        google_doc_range = self.google_doc_range if isinstance(self.google_doc_range, dict) else {}
        
        return {
            "id": self.suggestion_id,
            "documentId": self.doc_id,
            "googleDoc": {
                "fileId": google_doc_data.get("fileId", ""),
                "url": google_doc_data.get("url", ""),
                "name": google_doc_data.get("name", "")
            },
            "hotspotId": self.hotspot_id,
            "originalText": self.original_text,
            "suggestedText": self.suggested_text,
            "confidence": self.confidence or 0.0,
            "reasoning": self.reasoning or "",
            "googleDocRange": {
                "startIndex": google_doc_range.get("startIndex", 0),
                "endIndex": google_doc_range.get("endIndex", 0)
            }
        }
    
    def to_enterprise_dict(self):
        """Convert to enterprise suggestions format"""
        return {
            "id": self.suggestion_id,
            "document": "",  # TODO: Load document title
            "section": "",  # TODO: Extract from hotspot
            "confusionType": self.confusion_type or "concept",
            "confidence": self.confidence or 0.0,
            "diagnosis": self.diagnosis or "",
            "actions": self.actions if isinstance(self.actions, list) else []
        }
