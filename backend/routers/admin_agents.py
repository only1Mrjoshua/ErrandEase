from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import List, Dict, Any
from datetime import datetime
from bson import ObjectId
import logging

from database import agent_profiles_collection, users_collection
from core.roles import require_admin
from schemas.agent import AgentProfileResponse

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

def serialize_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MongoDB document to API response"""
    if profile:
        profile["id"] = str(profile.pop("_id"))
    return profile

@router.get("/agents/pending", response_model=List[AgentProfileResponse])
async def get_pending_agents(current_user: dict = Depends(require_admin)):
    """
    Get all agents with pending verification
    Admin only
    """
    cursor = agent_profiles_collection.find({
        "verification_status": "pending"
    }).sort("verification_submitted_at", 1)  # Oldest first
    
    agents = []
    for doc in cursor:
        agents.append(serialize_profile(doc))
    
    return agents

@router.get("/agents/all", response_model=List[AgentProfileResponse])
async def get_all_agents(
    current_user: dict = Depends(require_admin),
    limit: int = 100,
    skip: int = 0
):
    """
    Get all agents with pagination
    Admin only
    """
    cursor = agent_profiles_collection.find().sort("created_at", -1).skip(skip).limit(limit)
    
    agents = []
    for doc in cursor:
        agents.append(serialize_profile(doc))
    
    return agents

@router.get("/agents/{agent_id}", response_model=AgentProfileResponse)
async def get_agent_profile(
    agent_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Get specific agent profile by ID
    Admin only
    """
    try:
        profile = agent_profiles_collection.find_one({"_id": ObjectId(agent_id)})
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent ID format"
        )
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )
    
    return serialize_profile(profile)

@router.post("/agents/{agent_id}/approve")
async def approve_agent(
    agent_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Approve agent verification
    Admin only
    """
    try:
        profile = agent_profiles_collection.find_one({"_id": ObjectId(agent_id)})
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent ID format"
        )
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )
    
    now = datetime.utcnow()
    result = agent_profiles_collection.update_one(
        {"_id": ObjectId(agent_id)},
        {
            "$set": {
                "verification_status": "approved",
                "id_verified": True,
                "verification_reviewed_at": now,
                "verification_reviewed_by": current_user["id"],
                "updated_at": now
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to approve agent"
        )
    
    logger.info(f"Admin {current_user['id']} approved agent {agent_id}")
    
    return {"message": "Agent approved successfully"}

@router.post("/agents/{agent_id}/reject")
async def reject_agent(
    agent_id: str,
    reason: str = Body(..., embed=True),
    current_user: dict = Depends(require_admin)
):
    """
    Reject agent verification with reason
    Admin only
    """
    try:
        profile = agent_profiles_collection.find_one({"_id": ObjectId(agent_id)})
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent ID format"
        )
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )
    
    now = datetime.utcnow()
    result = agent_profiles_collection.update_one(
        {"_id": ObjectId(agent_id)},
        {
            "$set": {
                "verification_status": "rejected",
                "id_verified": False,
                "verification_rejection_reason": reason,
                "verification_reviewed_at": now,
                "verification_reviewed_by": current_user["id"],
                "updated_at": now
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reject agent"
        )
    
    logger.info(f"Admin {current_user['id']} rejected agent {agent_id}: {reason}")
    
    return {"message": "Agent rejected successfully", "reason": reason}

@router.get("/stats/agents")
async def get_agent_stats(current_user: dict = Depends(require_admin)):
    """
    Get agent statistics
    Admin only
    """
    total = agent_profiles_collection.count_documents({})
    pending = agent_profiles_collection.count_documents({"verification_status": "pending"})
    approved = agent_profiles_collection.count_documents({"verification_status": "approved"})
    rejected = agent_profiles_collection.count_documents({"verification_status": "rejected"})
    not_submitted = agent_profiles_collection.count_documents({"verification_status": "not_submitted"})
    
    return {
        "total": total,
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "not_submitted": not_submitted
    }