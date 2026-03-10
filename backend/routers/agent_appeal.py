from fastapi import APIRouter, Depends, HTTPException, status, Body
from datetime import datetime
from bson import ObjectId
import logging
import uuid

from database import agent_profiles_collection, appeals_collection
from core.roles import require_agent
from schemas.agent import AppealSubmitRequest, AppealResponse

router = APIRouter(prefix="/api/agent", tags=["agent appeal"])
logger = logging.getLogger(__name__)

@router.post("/appeal/submit")
async def submit_appeal(
    appeal_data: dict = Body(...),
    current_user: dict = Depends(require_agent)
):
    """
    Submit an appeal when account is blocked
    """
    subject = appeal_data.get("subject")
    message = appeal_data.get("message")
    
    if not subject or not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject and message are required"
        )
    
    if len(message) < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Appeal message must be at least 50 characters"
        )
    
    # Get agent profile
    profile = agent_profiles_collection.find_one({"user_id": current_user["id"]})
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent profile not found"
        )
    
    # Check if already have pending appeal
    existing_appeal = appeals_collection.find_one({
        "agent_id": current_user["id"],
        "status": "pending"
    })
    
    if existing_appeal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have a pending appeal"
        )
    
    # Create appeal
    now = datetime.utcnow()
    appeal = {
        "appeal_id": str(uuid.uuid4()),
        "agent_id": current_user["id"],
        "agent_name": current_user.get("name", "Unknown"),
        "agent_email": current_user.get("email", ""),
        "subject": subject,
        "message": message,
        "status": "pending",
        "blocked_reason": profile.get("blocked_reason"),
        "blocked_at": profile.get("blocked_at"),
        "created_at": now,
        "updated_at": now
    }
    
    result = appeals_collection.insert_one(appeal)
    
    # Update agent profile with appeal info
    agent_profiles_collection.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "appeal_status": "pending",
                "appeal_submitted_at": now,
                "appeal_message": message,
                "updated_at": now
            }
        }
    )
    
    logger.info(f"Appeal submitted for agent {current_user['id']}")
    
    return {
        "message": "Appeal submitted successfully",
        "appeal_id": appeal["appeal_id"],
        "status": "pending"
    }

@router.get("/appeal/status")
async def get_appeal_status(current_user: dict = Depends(require_agent)):
    """
    Get status of current appeal
    """
    appeal = appeals_collection.find_one({
        "agent_id": current_user["id"]
    }).sort("created_at", -1)
    
    if not appeal:
        return {
            "has_appeal": False,
            "status": None
        }
    
    appeal["id"] = str(appeal.pop("_id"))
    return {
        "has_appeal": True,
        "status": appeal.get("status"),
        "submitted_at": appeal.get("created_at"),
        "reviewed_at": appeal.get("reviewed_at"),
        "decision": appeal.get("decision"),
        "admin_notes": appeal.get("admin_notes")
    }