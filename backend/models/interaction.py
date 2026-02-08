"""
Interaction model for Agent 5.0 Memory Vault
Stores all user interactions for spaced repetition and habit tracking
"""

from sqlalchemy import Column, String, Integer, Text, ForeignKey
from snowflake.sqlalchemy import VARIANT, TIMESTAMP_NTZ
from sqlalchemy.sql import func
from utils.database import Base


class Interaction(Base):
    """Interaction model for logging all user interactions"""
    
    __tablename__ = "INTERACTIONS"
    __table_args__ = {
        "schema": "PUBLIC",
        # Daily partitioning for Time Travel optimization
        "postgresql_partition_by": "DATE_TRUNC('DAY', CREATED_AT)"
    }
    
    interaction_id = Column("INTERACTION_ID", String(36), primary_key=True)
    user_id = Column("USER_ID", String(36), ForeignKey("PUBLIC.USERS.USER_ID"), nullable=False)
    session_id = Column("SESSION_ID", String(36), ForeignKey("PUBLIC.SESSIONS.SESSION_ID"))
    doc_id = Column("DOC_ID", String(500))
    anchor_id = Column("ANCHOR_ID", String(255))
    content = Column("CONTENT", Text)
    gap_hypothesis = Column("GAP_HYPOTHESIS", VARIANT)  # JSON: hypothesis, confidence, reasoning
    explanation_given = Column("EXPLANATION_GIVEN", VARIANT)  # JSON: instant_hud, deep_dive
    user_feedback = Column("USER_FEEDBACK", String(50))  # 'helpful' | 'not_helpful' | 'already_knew'
    reading_state = Column("READING_STATE", String(20))  # 'confused' | 'interested' | 'skimming' | 'revising'
    dwell_time_ms = Column("DWELL_TIME_MS", Integer)
    concepts = Column("CONCEPTS", VARIANT)  # JSON array
    telemetry = Column("TELEMETRY", VARIANT)  # JSON: additional metadata
    created_at = Column("CREATED_AT", TIMESTAMP_NTZ, server_default=func.current_timestamp())
