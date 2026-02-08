"""
Base Agent Class
All agents inherit from this base class
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from datetime import datetime


class BaseAgent(ABC):
    """
    Base class for all ThirdEye agents
    Provides common functionality and interface
    """
    
    def __init__(self, agent_id: str, agent_name: str, agent_version: str):
        """
        Initialize base agent
        
        Args:
            agent_id: Unique identifier (e.g., "0.0", "3.0")
            agent_name: Human-readable name
            agent_version: Version string
        """
        self.agent_id = agent_id
        self.agent_name = agent_name
        self.agent_version = agent_version
        self.created_at = datetime.now()
    
    @abstractmethod
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process input and return output
        Must be implemented by each agent
        
        Args:
            input_data: Input data dictionary
            
        Returns:
            Output data dictionary
        """
        pass
    
    def validate_input(self, input_data: Dict[str, Any], required_fields: list) -> bool:
        """
        Validate input data has required fields
        
        Args:
            input_data: Input data to validate
            required_fields: List of required field names
            
        Returns:
            True if valid, raises ValueError if not
        """
        missing = [field for field in required_fields if field not in input_data]
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(missing)}")
        return True
    
    def create_response(self, success: bool, data: Any = None, error: Optional[str] = None) -> Dict[str, Any]:
        """
        Create standardized response format
        
        Args:
            success: Whether operation succeeded
            data: Response data
            error: Error message if failed
            
        Returns:
            Standardized response dictionary
        """
        response = {
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "agent_version": self.agent_version,
            "success": success,
            "timestamp": datetime.now().isoformat(),
        }
        
        if success:
            response["data"] = data
        else:
            response["error"] = error
            
        return response
    
    def __repr__(self):
        return f"<{self.__class__.__name__}(id={self.agent_id}, name={self.agent_name})>"
