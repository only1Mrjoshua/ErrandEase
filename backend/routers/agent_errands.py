from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId
import logging

from database import errands_collection, users_collection, agent_profiles_collection
from core.roles import require_verified_agent, require_active_agent
from models.errand import Errand
from schemas.agent import (
    AgentErrandResponse, AvailableErrandResponse, AssignedErrandResponse,
    AgentAcceptResponse, AgentEarningsResponse,
)

router = APIRouter(prefix="/api/agent/errands", tags=["agent errands"])
logger = logging.getLogger(__name__)

# ==================== HELPER FUNCTIONS ====================

def serialize_errand(errand_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MongoDB document to API response"""
    if errand_doc:
        errand_doc["id"] = str(errand_doc.pop("_id"))
    return errand_doc

def validate_object_id(id_str: str) -> bool:
    """Validate MongoDB ObjectId format"""
    try:
        ObjectId(id_str)
        return True
    except:
        return False

async def get_customer_name(customer_id: str) -> str:
    """Get customer name from user_id"""
    try:
        user = users_collection.find_one({"_id": ObjectId(customer_id)})
        if user:
            return user.get("name", "Customer")
        return "Customer"
    except Exception as e:
        logger.error(f"Error getting customer name: {e}")
        return "Customer"

def validate_status_transition(current_status: str, new_status: str, role: str) -> bool:
    """
    Validate if status transition is allowed
    Returns True if transition is valid
    """
    # Allowed transitions for agents
    agent_transitions = {
        "pending": ["accepted"],
        "accepted": ["in_progress", "cancelled"],
        "in_progress": ["awaiting_confirmation"],  # CHANGED: Now goes to awaiting_confirmation
    }
    
    # Allowed transitions for customers
    customer_transitions = {
        "pending": ["cancelled"],
        "awaiting_confirmation": ["completed", "in_progress"],  # NEW: Customer can confirm or reject
    }
    
    if role == "agent":
        return new_status in agent_transitions.get(current_status, [])
    elif role == "customer":
        return new_status in customer_transitions.get(current_status, [])
    
    return False

# ==================== ROUTES ====================

@router.get("/available", response_model=List[AvailableErrandResponse])
async def get_available_errands(
    current_user: dict = Depends(require_verified_agent),
    limit: int = Query(50, ge=1, le=100)
):
    """
    Get all errands available for agents to accept
    Security: Only verified agents can access, only pending unassigned errands returned
    """
    if errands_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )
    
    # Query for pending errands with no assigned agent
    query = {
        "status": "pending",
        "assigned_agent_id": None
    }
    
    try:
        cursor = errands_collection.find(query).sort([
            ("created_at", -1)
        ]).limit(limit)
        
        available_errands = []
        for doc in cursor:
            customer_name = await get_customer_name(doc["user_id"])
            doc["id"] = str(doc.pop("_id"))
            available_errands.append({
                "id": doc["id"],
                "title": doc["title"],
                "pickup": doc["pickup"],
                "delivery": doc["delivery"],
                "total_cost": doc["total_cost"],
                "date_requested": doc["date_requested"],
                "customer_name": customer_name
            })
        
        return available_errands
        
    except Exception as e:
        logger.error(f"Error fetching available errands: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch available errands"
        )

@router.get("/assigned", response_model=List[AssignedErrandResponse])
async def get_assigned_errands(
    current_user: dict = Depends(require_active_agent)  # CHANGED: Now uses require_active_agent
):
    """
    Get errands assigned to the current agent
    Security: Only the verified assigned agent can see their errands
    """
    if errands_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )
    
    # Query for errands assigned to this agent and not completed/cancelled
    # Include awaiting_confirmation so agents can see they're waiting for customer
    query = {
        "assigned_agent_id": current_user["id"],
        "status": {"$in": ["accepted", "in_progress", "awaiting_confirmation"]}
    }
    
    try:
        cursor = errands_collection.find(query).sort("accepted_at", -1)
        
        assigned_errands = []
        for doc in cursor:
            customer_name = await get_customer_name(doc["user_id"])
            doc["id"] = str(doc.pop("_id"))
            assigned_errands.append({
                "id": doc["id"],
                "title": doc["title"],
                "pickup": doc["pickup"],
                "delivery": doc["delivery"],
                "total_cost": doc["total_cost"],
                "status": doc["status"],
                "customer_name": customer_name,
                "accepted_at": doc.get("accepted_at")
            })
        
        return assigned_errands
        
    except Exception as e:
        logger.error(f"Error fetching assigned errands: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch assigned errands"
        )

@router.get("/completed", response_model=List[AssignedErrandResponse])
async def get_completed_errands(
    current_user: dict = Depends(require_active_agent)
):
    """
    Get errands completed by the current agent
    Security: Only the assigned agent can see their completed errands
    """
    if errands_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )
    
    # Query for errands completed by this agent
    query = {
        "assigned_agent_id": current_user["id"],
        "status": "completed"
    }
    
    try:
        cursor = errands_collection.find(query).sort("completed_at", -1).limit(50)
        
        completed_errands = []
        for doc in cursor:
            customer_name = await get_customer_name(doc["user_id"])
            doc["id"] = str(doc.pop("_id"))
            completed_errands.append({
                "id": doc["id"],
                "title": doc["title"],
                "pickup": doc["pickup"],
                "delivery": doc["delivery"],
                "total_cost": doc["total_cost"],
                "status": doc["status"],
                "customer_name": customer_name,
                "accepted_at": doc.get("accepted_at")
            })
        
        return completed_errands
        
    except Exception as e:
        logger.error(f"Error fetching completed errands: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch completed errands"
        )

@router.get("/{errand_id}", response_model=AgentErrandResponse)
async def get_agent_errand_detail(
    errand_id: str,
    current_user: dict = Depends(require_active_agent)
):
    """
    Get detailed information for a specific errand (agent view)
    Security: Only verified agents can view:
    - Available errands (pending, unassigned)
    - Their own assigned errands
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
    
    try:
        # Find errand
        errand = errands_collection.find_one({
            "_id": ObjectId(errand_id)
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
            detail="Errand not found"
        )
    
    # Security check: Verified agents can only view:
    # 1. Available errands (pending, unassigned)
    # 2. Their own assigned errands
    is_available = errand["status"] == "pending" and errand.get("assigned_agent_id") is None
    is_assigned_to_agent = errand.get("assigned_agent_id") == current_user["id"]
    
    if not (is_available or is_assigned_to_agent):
        logger.warning(
            f"Agent {current_user['id']} attempted to access unauthorized errand {errand_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this errand"
        )
    
    # Get customer name
    customer_name = await get_customer_name(errand["user_id"])
    
    # Build response with defaults for missing fields
    errand_dict = dict(errand)
    errand_dict["id"] = str(errand_dict.pop("_id"))
    
    # Add customer info
    errand_dict["customer_name"] = customer_name
    errand_dict["customer_phone"] = None
    
    # Ensure optional fields are present (set to None if missing)
    optional_fields = ["started_at", "completed_at", "completed_by", "accepted_at"]
    for field in optional_fields:
        if field not in errand_dict:
            errand_dict[field] = None
    
    logger.info(f"Verified agent {current_user['id']} viewed errand {errand_id}")
    
    return errand_dict

@router.post("/{errand_id}/accept", response_model=AgentAcceptResponse)
async def accept_errand(
    errand_id: str,
    current_user: dict = Depends(require_verified_agent)
):
    """
    Accept an available errand
    SECURITY CRITICAL: Only verified agents can accept
    Uses atomic MongoDB update to prevent race conditions
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
    
    now = datetime.utcnow()
    
    # ATOMIC UPDATE: Only succeeds if errand is still pending and unassigned
    result = errands_collection.update_one(
        {
            "_id": ObjectId(errand_id),
            "status": "pending",
            "assigned_agent_id": None
        },
        {
            "$set": {
                "status": "accepted",
                "assigned_agent_id": current_user["id"],
                "assigned_agent_name": current_user["name"],
                "accepted_at": now,
                "updated_at": now
            }
        }
    )
    
    if result.matched_count == 0:
        # Check if errand exists but is already taken
        existing = errands_collection.find_one({"_id": ObjectId(errand_id)})
        if existing:
            if existing.get("assigned_agent_id"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This errand has already been accepted by another agent"
                )
            elif existing["status"] != "pending":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot accept errand with status: {existing['status']}"
                )
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Errand not found"
        )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to accept errand"
        )
    
    # Get updated errand
    updated_errand = errands_collection.find_one({"_id": ObjectId(errand_id)})
    customer_name = await get_customer_name(updated_errand["user_id"])
    
    logger.info(
        f"Verified agent {current_user['id']} accepted errand {errand_id}"
    )
    
    # Prepare response
    updated_errand["id"] = str(updated_errand.pop("_id"))
    response_errand = {
        **updated_errand,
        "customer_name": customer_name,
        "customer_phone": None
    }
    
    return AgentAcceptResponse(
        message="Errand accepted successfully",
        errand=response_errand
    )

@router.post("/{errand_id}/start", response_model=AgentErrandResponse)
async def start_errand(
    errand_id: str,
    current_user: dict = Depends(require_verified_agent)
):
    """
    Start an accepted errand (move to in_progress)
    Security: Only the verified assigned agent can start
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
    
    now = datetime.utcnow()
    
    # Atomic update: Only succeeds if errand is accepted and assigned to this agent
    result = errands_collection.update_one(
        {
            "_id": ObjectId(errand_id),
            "assigned_agent_id": current_user["id"],
            "status": "accepted"
        },
        {
            "$set": {
                "status": "in_progress",
                "started_at": now,
                "updated_at": now
            }
        }
    )
    
    if result.matched_count == 0:
        # Check if errand exists but wrong status/agent
        existing = errands_collection.find_one({"_id": ObjectId(errand_id)})
        if existing:
            if existing.get("assigned_agent_id") != current_user["id"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not assigned to this errand"
                )
            elif existing["status"] != "accepted":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot start errand with status: {existing['status']}"
                )
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Errand not found"
        )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start errand"
        )
    
    # Get updated errand
    updated_errand = errands_collection.find_one({"_id": ObjectId(errand_id)})
    customer_name = await get_customer_name(updated_errand["user_id"])
    
    logger.info(
        f"Verified agent {current_user['id']} started errand {errand_id}"
    )
    
    updated_errand["id"] = str(updated_errand.pop("_id"))
    return {
        **updated_errand,
        "customer_name": customer_name,
        "customer_phone": None
    }

