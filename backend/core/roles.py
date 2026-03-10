from fastapi import Depends, HTTPException, status
from functools import wraps
from typing import Callable, Optional
import logging

from core.security import get_current_user
from database import agent_profiles_collection

logger = logging.getLogger(__name__)

def require_role(required_role: str):
    """
    Dependency factory to require a specific role
    Usage: Depends(require_role("agent"))
    """
    async def role_dependency(current_user: dict = Depends(get_current_user)):
        if current_user["role"] != required_role:
            logger.warning(
                f"Role access denied: user {current_user['id']} with role "
                f"{current_user['role']} attempted to access {required_role} endpoint"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This endpoint requires {required_role} role"
            )
        return current_user
    return role_dependency

# Specific role dependencies
require_agent = require_role("agent")
require_customer = require_role("customer")
require_admin = require_role("admin")

# NEW: Verified agent dependency
async def require_verified_agent(current_user: dict = Depends(require_agent)):
    """
    Dependency that requires the agent to be verified (approved)
    Used for protecting agent errand endpoints
    """
    # Get agent profile
    profile = agent_profiles_collection.find_one({"user_id": current_user["id"]})
    
    if not profile:
        logger.warning(f"Agent profile not found for user: {current_user['id']}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent profile not found. Please complete verification."
        )
    
    if profile.get("verification_status") != "approved":
        logger.warning(f"Unverified agent attempted access: {current_user['id']}, status: {profile.get('verification_status')}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not yet verified. Please wait for admin approval."
        )
    
    return current_user

def require_self_or_admin(resource_user_id: str):
    """
    Dependency to check if user is accessing their own resource or is admin
    Usage: Depends(require_self_or_admin(some_user_id))
    """
    async def dependency(current_user: dict = Depends(get_current_user)):
        if current_user["role"] == "admin":
            return current_user
        if current_user["id"] != resource_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to access this resource"
            )
        return current_user
    return dependency

def require_assigned_agent(errand_getter: Callable):
    """
    Decorator for endpoints that require the current user to be the assigned agent
    Usage: @require_assigned_agent(lambda: errand_id)
    """
    async def decorator(current_user: dict = Depends(get_current_user)):
        # This is a factory that returns a dependency
        # The actual implementation would need the errand_id from the route
        pass
    return decorator