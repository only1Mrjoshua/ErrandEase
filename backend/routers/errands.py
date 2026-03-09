from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Dict, Any
from datetime import datetime
from bson import ObjectId
import logging

from database import errands_collection
from core.security import get_current_user
from models.errand import Errand
from schemas.errand import ErrandCreate, ErrandResponse, ErrandListResponse

router = APIRouter(prefix="/api/errands", tags=["errands"])
logger = logging.getLogger(__name__)

# ==================== HELPER FUNCTIONS ====================

def calculate_costs(budget: int) -> Dict[str, int]:
    """
    Calculate service fee and total cost
    Always done on backend - NEVER trust client calculations
    """
    service_fee = max(200, round(budget * 0.1))  # 10% fee, minimum ₦200
    total_cost = budget + service_fee
    return {
        "service_fee": service_fee,
        "total_cost": total_cost
    }

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

# ==================== ROUTES ====================

@router.post("", response_model=ErrandResponse, status_code=status.HTTP_201_CREATED)
async def create_errand(
    errand_data: ErrandCreate,
    current_user: Dict = Depends(get_current_user)
):
    """
    Create a new errand request
    - Only authenticated users can create
    - user_id is taken from JWT, never from request body
    - Costs are calculated on backend
    """
    # Validate user role
    if current_user["role"] != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can create errands"
        )
    
    # Check database availability
    if errands_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )
    
    # Calculate costs on backend
    costs = calculate_costs(errand_data.budget)
    
    now = datetime.utcnow()
    
    # Create errand document
    errand = Errand(
        user_id=current_user["id"],
        title=errand_data.title.strip(),
        description=errand_data.description.strip() if errand_data.description else "",
        pickup=errand_data.pickup.strip(),
        delivery=errand_data.delivery.strip(),
        preferred_time=errand_data.preferred_time,
        budget=errand_data.budget,
        service_fee=costs["service_fee"],
        total_cost=costs["total_cost"],
        status="pending",  # Always start as pending
        date_requested=now,
        created_at=now,
        updated_at=now
    )
    
    # Convert to dict for MongoDB
    errand_dict = errand.model_dump(by_alias=True, exclude={"id"})
    
    try:
        result = errands_collection.insert_one(errand_dict)
        created_errand = errands_collection.find_one({"_id": result.inserted_id})
        
        logger.info(f"Errand created: {result.inserted_id} by user: {current_user['id']}")
        return serialize_errand(created_errand)
        
    except Exception as e:
        logger.error(f"Failed to create errand: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create errand"
        )

@router.get("", response_model=List[ErrandListResponse])
async def get_errands(
    scope: str = Query("ongoing", regex="^(ongoing|history)$"),
    current_user: Dict = Depends(get_current_user)
):
    """
    Get user's errands filtered by scope:
    - ongoing: pending, accepted, in_progress
    - history: completed, cancelled
    """
    if errands_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )
    
    # Define status filters
    status_filters = {
        "ongoing": ["pending", "accepted", "in_progress"],
        "history": ["completed", "cancelled"]
    }
    
    # Build query with user isolation
    query = {
        "user_id": current_user["id"],
        "status": {"$in": status_filters[scope]}
    }
    
    try:
        # Sort by most recent first
        cursor = errands_collection.find(query).sort("created_at", -1)
        
        errands = []
        for doc in cursor:
            doc["id"] = str(doc.pop("_id"))
            errands.append(doc)
        
        return errands
        
    except Exception as e:
        logger.error(f"Error fetching errands: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch errands"
        )

@router.get("/{errand_id}", response_model=ErrandResponse)
async def get_errand_detail(
    errand_id: str,
    current_user: Dict = Depends(get_current_user)
):
    """
    Get detailed information for a specific errand
    Strict ownership check - users can only see their own errands
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
        # Find errand with ownership check in query
        errand = errands_collection.find_one({
            "_id": ObjectId(errand_id),
            "user_id": current_user["id"]  # Built-in ownership check
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
    
    return serialize_errand(errand)

@router.patch("/{errand_id}/cancel", response_model=ErrandResponse)
async def cancel_errand(
    errand_id: str,
    current_user: Dict = Depends(get_current_user)
):
    """
    Cancel a pending errand
    Separate endpoint for clarity and security
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
        # Find errand and check ownership in one query
        errand = errands_collection.find_one({
            "_id": ObjectId(errand_id),
            "user_id": current_user["id"]
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
    
    # Check if errand can be cancelled (only pending errands)
    if errand["status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel errand with status: {errand['status']}"
        )
    
    # Update status
    now = datetime.utcnow()
    try:
        result = errands_collection.update_one(
            {"_id": ObjectId(errand_id)},
            {
                "$set": {
                    "status": "cancelled",
                    "updated_at": now
                }
            }
        )
        
        if result.modified_count == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to cancel errand"
            )
        
        # Return updated errand
        updated_errand = errands_collection.find_one({"_id": ObjectId(errand_id)})
        logger.info(f"Errand cancelled: {errand_id} by user: {current_user['id']}")
        
        return serialize_errand(updated_errand)
        
    except Exception as e:
        logger.error(f"Error cancelling errand: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel errand"
        )