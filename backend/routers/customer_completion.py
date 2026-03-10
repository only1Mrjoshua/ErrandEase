from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import Dict, Any
from datetime import datetime
from bson import ObjectId
import logging

from database import errands_collection, agent_profiles_collection
from core.roles import require_customer
from core.security import get_current_user
from schemas.errand import CompletionConfirmRequest, CompletionConfirmResponse

router = APIRouter(prefix="/api/customer/errands", tags=["customer completion"])
logger = logging.getLogger(__name__)

def validate_object_id(id_str: str) -> bool:
    """Validate MongoDB ObjectId format"""
    try:
        ObjectId(id_str)
        return True
    except:
        return False

@router.post("/{errand_id}/confirm-completion", response_model=CompletionConfirmResponse)
async def confirm_errand_completion(
    errand_id: str,
    confirmation: CompletionConfirmRequest,
    current_user: dict = Depends(require_customer)
):
    """
    Customer confirms or rejects errand completion
    - If confirmed: errand marked as completed, agent gets paid
    - If rejected: agent account is blocked for fraud, errand returns to in_progress
    """
    if errands_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )
    
    # Validate ObjectId format
    if not validate_object_id(errand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid errand ID format"
        )
    
    # Find errand and verify ownership
    try:
        errand = errands_collection.find_one({
            "_id": ObjectId(errand_id),
            "user_id": current_user["id"]  # Customer must own this errand
        })
    except Exception as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error"
        )
    
    if not errand:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Errand not found or you don't have permission"
        )
    
    # Verify errand is awaiting confirmation
    if errand["status"] != "awaiting_confirmation":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm errand with status: {errand['status']}"
        )
    
    now = datetime.utcnow()
    agent_id = errand.get("assigned_agent_id")
    
    # CASE 1: Customer confirms completion (legitimate)
    if confirmation.confirmed:
        result = errands_collection.update_one(
            {"_id": ObjectId(errand_id)},
            {
                "$set": {
                    "status": "completed",
                    "completed_at": now,
                    "date_completed": now,
                    "completion_confirmed_at": now,
                    "updated_at": now
                }
            }
        )
        
        if result.modified_count == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to confirm completion"
            )
        
        logger.info(f"Customer {current_user['id']} confirmed completion of errand {errand_id}")
        
        return CompletionConfirmResponse(
            message="Errand completion confirmed. Thank you!",
            errand_status="completed",
            agent_blocked=False
        )
    
    # CASE 2: Customer rejects completion (potential fraud)
    else:
        # Validate rejection reason
        if not confirmation.rejection_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rejection reason is required when reporting incomplete errands"
            )
        
        # Start a session for atomic operations (if supported)
        # For MongoDB, we'll do sequential updates with error handling
        
        # 1. Block the agent account
        if agent_id:
            agent_update = agent_profiles_collection.update_one(
                {"user_id": agent_id},
                {
                    "$set": {
                        "account_status": "blocked",
                        "blocked_at": now,
                        "blocked_reason": f"Fraud reported by customer: {confirmation.rejection_reason}",
                        "blocked_by": "system",
                        "updated_at": now
                    }
                }
            )
            
            if agent_update.modified_count == 0:
                logger.error(f"Failed to block agent {agent_id} for fraud")
                # Continue anyway - we'll still revert the errand
        
        # 2. Revert errand status back to in_progress
        errand_result = errands_collection.update_one(
            {"_id": ObjectId(errand_id)},
            {
                "$set": {
                    "status": "in_progress",
                    "completion_rejected_at": now,
                    "rejection_reason": confirmation.rejection_reason,
                    "updated_at": now
                }
            }
        )
        
        if errand_result.modified_count == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process rejection"
            )
        
        logger.warning(
            f"Customer {current_user['id']} rejected completion of errand {errand_id}. "
            f"Agent {agent_id} has been blocked. Reason: {confirmation.rejection_reason}"
        )
        
        return CompletionConfirmResponse(
            message="We've recorded your report. The agent has been blocked and our team will investigate.",
            errand_status="in_progress",
            agent_blocked=True
        )

@router.get("/pending-confirmation")
async def get_pending_confirmations(current_user: dict = Depends(require_customer)):
    """
    Get all errands awaiting customer confirmation
    """
    if errands_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )
    
    try:
        cursor = errands_collection.find({
            "user_id": current_user["id"],
            "status": "awaiting_confirmation"
        }).sort("updated_at", -1)
        
        pending = []
        for doc in cursor:
            doc["id"] = str(doc.pop("_id"))
            pending.append({
                "id": doc["id"],
                "title": doc["title"],
                "description": doc.get("description", ""),
                "pickup": doc["pickup"],
                "delivery": doc["delivery"],
                "total_cost": doc["total_cost"],
                "assigned_agent_name": doc.get("assigned_agent_name", "Agent"),
                "updated_at": doc["updated_at"]
            })
        
        return pending
        
    except Exception as e:
        logger.error(f"Error fetching pending confirmations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch pending confirmations"
        )