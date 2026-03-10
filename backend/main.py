from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import uvicorn
import os
import mimetypes
import logging

from config import settings
from database import client
import auth

from routers import errands, agent_errands, agent_verification, admin_agents

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="ErrandEase API")

# CORS configuration
origins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://errandease.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Trusted hosts
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[
        "localhost",
        "127.0.0.1",
        "errandeasebackend.onrender.com",
        "errandease.onrender.com",
    ]
)

# Include routers
app.include_router(auth.router)
app.include_router(errands.router)
app.include_router(agent_errands.router)
app.include_router(agent_verification.router)  # NEW
app.include_router(admin_agents.router)  # NEW

@app.get("/")
async def root():
    return {"message": "ErrandEase API", "status": "running", "environment": settings.ENVIRONMENT}

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy", 
        "database": "connected" if client else "disconnected",
        "environment": settings.ENVIRONMENT
    }

# Create uploads directory if it doesn't exist
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
AGENT_VERIFICATION_DIR = os.path.join(UPLOAD_DIR, "agent_verification")
os.makedirs(AGENT_VERIFICATION_DIR, exist_ok=True)

# Mount uploads directory for serving files
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Static files
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

if os.path.exists(FRONTEND_DIR):
    @app.get("/frontend/{filepath:path}")
    async def frontend_alias(filepath: str):
        full_path = os.path.normpath(os.path.join(FRONTEND_DIR, filepath))

        if not full_path.startswith(os.path.normpath(FRONTEND_DIR)):
            return JSONResponse({"error": "Invalid path"}, status_code=400)

        if os.path.exists(full_path) and os.path.isfile(full_path):
            media_type, _ = mimetypes.guess_type(full_path)
            return FileResponse(full_path, media_type=media_type or "application/octet-stream")

        return JSONResponse({"error": "Not found"}, status_code=404)

    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static-root")
    logger.info(f"Serving static files from {FRONTEND_DIR}")
else:
    logger.warning(f"Frontend directory not found: {FRONTEND_DIR}")

if __name__ == "__main__":
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=settings.ENVIRONMENT != "production"
    )