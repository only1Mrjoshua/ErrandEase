# main.py - CORRECTED VERSION
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import uvicorn

from config import settings
from database import client
import auth

app = FastAPI(title="ErrandEase API")

# CORS middleware - updated for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "https://errandease.onrender.com",
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session middleware - FIXED: removed 'domain' parameter
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.JWT_SECRET_KEY,
    session_cookie="errandease_session",
    max_age=3600,  # 1 hour
    same_site="none",  # Required for cross-origin requests
    https_only=True,   # Must be True when same_site="none" in production
    # REMOVED: domain parameter (not supported)
)

app.include_router(auth.router)

@app.get("/")
async def root():
    return {"message": "ErrandEase API", "status": "running"}

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "database": "connected" if client else "disconnected"
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )