from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import List, Dict, Any
from datetime import datetime
from bson import ObjectId
import logging

from database import agent_profiles_collection, users_collection
from core.roles import require_admin
from core.cloudinary_utils import delete_from_cloudinary

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

def serialize_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MongoDB document to API response"""
    if profile:
        profile["id"] = str(profile.pop("_id"))
    return profile

@router.get("/agents/pending")
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

@router.get("/agents/all")
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

@router.get("/agents/{agent_id}")
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

# Optional: Add endpoint to delete agent files from Cloudinary if needed
@router.post("/agents/{agent_id}/delete-files")
async def delete_agent_files(
    agent_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Delete agent's uploaded files from Cloudinary
    Admin only - useful for cleanup
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
    
    # Note: Cloudinary deletion would need public_ids
    # This is optional and requires storing public_ids
    return {"message": "This endpoint requires storing public_ids first"}

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

# Add to admin_agents.py

@router.post("/agents/{agent_id}/unblock")
async def unblock_agent(
    agent_id: str,
    reason: str = Body(..., embed=True),
    current_user: dict = Depends(require_admin)
):
    """
    Unblock a previously blocked agent
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
                "account_status": "active",
                "updated_at": now
            },
            "$unset": {
                "blocked_reason": "",
                "blocked_at": "",
                "blocked_by": ""
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unblock agent"
        )
    
    logger.info(f"Admin {current_user['id']} unblocked agent {agent_id}: {reason}")
    
    return {"message": "Agent unblocked successfully"}

@router.post("/agents/{agent_id}/appeal")
async def process_appeal(
    agent_id: str,
    decision: str = Body(..., embed=True),  # "approved" or "rejected"
    notes: str = Body(None, embed=True),
    current_user: dict = Depends(require_admin)
):
    """
    Process an agent's appeal against blocking
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
    update_data = {
        "appeal_status": decision,
        "updated_at": now
    }
    
    if decision == "approved":
        update_data["account_status"] = "active"
    
    result = agent_profiles_collection.update_one(
        {"_id": ObjectId(agent_id)},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process appeal"
        )
    
    logger.info(f"Admin {current_user['id']} processed appeal for agent {agent_id}: {decision}")
    
    return {"message": f"Appeal {decision} successfully"}