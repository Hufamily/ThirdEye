"""
Configuration settings for ThirdEye backend
Loads from environment variables with sensible defaults
"""

from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path

# Calculate root .env file path at module level (not in class)
_config_file_path = Path(__file__).resolve()
_root_env_path = _config_file_path.parent.parent.parent / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Snowflake Configuration
    snowflake_account: str
    snowflake_user: str
    snowflake_password: str
    snowflake_warehouse: str = "COMPUTE_WH"
    snowflake_database: str = "THIRDEYE_DEV"
    snowflake_schema: str = "PUBLIC"
    snowflake_role: Optional[str] = "PUBLIC"
    
    # JWT Authentication
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    
    # Google OAuth
    google_client_id: str
    google_client_secret: str
    
    # AI Services
    dedalus_api_key: str
    dedalus_api_url: str = "https://api.dedaluslabs.ai"
    
    k2_api_key: str
    k2_base_url: str = "https://api.kimi-k2.ai"
    k2_model: str = "kimi/k2-think"
    
    # Gemini API (for LLM operations)
    gemini_api_key: Optional[str] = None
    
    # ElevenLabs TTS
    elevenlabs_api_key: Optional[str] = None
    elevenlabs_voice_id: Optional[str] = None
    
    # Server Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_base_url: str = "http://localhost:8000/api"
    
    # Environment
    environment: str = "development"
    
    # Frontend URL for CORS
    frontend_url: str = "http://localhost:5173"
    
    class Config:
        # Point to root .env file (calculated at module level above)
        env_file = str(_root_env_path)
        case_sensitive = False
        extra = "ignore"  # Ignore extra fields from .env (like VITE_* vars for frontend)


# Global settings instance
settings = Settings()
