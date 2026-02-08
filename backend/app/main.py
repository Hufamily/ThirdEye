"""
ThirdEye Backend API
Main FastAPI application entry point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from root directory
# Get root directory (two levels up from backend/app/main.py)
root_dir = Path(__file__).parent.parent.parent
env_path = root_dir / ".env"
load_dotenv(env_path)  # Load from root .env

# Import routes
from routes import auth, personal, enterprise, extension, agents, google_auth, google_docs

app = FastAPI(
    title="ThirdEye API",
    description="Backend API for ThirdEye learning assistance platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration
# Allow frontend origin (adjust for production)
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_url,
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint - health check"""
    return {
        "status": "ok",
        "service": "ThirdEye API",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}


# Error handler for consistent error format
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler - returns consistent error format"""
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": str(exc),
                "details": {}
            }
        }
    )


# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(personal.router, prefix="/api/personal", tags=["personal"])
app.include_router(enterprise.router, prefix="/api/enterprise", tags=["enterprise"])
app.include_router(extension.router, prefix="/api/extension", tags=["extension"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(google_auth.router, prefix="/api/google-auth", tags=["google-auth"])
app.include_router(google_docs.router, prefix="/api/google-docs", tags=["google-docs"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", 8000)),
        reload=True
    )
