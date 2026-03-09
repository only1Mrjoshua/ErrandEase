from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from datetime import datetime
import logging

from config import settings
from database import users_collection
from auth import verify_token  # Reuse existing verify_token function

security = HTTPBearer()
logger = logging.getLogger(__name__)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Dependency to get current authenticated user
    Reuses existing JWT verification logic from auth.py
    """
    if users_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )
    
    token = credentials.credentials
    payload = verify_token(token)  # Reuse existing function
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    user_id = payload.get("sub")
    
    try:
        user = users_collection.find_one({"_id": ObjectId(user_id)})
    except Exception as e:
        logger.error(f"Invalid user ID format: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID"
        )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Return user info
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "customer")
    }