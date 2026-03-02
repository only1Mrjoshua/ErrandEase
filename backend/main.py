# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import uvicorn

from config import settings
from database import client  # Your existing MongoDB connection
import auth

# Create FastAPI app
app = FastAPI(title="ErrandEase API")

# CORS middleware - make sure this includes both frontend and backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL, 
        "http://localhost:5500", 
        "http://127.0.0.1:5500", 
        "https://errandease.onrender.com",
        "https://errandeasebackend.onrender.com"  # Add backend itself
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session middleware - FIXED: removed invalid 'domain' parameter
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.JWT_SECRET_KEY,
    session_cookie="errandease_session",
    max_age=3600,  # 1 hour
    same_site="lax",  # This is valid
    https_only=False,  # This is valid (called 'https_only' not 'secure')
)

# Include routers
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