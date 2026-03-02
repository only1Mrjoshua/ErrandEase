# main.py - UPDATED (keeps /frontend/ paths working on Render)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
import uvicorn
import os

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

# Session middleware
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.JWT_SECRET_KEY,
    session_cookie="errandease_session",
    max_age=3600,      # 1 hour
    same_site="none",  # Required for cross-origin requests
    https_only=True,   # Must be True when same_site="none" in production
)

# API routes
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

# ✅ Serve your frontend in TWO ways (Render + Localhost paths)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))  # ERRANDEASE root
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# 1) Localhost-style alias: /frontend/js/...  (NO html fallback here)
app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR), name="static-frontend")

# 2) Render-style root: /js/... plus html fallback
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static-root")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )