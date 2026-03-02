# main.py - UPDATED FIX (alias /frontend/* -> serve from frontend/)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import Response
import uvicorn
import os
import mimetypes

from config import settings
from database import client
import auth

app = FastAPI(title="ErrandEase API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "https://errandease.onrender.com",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.JWT_SECRET_KEY,
    session_cookie="errandease_session",
    max_age=3600,
    same_site="none",
    https_only=True,
)

app.include_router(auth.router)

@app.get("/")
async def root():
    return {"message": "ErrandEase API", "status": "running"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "database": "connected" if client else "disconnected"}


# ---------- STATIC PATHS ----------
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))  # ERRANDEASE root
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# ✅ 1) Alias route: /frontend/... -> maps to FRONTEND_DIR/...
@app.get("/frontend/{filepath:path}")
async def frontend_alias(filepath: str):
    full_path = os.path.normpath(os.path.join(FRONTEND_DIR, filepath))

    # basic safety: keep it inside FRONTEND_DIR
    if not full_path.startswith(os.path.normpath(FRONTEND_DIR)):
        return Response("Invalid path", status_code=400)

    if os.path.exists(full_path) and os.path.isfile(full_path):
        media_type, _ = mimetypes.guess_type(full_path)
        return FileResponse(full_path, media_type=media_type or "application/octet-stream")

    return Response("Not found", status_code=404)

# ✅ 2) Normal Render-style static: /js/... /images/... etc.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static-root")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)