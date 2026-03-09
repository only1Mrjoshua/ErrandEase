from fastapi import Depends, HTTPException, status
from functools import wraps
from typing import Callable
import logging

from core.security import get_current_user

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

# Specific role dependencies for convenience
require_agent = require_role("agent")
require_customer = require_role("customer")
require_admin = require_role("admin")

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