# CHANGED: Complete endpoint now moves to awaiting_confirmation
@router.post("/{errand_id}/complete", response_model=AgentErrandResponse)
async def complete_errand(
    errand_id: str,
    current_user: dict = Depends(require_verified_agent)
):
    """
    Mark an in-progress errand as awaiting confirmation
    Security: Only the verified assigned agent can mark as complete
    Customer must confirm before it's truly completed
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
    
    now = datetime.utcnow()
    
    # Atomic update: Only succeeds if errand is in_progress and assigned to this agent
    result = errands_collection.update_one(
        {
            "_id": ObjectId(errand_id),
            "assigned_agent_id": current_user["id"],
            "status": "in_progress"
        },
        {
            "$set": {
                "status": "awaiting_confirmation",  # CHANGED: Now goes to awaiting_confirmation
                "updated_at": now
            }
        }
    )
    
    if result.matched_count == 0:
        # Check if errand exists but wrong status/agent
        existing = errands_collection.find_one({"_id": ObjectId(errand_id)})
        if existing:
            if existing.get("assigned_agent_id") != current_user["id"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not assigned to this errand"
                )
            elif existing["status"] != "in_progress":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot mark as complete errand with status: {existing['status']}"
                )
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Errand not found"
        )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to mark errand as complete"
        )
    
    # Get updated errand
    updated_errand = errands_collection.find_one({"_id": ObjectId(errand_id)})
    customer_name = await get_customer_name(updated_errand["user_id"])
    
    logger.info(
        f"Verified agent {current_user['id']} marked errand {errand_id} as awaiting confirmation"
    )
    
    updated_errand["id"] = str(updated_errand.pop("_id"))
    return {
        **updated_errand,
        "customer_name": customer_name,
        "customer_phone": None
    }

@router.get("/earnings/summary", response_model=AgentEarningsResponse)
async def get_earnings_summary(
    current_user: dict = Depends(require_active_agent)
):
    """
    Get earnings summary for the current agent
    Security: Only active agents can see their own earnings
    """
    if errands_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )
    
    # Get completed errands
    completed = list(errands_collection.find({
        "assigned_agent_id": current_user["id"],
        "status": "completed"
    }))
    
    # Get in-progress/accepted errands (pending earnings)
    pending = list(errands_collection.find({
        "assigned_agent_id": current_user["id"],
        "status": {"$in": ["accepted", "in_progress", "awaiting_confirmation"]}
    }))
    
    # Calculate totals
    total_earned = sum(e.get("total_cost", 0) for e in completed)
    pending_earnings = sum(e.get("total_cost", 0) for e in pending)
    completed_count = len(completed)
    
    # Calculate this week's earnings
    week_ago = datetime.utcnow() - timedelta(days=7)
    this_week = sum(
        e.get("total_cost", 0) 
        for e in completed 
        if e.get("completed_at", datetime.min) >= week_ago
    )
    
    # Calculate this month's earnings
    month_ago = datetime.utcnow() - timedelta(days=30)
    this_month = sum(
        e.get("total_cost", 0) 
        for e in completed 
        if e.get("completed_at", datetime.min) >= month_ago
    )
    
    return AgentEarningsResponse(
        total_earned=total_earned,
        pending_earnings=pending_earnings,
        completed_count=completed_count,
        average_per_errand=round(total_earned / completed_count) if completed_count > 0 else 0,
        this_week=this_week,
        this_month=this_month
    )